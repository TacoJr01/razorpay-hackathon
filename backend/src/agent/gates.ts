import { BOUND_CONFIG } from '@b2b-agent/shared';
import type { OrderDraft } from '@b2b-agent/shared';

export interface GateCheck {
  gateTriggered: boolean;
  reason: string;
}

/**
 * Gate check: distinct from a bound. A bound is a hard block with no
 * override. A gate is a hold - the order is legal and within all bounds,
 * but it's large enough that it must not fire automatically. The route
 * handler (routes/chat.ts) uses this to decide whether to pause and wait
 * for an explicit `confirm` action from the UI before calling Razorpay.
 */
export function checkGate(draft: OrderDraft): GateCheck {
  const reasons: string[] = [];

  if (draft.total > BOUND_CONFIG.GATE_ORDER_VALUE_INR) {
    reasons.push(
      `order total ₹${draft.total} exceeds the auto-approval limit of ₹${BOUND_CONFIG.GATE_ORDER_VALUE_INR}`,
    );
  }

  const oversizedLine = draft.items.find((item) => item.quantity > BOUND_CONFIG.GATE_QUANTITY_UNITS);
  if (oversizedLine) {
    reasons.push(
      `line "${oversizedLine.productName}" quantity ${oversizedLine.quantity} exceeds the auto-approval limit of ${BOUND_CONFIG.GATE_QUANTITY_UNITS} units`,
    );
  }

  if (reasons.length === 0) {
    return { gateTriggered: false, reason: 'Order is within auto-approval limits; no confirmation required.' };
  }

  return {
    gateTriggered: true,
    reason: `Requires explicit buyer confirmation before placing: ${reasons.join('; ')}.`,
  };
}
