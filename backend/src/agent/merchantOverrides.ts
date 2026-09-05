import { db } from '../db/client.js';
import { buyerOverrides } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export interface BuyerOverride {
  buyerId: string;
  marginPct: number | null;
  gstThresholdInr: number | null;
  updatedAt: string;
}

/**
 * Merchant-negotiated per-buyer terms. Read by the bound/gate pipeline
 * (actions.ts) to resolve the effective margin floor and GSTIN threshold for
 * a given buyer, falling back to the global BOUND_CONFIG defaults when no
 * override (or no field within one) is set. Written ONLY by the
 * merchant-authenticated routes (routes/merchant.ts) - nothing reachable from
 * the buyer's chat session calls setBuyerOverride.
 */
export function getBuyerOverride(buyerId: string): BuyerOverride | null {
  const row = db.select().from(buyerOverrides).where(eq(buyerOverrides.buyerId, buyerId)).get();
  return row ?? null;
}

export function listBuyerOverrides(): BuyerOverride[] {
  return db.select().from(buyerOverrides).all();
}

export function setBuyerOverride(
  buyerId: string,
  fields: { marginPct?: number | null; gstThresholdInr?: number | null },
): BuyerOverride {
  const existing = getBuyerOverride(buyerId);
  const next: BuyerOverride = {
    buyerId,
    marginPct: fields.marginPct !== undefined ? fields.marginPct : (existing?.marginPct ?? null),
    gstThresholdInr: fields.gstThresholdInr !== undefined ? fields.gstThresholdInr : (existing?.gstThresholdInr ?? null),
    updatedAt: new Date().toISOString(),
  };

  db.insert(buyerOverrides)
    .values(next)
    .onConflictDoUpdate({
      target: buyerOverrides.buyerId,
      set: { marginPct: next.marginPct, gstThresholdInr: next.gstThresholdInr, updatedAt: next.updatedAt },
    })
    .run();

  return next;
}
