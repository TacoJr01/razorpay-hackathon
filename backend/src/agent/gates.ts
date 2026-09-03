import type { OrderDraft } from '@b2b-agent/shared';

export interface GateLimits {
  valueLimit: number;
  qtyLimit: number;
}

export interface GateCheck {
  gateTriggered: boolean;
  reason: string;
}

/**
 * Gate check: distinct from a bound. A bound is a hard block with no
 * override. A gate is a hold - the order is legal and within all bounds,
 * but it's large enough (relative to this buyer's own computed limits,
 * see trust.ts) that it must not fire automatically. The route handler
 * (routes/chat.ts / routes/orders.ts) uses this to decide whether to pause
 * and wait for an explicit `confirm` action from the UI before calling
 * Razorpay. This function stays pure and synchronous - no I/O - the caller
 * (actions.ts) does the async work (trust lookup, GSTIN lookup) and passes
 * plain data in, the same discipline as bounds.ts.
 *
 * `gstinOnFile` is a separate, trust-independent condition: a compliance
 * requirement that a raised trust ceiling can never waive.
 */
export function checkGate(draft: OrderDraft, limits: GateLimits, gstinOnFile: boolean, gstRequiredAbove: number): GateCheck {
  const reasons: string[] = [];

  if (draft.total > limits.valueLimit) {
    reasons.push(`order total ₹${draft.total} exceeds this buyer's auto-approval limit of ₹${limits.valueLimit}`);
  }

  const oversizedLine = draft.items.find((item) => item.quantity > limits.qtyLimit);
  if (oversizedLine) {
    reasons.push(
      `line "${oversizedLine.productName}" quantity ${oversizedLine.quantity} exceeds this buyer's auto-approval limit of ${limits.qtyLimit} units`,
    );
  }

  if (draft.total > gstRequiredAbove && !gstinOnFile) {
    reasons.push(`order total ₹${draft.total} exceeds ₹${gstRequiredAbove} and no valid GSTIN is on file for this buyer`);
  }

  if (reasons.length === 0) {
    return { gateTriggered: false, reason: 'Order is within this buyer\'s auto-approval limits; no confirmation required.' };
  }

  return {
    gateTriggered: true,
    reason: `Requires explicit buyer confirmation before placing: ${reasons.join('; ')}.`,
  };
}
