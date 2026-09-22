import { Hono } from 'hono';
import { getDraft } from '../agent/orderDrafts.js';

export const ordersRoute = new Hono();

/**
 * Read-only, used by the buyer's chat UI to poll a gated draft's status
 * while it's under merchant review. Deliberately the only route left here:
 * the actual approve/reject decision now lives behind merchant auth in
 * routes/merchant.ts's /approvals routes, not here - this route previously
 * had confirm/decline endpoints with zero auth (anyone who knew a draftId
 * could resolve it), which the maker-checker redesign closes.
 */
ordersRoute.get('/:draftId', async (c) => {
  const draft = await getDraft(c.req.param('draftId'));
  if (!draft) return c.json({ error: 'not found' }, 404);
  return c.json(draft);
});
