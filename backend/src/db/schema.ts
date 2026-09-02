import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  spec: text('spec').notNull(),
  unitPrice: real('unit_price').notNull(),
  unitCost: real('unit_cost').notNull(),
  moq: integer('moq').notNull(),
  stockQty: integer('stock_qty').notNull(),
  relatedProductIds: text('related_product_ids', { mode: 'json' }).$type<string[]>().notNull(),
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  buyerId: text('buyer_id').notNull(),
  items: text('items', { mode: 'json' }).$type<
    { productId: string; productName: string; quantity: number; unitPrice: number; lineTotal: number }[]
  >().notNull(),
  total: real('total').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  razorpayOrderId: text('razorpay_order_id'),
});

// ---------------------------------------------------------------------------
// Audit trail (hash-chained, durable - this is the tamper-evident log)
// ---------------------------------------------------------------------------

export const auditEntries = sqliteTable('audit_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull(),
  actionType: text('action_type').notNull(),
  description: text('description').notNull(),
  boundChecked: text('bound_checked').notNull(),
  boundResult: text('bound_result').notNull(),
  gateTriggered: integer('gate_triggered', { mode: 'boolean' }).notNull(),
  gateConfirmed: integer('gate_confirmed', { mode: 'boolean' }),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull(),
});
