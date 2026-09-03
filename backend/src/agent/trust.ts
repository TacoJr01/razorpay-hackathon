import { BOUND_CONFIG, type BuyerLimits } from '@b2b-agent/shared';
import { db } from '../db/client.js';
import { orders } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyChain } from '../audit/auditService.js';

/**
 * A buyer's auto-approve gate ceiling is recomputed fresh from their own
 * order history every time - never a cached or mutable "trust score" a
 * buyer could game once and keep. The ceiling is anchored to what that
 * buyer has actually transacted (largest completed order), not a flat
 * number: farming ten small clean orders does not unlock a large flat
 * ceiling, because the ceiling only ever moves relative to the buyer's own
 * largest completed order. The discount floor (bounds.ts) is never touched
 * here - trust changes gate FRICTION only, never the margin bound itself.
 */
export async function computeBuyerLimits(buyerId: string): Promise<BuyerLimits> {
  const base: BuyerLimits = {
    valueLimit: BOUND_CONFIG.GATE_ORDER_VALUE_INR,
    qtyLimit: BOUND_CONFIG.GATE_QUANTITY_UNITS,
    completedOrders: 0,
    largestOrderValue: 0,
    largestLineQty: 0,
    trustApplied: false,
  };

  // Fail-safe: never extend trust on a ledger that doesn't verify. If the
  // audit chain has been tampered with, every buyer falls back to base limits.
  const chain = verifyChain();
  if (!chain.valid) {
    return base;
  }

  const placed = db
    .select()
    .from(orders)
    .where(and(eq(orders.buyerId, buyerId), eq(orders.status, 'placed')))
    .all();

  if (placed.length < BOUND_CONFIG.GATE_TRUST_MIN_ORDERS) {
    return { ...base, completedOrders: placed.length };
  }

  let largestOrderValue = 0;
  let largestLineQty = 0;
  for (const order of placed) {
    if (order.total > largestOrderValue) largestOrderValue = order.total;
    for (const item of order.items) {
      if (item.quantity > largestLineQty) largestLineQty = item.quantity;
    }
  }

  const valueLimit = Math.min(
    BOUND_CONFIG.GATE_VALUE_ABSOLUTE_CAP_INR,
    Math.max(BOUND_CONFIG.GATE_ORDER_VALUE_INR, BOUND_CONFIG.GATE_TRUST_MULTIPLIER * largestOrderValue),
  );
  const qtyLimit = Math.min(
    BOUND_CONFIG.GATE_QTY_ABSOLUTE_CAP,
    Math.max(BOUND_CONFIG.GATE_QUANTITY_UNITS, BOUND_CONFIG.GATE_TRUST_MULTIPLIER * largestLineQty),
  );

  return {
    valueLimit,
    qtyLimit,
    completedOrders: placed.length,
    largestOrderValue,
    largestLineQty,
    trustApplied: true,
  };
}
