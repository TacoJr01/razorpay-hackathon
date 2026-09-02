import { createHash } from 'node:crypto';
import type { BoundName, BoundResult } from '@b2b-agent/shared';

export const GENESIS_HASH = '0'.repeat(64);

export interface HashableEntry {
  timestamp: string;
  actionType: string;
  description: string;
  boundChecked: BoundName;
  boundResult: BoundResult;
  gateTriggered: boolean;
  gateConfirmed: boolean | null;
  metadata: Record<string, unknown> | null;
  prevHash: string;
}

/**
 * Deterministically hashes an audit entry together with the hash of the
 * entry before it. This is the "chain" - changing any historical field
 * (description, bound result, timestamp, ...) changes that entry's hash,
 * which changes every subsequent hash, which `verifyChain` will detect.
 *
 * Deliberately does NOT include the row's own `id`: the id is a DB-assigned
 * autoincrement value we can't know for certain before inserting (SQLite's
 * AUTOINCREMENT counter does not reset on DELETE, so "last id + 1" is only
 * a prediction). Keeping the id out of the hashed payload means we never
 * have to guess it - only content and prev_hash need to match.
 */
export function computeEntryHash(entry: HashableEntry): string {
  const canonical = JSON.stringify({
    timestamp: entry.timestamp,
    actionType: entry.actionType,
    description: entry.description,
    boundChecked: entry.boundChecked,
    boundResult: entry.boundResult,
    gateTriggered: entry.gateTriggered,
    gateConfirmed: entry.gateConfirmed,
    metadata: entry.metadata,
    prevHash: entry.prevHash,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
