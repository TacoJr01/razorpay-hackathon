/**
 * Types shared between the backend (Hono + Drizzle) and the frontend (Next.js).
 * This is the single source of truth for the catalog / order / audit schema.
 */

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  category: string;
  spec: string;
  unitPrice: number; // list price in INR (paise-free, whole rupees for simplicity)
  unitCost: number; // internal cost basis - never sent to the LLM's own reasoning as "safe to reveal", only used by bounds.ts
  moq: number; // minimum order quantity
  stockQty: number;
  relatedProductIds: string[]; // cross-sell / bundle suggestions
}

// Product shape actually exposed to the agent / buyer (cost hidden)
export type PublicProduct = Omit<Product, 'unitCost'>;

export function toPublicProduct(p: Product): PublicProduct {
  const { unitCost: _unitCost, ...rest } = p;
  return rest;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number; // final agreed per-unit price (post-discount, pre-verification of bound)
  lineTotal: number;
}

export type OrderStatus =
  | 'draft'
  | 'pending_confirmation'
  | 'confirmed'
  | 'placed'
  | 'failed'
  | 'declined';

export interface Order {
  id: string;
  buyerId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  razorpayOrderId?: string;
}

export interface OrderDraft {
  items: OrderItem[];
  total: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export type BoundName =
  | 'discount_floor'
  | 'moq'
  | 'stock'
  | 'catalog_scope'
  | 'gate_order_value'
  | 'gate_quantity'
  | 'none';

export type BoundResult = 'pass' | 'fail' | 'n/a';

export interface AuditEntry {
  id: number;
  timestamp: string;
  actionType: string;
  description: string; // human-readable reason, shown verbatim in the UI
  boundChecked: BoundName;
  boundResult: BoundResult;
  gateTriggered: boolean;
  gateConfirmed: boolean | null; // null until resolved
  metadata: Record<string, unknown> | null;
  prevHash: string;
  hash: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  checkedCount: number;
  brokenAtId: number | null;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Agent streaming protocol (SSE)
// ---------------------------------------------------------------------------

export type AgentStreamEvent =
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; name: string; args: unknown }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'gate'; reason: string; orderDraft: OrderDraft; gateId: string }
  | { type: 'message'; text: string }
  | { type: 'audit'; entry: AuditEntry }
  | { type: 'done' }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Bound / gate configuration (hard-coded thresholds, not LLM-adjustable)
// ---------------------------------------------------------------------------

export const BOUND_CONFIG = {
  /** Minimum margin over unit_cost that any quoted/discounted price must retain. */
  MIN_MARGIN_PCT: 0.15,
  /** Any order whose total exceeds this (INR) requires explicit user confirmation. */
  GATE_ORDER_VALUE_INR: 200_000,
  /** Any single line item whose quantity exceeds this requires explicit user confirmation. */
  GATE_QUANTITY_UNITS: 500,
} as const;
