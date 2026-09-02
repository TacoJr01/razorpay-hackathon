import { EventEmitter } from 'node:events';
import { db } from '../db/client.js';
import { auditEntries } from '../db/schema.js';
import { desc, asc } from 'drizzle-orm';
import type { AuditEntry, BoundName, BoundResult, ChainVerificationResult } from '@b2b-agent/shared';
import { GENESIS_HASH, computeEntryHash } from './hashChain.js';

/** Live subscribers (SSE connections) get notified whenever a new entry is appended. */
export const auditEvents = new EventEmitter();
auditEvents.setMaxListeners(50);

export interface AppendAuditInput {
  actionType: string;
  description: string;
  boundChecked: BoundName;
  boundResult: BoundResult;
  gateTriggered: boolean;
  gateConfirmed?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

function rowToEntry(row: typeof auditEntries.$inferSelect): AuditEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    actionType: row.actionType,
    description: row.description,
    boundChecked: row.boundChecked as BoundName,
    boundResult: row.boundResult as BoundResult,
    gateTriggered: row.gateTriggered,
    gateConfirmed: row.gateConfirmed,
    metadata: row.metadata,
    prevHash: row.prevHash,
    hash: row.hash,
  };
}

/**
 * Appends one entry to the tamper-evident audit log. This is the ONLY write
 * path into audit_entries - every bound check, gate decision, quote, and
 * order placement in the agent loop calls through here, never raw inserts.
 */
export function appendAuditEntry(input: AppendAuditInput): AuditEntry {
  const [lastRow] = db.select().from(auditEntries).orderBy(desc(auditEntries.id)).limit(1).all();
  const prevHash = lastRow ? lastRow.hash : GENESIS_HASH;
  const timestamp = new Date().toISOString();

  const hash = computeEntryHash({
    timestamp,
    actionType: input.actionType,
    description: input.description,
    boundChecked: input.boundChecked,
    boundResult: input.boundResult,
    gateTriggered: input.gateTriggered,
    gateConfirmed: input.gateConfirmed ?? null,
    metadata: input.metadata ?? null,
    prevHash,
  });

  const [inserted] = db
    .insert(auditEntries)
    .values({
      timestamp,
      actionType: input.actionType,
      description: input.description,
      boundChecked: input.boundChecked,
      boundResult: input.boundResult,
      gateTriggered: input.gateTriggered,
      gateConfirmed: input.gateConfirmed ?? null,
      metadata: input.metadata ?? null,
      prevHash,
      hash,
    })
    .returning()
    .all();

  const entry = rowToEntry(inserted);
  auditEvents.emit('entry', entry);
  return entry;
}

export function listAuditEntries(limit = 200): AuditEntry[] {
  return db
    .select()
    .from(auditEntries)
    .orderBy(asc(auditEntries.id))
    .limit(limit)
    .all()
    .map(rowToEntry);
}

/**
 * Recomputes the hash of every entry in id order and compares it against
 * what's stored, and checks each entry's prev_hash matches the previous
 * entry's stored hash. Any edited/deleted/reordered row breaks the chain
 * at that point.
 */
export function verifyChain(): ChainVerificationResult {
  const rows = db.select().from(auditEntries).orderBy(asc(auditEntries.id)).all();

  let expectedPrevHash = GENESIS_HASH;
  for (const row of rows) {
    if (row.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        checkedCount: rows.length,
        brokenAtId: row.id,
        reason: `Entry ${row.id} has prev_hash ${row.prevHash.slice(0, 12)}... but the previous entry's hash was ${expectedPrevHash.slice(0, 12)}...`,
      };
    }

    const recomputed = computeEntryHash({
      timestamp: row.timestamp,
      actionType: row.actionType,
      description: row.description,
      boundChecked: row.boundChecked as BoundName,
      boundResult: row.boundResult as BoundResult,
      gateTriggered: row.gateTriggered,
      gateConfirmed: row.gateConfirmed,
      metadata: row.metadata,
      prevHash: row.prevHash,
    });

    if (recomputed !== row.hash) {
      return {
        valid: false,
        checkedCount: rows.length,
        brokenAtId: row.id,
        reason: `Entry ${row.id}'s stored hash does not match its recomputed hash - its content was modified after the fact.`,
      };
    }

    expectedPrevHash = row.hash;
  }

  return { valid: true, checkedCount: rows.length, brokenAtId: null, reason: null };
}
