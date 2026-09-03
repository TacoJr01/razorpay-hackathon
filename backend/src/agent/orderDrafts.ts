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
  /** null = not yet decided, true = buyer confirmed, false = buyer declined */
  confirmed: boolean | null;
  executed: boolean;
  createdAt: string;
  /** A negotiated quote is only valid for this long - executePlacement re-checks it. */
  expiresAt: string;
}

const TTL_SECONDS = 60 * 60 * 24; // 1 day - long enough to outlive any single demo session

function key(id: string): string {
  return `b2b-agent:draft:${id}`;
}

export async function createDraft(
  input: Omit<OrderDraftRecord, 'id' | 'createdAt' | 'executed' | 'confirmed' | 'expiresAt'>,
): Promise<OrderDraftRecord> {
  const record: OrderDraftRecord = {
    ...input,
    id: nanoid(10),
    confirmed: input.gateTriggered ? null : true,
    executed: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + BOUND_CONFIG.QUOTE_TTL_MINUTES * 60_000).toISOString(),
  };
  await redis.set(key(record.id), JSON.stringify(record), 'EX', TTL_SECONDS);
  return record;
}

export async function getDraft(id: string): Promise<OrderDraftRecord | undefined> {
  const raw = await redis.get(key(id));
  return raw ? (JSON.parse(raw) as OrderDraftRecord) : undefined;
}

export async function setConfirmation(id: string, confirmed: boolean): Promise<OrderDraftRecord | undefined> {
  const record = await getDraft(id);
  if (!record) return undefined;
  record.confirmed = confirmed;
  await redis.set(key(id), JSON.stringify(record), 'EX', TTL_SECONDS);
  return record;
}

export async function markExecuted(id: string): Promise<void> {
  const record = await getDraft(id);
  if (!record) return;
  record.executed = true;
  await redis.set(key(id), JSON.stringify(record), 'EX', TTL_SECONDS);
}
