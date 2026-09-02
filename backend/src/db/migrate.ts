import { sqlite } from './client.js';

/**
 * Hand-written bootstrap DDL (kept in lockstep with schema.ts).
 * We skip drizzle-kit's migration generator for this project - a single
 * idempotent CREATE TABLE pass is easier to run and demo than a migration
 * pipeline, and the schema is small and stable enough that hand-sync is safe.
 */
export function runMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      spec TEXT NOT NULL,
      unit_price REAL NOT NULL,
      unit_cost REAL NOT NULL,
      moq INTEGER NOT NULL,
      stock_qty INTEGER NOT NULL,
      related_product_ids TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL,
      items TEXT NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      razorpay_order_id TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      bound_checked TEXT NOT NULL,
      bound_result TEXT NOT NULL,
      gate_triggered INTEGER NOT NULL,
      gate_confirmed INTEGER,
      metadata TEXT,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL
    );
  `);
}
