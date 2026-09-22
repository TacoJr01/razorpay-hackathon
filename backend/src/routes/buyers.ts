import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { computeBuyerLimits } from '../agent/trust.js';
import { getBuyerGSTIN } from '../agent/buyerProfile.js';
import { db } from '../db/client.js';
import { orders } from '../db/schema.js';

export const buyersRoute = new Hono();

/** Lets the UI show a buyer their current auto-approve limits - the trust mechanism must be visible, not just internally enforced. */
buyersRoute.get('/:id/limits', async (c) => {
  const limits = await computeBuyerLimits(c.req.param('id'));
  return c.json(limits);
});

/** A buyer's own order history - only their own rows, never another buyer's. */
buyersRoute.get('/:id/orders', async (c) => {
  const rows = db
    .select()
    .from(orders)
    .where(eq(orders.buyerId, c.req.param('id')))
    .orderBy(desc(orders.createdAt))
    .all();
  return c.json(rows);
});

/** Whether this buyer has a GSTIN on file, and what it is - surfaces the compliance gate's state, not just its side effects. */
buyersRoute.get('/:id/gstin', async (c) => {
  const gstin = await getBuyerGSTIN(c.req.param('id'));
  return c.json({ gstin });
});
