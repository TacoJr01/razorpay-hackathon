import { nanoid } from 'nanoid';
import { BOUND_CONFIG, type OrderItem } from '@b2b-agent/shared';
import { redis } from '../redis/client.js';

export interface OrderDraftRecord {
  id: string;
  buyerId: string;
  items: OrderItem[];
  total: number;
  boundsPassed: boolean;
  boundFailureReasons: string[];
  gateTriggered: boolean;
  gateReason: string;
  /** null = not yet decided, true = merchant approved, false = merchant rejected */
  confirmed: boolean | null;
  /** Merchant identity that resolved a gated draft (username or Google email). Null until resolved. */
  resolvedBy: string | null;
  resolvedAt: string | null;
  executed: boolean;
  createdAt: string;
  /** A negotiated quote is only valid for this long - executePlacement re-checks it. Refreshed on approval so a slow merchant review doesn't kill an otherwise-fine order. */
  expiresAt: string;
}

const TTL_SECONDS = 60 * 60 * 24; // 1 day - long enough to outlive any single demo session
const PENDING_APPROVALS_KEY = 'b2b-agent:pending-approvals';

function key(id: string): string {
  return `b2b-agent:draft:${id}`;
}

export async function createDraft(
  input: Omit<OrderDraftRecord, 'id' | 'createdAt' | 'executed' | 'confirmed' | 'resolvedBy' | 'resolvedAt' | 'expiresAt'>,
): Promise<OrderDraftRecord> {
  const record: OrderDraftRecord = {
    ...input,
    id: nanoid(10),
    confirmed: input.gateTriggered ? null : true,
    resolvedBy: null,
    resolvedAt: null,
    executed: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + BOUND_CONFIG.QUOTE_TTL_MINUTES * 60_000).toISOString(),
  };
  await redis.set(key(record.id), JSON.stringify(record), 'EX', TTL_SECONDS);
  if (record.gateTriggered) {
    await redis.sadd(PENDING_APPROVALS_KEY, record.id);
  }
  return record;
}

export async function getDraft(id: string): Promise<OrderDraftRecord | undefined> {
  const raw = await redis.get(key(id));
  return raw ? (JSON.parse(raw) as OrderDraftRecord) : undefined;
}

export type ResolveDraftResult =
  | { success: true; draft: OrderDraftRecord }
  | { success: false; reason: 'not_found' | 'already_resolved' };

/**
 * Records a merchant's approve/reject decision on a gated draft. Guards
 * against resolving the same draft twice (e.g. a double-click, or two
 * merchant tabs) - this narrows but doesn't fully close the race, since the
 * Redis read-then-write here isn't atomic, but it stops the obvious case.
 * Also refreshes expiresAt: the 15-minute window exists to catch a stale
 * *price*, not to time out an approval queue, so a merchant reviewing after
 * that window shouldn't have the order rejected as "expired" for that reason
 * alone - executePlacement still independently re-verifies price/stock.
 */
export async function resolveDraft(id: string, confirmed: boolean, resolvedBy: string): Promise<ResolveDraftResult> {
  const record = await getDraft(id);
  if (!record) return { success: false, reason: 'not_found' };
  if (record.confirmed !== null) return { success: false, reason: 'already_resolved' };

  record.confirmed = confirmed;
  record.resolvedBy = resolvedBy;
  record.resolvedAt = new Date().toISOString();
  record.expiresAt = new Date(Date.now() + BOUND_CONFIG.QUOTE_TTL_MINUTES * 60_000).toISOString();
  await redis.set(key(id), JSON.stringify(record), 'EX', TTL_SECONDS);
  await redis.srem(PENDING_APPROVALS_KEY, id);
  return { success: true, draft: record };
}

export async function listPendingApprovalIds(): Promise<string[]> {
  return redis.smembers(PENDING_APPROVALS_KEY);
}

/** Drops an id from the pending-approvals index without touching the draft itself - used to self-heal ids left behind by a draft that aged out of Redis before it was reviewed. */
export async function removePendingApprovalId(id: string): Promise<void> {
  await redis.srem(PENDING_APPROVALS_KEY, id);
}

export async function markExecuted(id: string): Promise<void> {
  const record = await getDraft(id);
  if (!record) return;
  record.executed = true;
  await redis.set(key(id), JSON.stringify(record), 'EX', TTL_SECONDS);
}
