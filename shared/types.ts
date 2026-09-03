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
// Trust-tier gate limits (computed per-buyer from their own order history)
// ---------------------------------------------------------------------------

export interface BuyerLimits {
  valueLimit: number;
  qtyLimit: number;
  completedOrders: number;
  largestOrderValue: number;
  largestLineQty: number;
  trustApplied: boolean;
}

// ---------------------------------------------------------------------------
// Bound / gate configuration (hard-coded thresholds, not LLM-adjustable)
// ---------------------------------------------------------------------------

export const BOUND_CONFIG = {
  /** Minimum margin over unit_cost that any quoted/discounted price must retain. Never adjusted by trust. */
  MIN_MARGIN_PCT: 0.15,
  /** Base auto-approval limit (INR) for a buyer with no trust history yet. */
  GATE_ORDER_VALUE_INR: 200_000,
  /** Base auto-approval limit (line quantity) for a buyer with no trust history yet. */
  GATE_QUANTITY_UNITS: 500,
  /** A buyer's auto-approve ceiling never exceeds this multiple of their own largest completed order. */
  GATE_TRUST_MULTIPLIER: 3,
  /** Minimum completed (placed) orders before trust adjusts a buyer's gate ceiling at all. */
  GATE_TRUST_MIN_ORDERS: 3,
  /** Absolute value ceiling (INR) no amount of trust can exceed. */
  GATE_VALUE_ABSOLUTE_CAP_INR: 1_000_000,
  /** Absolute quantity ceiling no amount of trust can exceed. */
  GATE_QTY_ABSOLUTE_CAP: 2_000,
  /** Orders above this total (INR) require a valid buyer GSTIN on file, regardless of trust tier. */
  GST_REQUIRED_ABOVE_INR: 50_000,
  /** How long a negotiated quote/draft remains valid before it must be re-quoted. */
  QUOTE_TTL_MINUTES: 15,
} as const;
