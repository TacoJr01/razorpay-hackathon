import { db } from './client.js';
import { products } from './schema.js';
import { eq, like, or } from 'drizzle-orm';
import type { Product } from '@b2b-agent/shared';

export function getAllProducts(): Product[] {
  return db.select().from(products).all();
}

export function getProductById(id: string): Product | undefined {
  const [row] = db.select().from(products).where(eq(products.id, id)).all();
  return row;
}

/** Simple keyword search over name / category / spec - good enough for a 30-40 SKU demo catalog. */
export function searchProducts(keyword: string): Product[] {
  const pattern = `%${keyword.toLowerCase()}%`;
  return db
    .select()
    .from(products)
    .where(or(like(products.name, pattern), like(products.category, pattern), like(products.spec, pattern)))
    .all();
}

export function getRelatedProducts(productId: string): Product[] {
  const product = getProductById(productId);
  if (!product || product.relatedProductIds.length === 0) return [];
  const all = getAllProducts();
  return all.filter((p) => product.relatedProductIds.includes(p.id));
}
