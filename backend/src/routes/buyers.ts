import { Hono } from 'hono';
import { computeBuyerLimits } from '../agent/trust.js';

export const buyersRoute = new Hono();

/** Lets the UI show a buyer their current auto-approve limits - the trust mechanism must be visible, not just internally enforced. */
buyersRoute.get('/:id/limits', async (c) => {
  const limits = await computeBuyerLimits(c.req.param('id'));
  return c.json(limits);
});
