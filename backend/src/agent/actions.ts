import { getProductById } from '../db/catalog.js';
import { db } from '../db/client.js';
import { orders } from '../db/schema.js';
import { appendAuditEntry } from '../audit/auditService.js';
import { checkCatalogScope, checkDiscountFloor, checkMOQ, checkStock } from './bounds.js';
import { checkGate } from './gates.js';
import { createDraft, getDraft, markExecuted, setConfirmation, type OrderDraftRecord } from './orderDrafts.js';
import { createRazorpayOrder } from '../razorpay/client.js';
import { computeBuyerLimits } from './trust.js';
import { getBuyerGSTIN } from './buyerProfile.js';
import { getBuyerOverride } from './merchantOverrides.js';
import { BOUND_CONFIG, type OrderItem } from '@b2b-agent/shared';

/** Effective per-buyer margin floor: merchant override if set, else the global default. */
function resolveMarginPct(buyerId: string): number {
  return getBuyerOverride(buyerId)?.marginPct ?? BOUND_CONFIG.MIN_MARGIN_PCT;
}

/** Effective per-buyer GSTIN threshold: merchant override if set, else the global default. */
function resolveGstThreshold(buyerId: string): number {
  return getBuyerOverride(buyerId)?.gstThresholdInr ?? BOUND_CONFIG.GST_REQUIRED_ABOVE_INR;
}

export interface RequestedLine {
  productId: string;
  quantity: number;
  requestedUnitPrice?: number;
}

// ---------------------------------------------------------------------------
// Negotiation: single-line discount proposal (used for "what's your best
// price on X" style questions, independent of placing an order)
// ---------------------------------------------------------------------------

export function proposeDiscount(productId: string, quantity: number, requestedUnitPrice: number, buyerId: string) {
  const product = getProductById(productId);
  const scope = checkCatalogScope(productId, product);
  if (!scope.pass) {
    appendAuditEntry({
      actionType: 'discount_proposal',
      description: scope.reason,
      boundChecked: 'catalog_scope',
      boundResult: 'fail',
      gateTriggered: false,
      metadata: { productId, quantity, requestedUnitPrice },
    });
    return { approved: false, reason: scope.reason };
  }

  const moq = checkMOQ(product!, quantity);
  const stock = checkStock(product!, quantity);
  const floor = checkDiscountFloor(product!, requestedUnitPrice, resolveMarginPct(buyerId));

  const allPass = moq.pass && stock.pass && floor.pass;
  const failing = [moq, stock, floor].filter((c) => !c.pass);

  appendAuditEntry({
    actionType: 'discount_proposal',
    description: allPass
      ? floor.reason
      : failing.map((c) => c.reason).join(' '),
    boundChecked: !floor.pass ? 'discount_floor' : !stock.pass ? 'stock' : !moq.pass ? 'moq' : 'discount_floor',
    boundResult: allPass ? 'pass' : 'fail',
    gateTriggered: false,
    metadata: { productId, quantity, requestedUnitPrice, floorPrice: floor.data.floorPrice, listPrice: product!.unitPrice },
  });

  if (!allPass) {
    return {
      approved: false,
      reason: failing.map((c) => c.reason).join(' '),
      maxDiscountedUnitPrice: floor.data.floorPrice as number,
      listPrice: product!.unitPrice,
    };
  }

  return { approved: true, reason: floor.reason, unitPrice: requestedUnitPrice, listPrice: product!.unitPrice };
}

// ---------------------------------------------------------------------------
// Order bound-check step: validates every line (catalog scope, MOQ, stock,
// discount floor). This is the explicit "bound-check tool" in the pipeline.
// ---------------------------------------------------------------------------

export interface LineCheckResult {
  productId: string;
  quantity: number;
  unitPrice: number;
  productName: string | null;
  pass: boolean;
  failures: string[];
}

export function checkOrderBounds(lines: RequestedLine[], buyerId: string): { allPass: boolean; results: LineCheckResult[] } {
  return runLineBoundChecks(lines, buyerId);
}

/**
 * Shared validation core. Used by both the `checkOrderBounds` tool AND
 * internally by `checkOrderGate`, so the gate step is self-contained and
 * re-validates every line itself rather than trusting that the model called
 * checkOrderBounds first and passed on honest results.
 */
function runLineBoundChecks(lines: RequestedLine[], buyerId: string): { allPass: boolean; results: LineCheckResult[] } {
  const marginPct = resolveMarginPct(buyerId);
  const results: LineCheckResult[] = [];

  for (const line of lines) {
    const product = getProductById(line.productId);
    const scope = checkCatalogScope(line.productId, product);

    if (!scope.pass) {
      appendAuditEntry({
        actionType: 'order_line_bound_check',
        description: scope.reason,
        boundChecked: 'catalog_scope',
        boundResult: 'fail',
        gateTriggered: false,
        metadata: { productId: line.productId, quantity: line.quantity },
      });
      results.push({ productId: line.productId, quantity: line.quantity, unitPrice: line.requestedUnitPrice ?? 0, productName: null, pass: false, failures: [scope.reason] });
      continue;
    }

    const unitPrice = line.requestedUnitPrice ?? product!.unitPrice;
    const moq = checkMOQ(product!, line.quantity);
    const stock = checkStock(product!, line.quantity);
    const floor = checkDiscountFloor(product!, unitPrice, marginPct);

    const checks: Array<{ name: 'moq' | 'stock' | 'discount_floor'; check: typeof moq }> = [
      { name: 'moq', check: moq },
      { name: 'stock', check: stock },
      { name: 'discount_floor', check: floor },
    ];

    const failed = checks.filter((c) => !c.check.pass);
    for (const f of failed) {
      appendAuditEntry({
        actionType: 'order_line_bound_check',
        description: f.check.reason,
        boundChecked: f.name,
        boundResult: 'fail',
        gateTriggered: false,
        metadata: { productId: line.productId, quantity: line.quantity, unitPrice },
      });
    }

    const pass = failed.length === 0;
    if (pass) {
      appendAuditEntry({
        actionType: 'order_line_bound_check',
        description: `${product!.name}: quantity ${line.quantity} at ₹${unitPrice}/unit passes MOQ, stock, and discount-floor checks.`,
        boundChecked: 'none',
        boundResult: 'pass',
        gateTriggered: false,
        metadata: { productId: line.productId, quantity: line.quantity, unitPrice },
      });
    }

    results.push({
      productId: line.productId,
      quantity: line.quantity,
      unitPrice,
      productName: product!.name,
      pass,
      failures: failed.map((f) => f.check.reason),
    });
  }

  return { allPass: results.every((r) => r.pass), results };
}

// ---------------------------------------------------------------------------
// Gate-check step: only reached once every line has passed its bounds.
// Computes the order total, decides whether it needs explicit confirmation,
// and creates the Redis-backed draft that /orders/:id/confirm will act on.
// ---------------------------------------------------------------------------

export async function checkOrderGate(lines: RequestedLine[], buyerId: string) {
  // Re-validate independently - this step never trusts that a prior
  // checkOrderBounds call happened or was honest about its result.
  const { allPass, results } = runLineBoundChecks(lines, buyerId);

  if (!allPass) {
    appendAuditEntry({
      actionType: 'order_gate_check',
      description: `Gate check skipped: order has failing line(s) - ${results.filter((r) => !r.pass).map((r) => r.failures.join(' ')).join(' ')}`,
      boundChecked: 'none',
      boundResult: 'fail',
      gateTriggered: false,
      metadata: { results },
    });
    return { draft: null, gate: null, allPass: false as const, results };
  }

  const items: OrderItem[] = results.map((l) => ({
    productId: l.productId,
    productName: l.productName!,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: Math.round(l.unitPrice * l.quantity * 100) / 100,
  }));
  const total = Math.round(items.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100;

  // Trust and GSTIN lookups are the only I/O in this step - checkGate itself
  // stays a pure function, same discipline as bounds.ts.
  const limits = await computeBuyerLimits(buyerId);
  const gstin = await getBuyerGSTIN(buyerId);

  appendAuditEntry({
    actionType: 'buyer_trust_computed',
    description: limits.trustApplied
      ? `Buyer has ${limits.completedOrders} completed orders (largest ₹${limits.largestOrderValue}, ${limits.largestLineQty} units). Auto-approve ceiling raised to ₹${limits.valueLimit} / ${limits.qtyLimit} units - never more than ${BOUND_CONFIG.GATE_TRUST_MULTIPLIER}x their own largest completed order, and never above the absolute cap.`
      : `Buyer has ${limits.completedOrders} completed order(s) - below the ${BOUND_CONFIG.GATE_TRUST_MIN_ORDERS} needed for a raised limit. Base auto-approve ceiling applies: ₹${limits.valueLimit} / ${limits.qtyLimit} units.`,
    boundChecked: 'none',
    boundResult: 'n/a',
    gateTriggered: false,
    metadata: { buyerId, ...limits },
  });

  const gate = checkGate({ items, total, reason: '' }, limits, !!gstin, resolveGstThreshold(buyerId));

  const draft: OrderDraftRecord = await createDraft({
    buyerId,
    items,
    total,
    boundsPassed: true,
    boundFailureReasons: [],
    gateTriggered: gate.gateTriggered,
    gateReason: gate.reason,
  });

  appendAuditEntry({
    actionType: 'order_gate_check',
    description: gate.reason,
    boundChecked: gate.gateTriggered ? 'gate_order_value' : 'none',
    boundResult: 'n/a',
    gateTriggered: gate.gateTriggered,
    gateConfirmed: gate.gateTriggered ? null : true,
    metadata: { draftId: draft.id, total, items },
  });

  return { draft, gate, allPass: true as const, results };
}

// ---------------------------------------------------------------------------
// Act: creates the real Razorpay test-mode order and persists it. This is
// the ONLY function in the codebase that calls Razorpay - both the
// auto-approved tool path and the gated confirm-button path route through it,
// and it re-checks the gate state itself rather than trusting the caller.
// ---------------------------------------------------------------------------

export async function executePlacement(draftId: string) {
  const draft = await getDraft(draftId);
  if (!draft) {
    return { success: false as const, reason: `No such order draft: ${draftId}.` };
  }

  if (draft.executed) {
    return { success: false as const, reason: `Order draft ${draftId} was already executed.` };
  }

  if (!draft.boundsPassed) {
    appendAuditEntry({
      actionType: 'order_placement_blocked',
      description: `Refused to place order ${draftId}: it failed bound checks (${draft.boundFailureReasons.join(' ')}).`,
      boundChecked: 'none',
      boundResult: 'fail',
      gateTriggered: draft.gateTriggered,
      metadata: { draftId },
    });
    return { success: false as const, reason: 'Order failed bound checks and cannot be placed.' };
  }

  if (draft.gateTriggered && draft.confirmed !== true) {
    // This is the hard enforcement point for the gate: even if the LLM (or
    // an adversarial prompt) calls the placeOrder tool directly, execution
    // is refused here in code unless a real confirm action has been recorded.
    appendAuditEntry({
      actionType: 'order_placement_blocked',
      description: `Refused to place order ${draftId}: total ₹${draft.total} requires explicit buyer confirmation and none has been recorded yet.`,
      boundChecked: 'none',
      boundResult: 'n/a',
      gateTriggered: true,
      gateConfirmed: draft.confirmed,
      metadata: { draftId },
    });
    return { success: false as const, reason: 'GATE_PENDING: this order requires explicit buyer confirmation before it can be placed.' };
  }

  if (draft.confirmed === false) {
    return { success: false as const, reason: `Order draft ${draftId} was declined by the buyer.` };
  }

  // Quote expiry: a draft's prices were only ever validated against the
  // floor/stock at evaluation time. If a gated order sits waiting for
  // confirmation, re-validate it fresh rather than trusting a stale draft.
  if (new Date() > new Date(draft.expiresAt)) {
    appendAuditEntry({
      actionType: 'order_placement_blocked',
      description: `Refused to place order ${draftId}: this quote expired at ${draft.expiresAt} (quotes are valid for ${BOUND_CONFIG.QUOTE_TTL_MINUTES} minutes). Ask the agent to re-quote at current prices.`,
      boundChecked: 'none',
      boundResult: 'n/a',
      gateTriggered: draft.gateTriggered,
      metadata: { draftId, expiresAt: draft.expiresAt },
    });
    return { success: false as const, reason: `Order draft ${draftId} has expired. Please re-quote.` };
  }

  const staleLines: string[] = [];
  const marginPct = resolveMarginPct(draft.buyerId);
  for (const item of draft.items) {
    const product = getProductById(item.productId);
    if (!product) {
      staleLines.push(`${item.productName} is no longer in the catalog.`);
      continue;
    }
    const floor = checkDiscountFloor(product, item.unitPrice, marginPct);
    const stock = checkStock(product, item.quantity);
    if (!floor.pass) staleLines.push(floor.reason);
    if (!stock.pass) staleLines.push(stock.reason);
  }
  if (staleLines.length > 0) {
    appendAuditEntry({
      actionType: 'order_placement_blocked',
      description: `Refused to place order ${draftId}: re-verification at confirmation time found the quote is now stale - ${staleLines.join(' ')}`,
      boundChecked: 'discount_floor',
      boundResult: 'fail',
      gateTriggered: draft.gateTriggered,
      metadata: { draftId, staleLines },
    });
    return { success: false as const, reason: `Order draft ${draftId} is stale (prices or stock changed since quoting) and cannot be placed. Please re-quote.` };
  }

  let razorpayOrder;
  try {
    razorpayOrder = await createRazorpayOrder(draft.total, draftId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    appendAuditEntry({
      actionType: 'order_placement_blocked',
      description: `Order ${draftId} passed all bounds and gate checks but Razorpay order creation failed: ${reason}`,
      boundChecked: 'none',
      boundResult: 'n/a',
      gateTriggered: draft.gateTriggered,
      gateConfirmed: draft.gateTriggered ? true : null,
      metadata: { draftId },
    });
    return { success: false as const, reason };
  }

  db.insert(orders)
    .values({
      id: draftId,
      buyerId: draft.buyerId,
      items: draft.items,
      total: draft.total,
      status: 'placed',
      createdAt: new Date().toISOString(),
      razorpayOrderId: razorpayOrder.id,
    })
    .run();

  await markExecuted(draftId);

  appendAuditEntry({
    actionType: 'order_placed',
    description: `Order ${draftId} placed for ₹${draft.total} (Razorpay test order ${razorpayOrder.id}, ${draft.items.length} line item${draft.items.length === 1 ? '' : 's'}).`,
    boundChecked: 'none',
    boundResult: 'pass',
    gateTriggered: draft.gateTriggered,
    gateConfirmed: draft.gateTriggered ? true : null,
    metadata: { draftId, razorpayOrderId: razorpayOrder.id, total: draft.total, items: draft.items },
  });

  return { success: true as const, draft, razorpayOrder };
}

export async function declineDraft(draftId: string) {
  const draft = await setConfirmation(draftId, false);
  if (!draft) return { success: false as const, reason: `No such order draft: ${draftId}.` };

  appendAuditEntry({
    actionType: 'order_declined_by_user',
    description: `Buyer declined order ${draftId} (₹${draft.total}) after the confirmation gate.`,
    boundChecked: 'none',
    boundResult: 'n/a',
    gateTriggered: true,
    gateConfirmed: false,
    metadata: { draftId, total: draft.total },
  });

  return { success: true as const, draft };
}

export async function confirmDraft(draftId: string) {
  const draft = await setConfirmation(draftId, true);
  if (!draft) return undefined;

  appendAuditEntry({
    actionType: 'order_confirmed_by_user',
    description: `Buyer explicitly confirmed gated order ${draftId} (₹${draft.total}) in the UI.`,
    boundChecked: 'none',
    boundResult: 'n/a',
    gateTriggered: true,
    gateConfirmed: true,
    metadata: { draftId, total: draft.total },
  });

  return draft;
}
