import { Hono } from 'hono';
import { confirmDraft, declineDraft, executePlacement } from '../agent/actions.js';
import { getDraft } from '../agent/orderDrafts.js';

export const ordersRoute = new Hono();

ordersRoute.get('/:draftId', async (c) => {
  const draft = await getDraft(c.req.param('draftId'));
  if (!draft) return c.json({ error: 'not found' }, 404);
  return c.json(draft);
});

/** Explicit user confirmation for a gated order - the only path that unblocks executePlacement for a gated draft. */
ordersRoute.post('/:draftId/confirm', async (c) => {
  const draftId = c.req.param('draftId');
  const draft = await confirmDraft(draftId);
  if (!draft) return c.json({ error: 'no such draft' }, 404);

  const result = await executePlacement(draftId);
  return c.json(result);
});

ordersRoute.post('/:draftId/decline', async (c) => {
  const draftId = c.req.param('draftId');
  const result = await declineDraft(draftId);
  if (!result.success) return c.json(result, 404);
  return c.json(result);
});
