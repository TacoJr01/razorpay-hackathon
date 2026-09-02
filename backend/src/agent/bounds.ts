import { BOUND_CONFIG } from '@b2b-agent/shared';
import type { Product } from '@b2b-agent/shared';

/**
 * Hard bound checks. These are plain functions with no LLM involved -
 * every code path that quotes a price, applies a discount, or places an
 * order calls these directly (see agent/actions.ts). They are ALSO exposed
 * to the model as tools (agent/tools.ts) so its own reasoning is grounded
 * in the same numbers, but the enforcement below does not depend on the
 * model choosing to call the tool - it runs unconditionally before any
 * money-relevant mutation.
 */

export interface BoundCheck {
  pass: boolean;
  reason: string;
  data: Record<string, unknown>;
}

/**
 * Discount floor bound: a quoted/discounted unit price can never go below
 * unit_cost * (1 + MIN_MARGIN_PCT). This is the one rule the spec calls out
 * as un-overridable - no prompt, buyer pressure, or "manager approval" claim
 * can move this number, because it is computed here, not asserted by the LLM.
 */
export function checkDiscountFloor(product: Product, proposedUnitPrice: number): BoundCheck {
  const floorPrice = round2(product.unitCost * (1 + BOUND_CONFIG.MIN_MARGIN_PCT));
  const pass = proposedUnitPrice >= floorPrice;
  return {
    pass,
    reason: pass
      ? `Proposed price ₹${proposedUnitPrice} for ${product.name} is at or above the floor price ₹${floorPrice} (unit cost ₹${product.unitCost} + ${BOUND_CONFIG.MIN_MARGIN_PCT * 100}% minimum margin).`
      : `Proposed price ₹${proposedUnitPrice} for ${product.name} is below the floor price ₹${floorPrice} (unit cost ₹${product.unitCost} + ${BOUND_CONFIG.MIN_MARGIN_PCT * 100}% minimum margin required). Refused - this bound cannot be overridden regardless of buyer justification.`,
    data: { floorPrice, unitCost: product.unitCost, minMarginPct: BOUND_CONFIG.MIN_MARGIN_PCT, proposedUnitPrice },
  };
}

/** MOQ bound: cannot place a line below the product's minimum order quantity. */
export function checkMOQ(product: Product, quantity: number): BoundCheck {
  const pass = quantity >= product.moq;
  return {
    pass,
    reason: pass
      ? `Quantity ${quantity} meets the MOQ of ${product.moq} for ${product.name}.`
      : `Quantity ${quantity} is below the MOQ of ${product.moq} for ${product.name}. Refused.`,
    data: { moq: product.moq, quantity },
  };
}

/** Stock bound: cannot place a line above available stock. */
export function checkStock(product: Product, quantity: number): BoundCheck {
  const pass = quantity <= product.stockQty;
  return {
    pass,
    reason: pass
      ? `Quantity ${quantity} is within available stock (${product.stockQty}) for ${product.name}.`
      : `Quantity ${quantity} exceeds available stock (${product.stockQty}) for ${product.name}. Out of stock for the requested amount - refused.`,
    data: { stockQty: product.stockQty, quantity },
  };
}

/** Catalog-scope bound: the referenced product must actually exist in the catalog. */
export function checkCatalogScope(productId: string, product: Product | undefined): BoundCheck {
  const pass = !!product;
  return {
    pass,
    reason: pass
      ? `${productId} resolved to a catalog item.`
      : `"${productId}" does not match any SKU in the catalog. Out of scope - declined rather than guessed.`,
    data: { productId },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
