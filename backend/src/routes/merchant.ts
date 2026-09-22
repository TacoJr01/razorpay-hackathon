import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orders, products } from '../db/schema.js';
import { computeBuyerLimits } from '../agent/trust.js';
import { getBuyerOverride, listBuyerOverrides, setBuyerOverride } from '../agent/merchantOverrides.js';
import { mintSessionToken, verifySessionToken } from '../agent/merchantSession.js';
import { approveDraft, executePlacement, rejectDraft } from '../agent/actions.js';
import { getDraft, listPendingApprovalIds, removePendingApprovalId, type OrderDraftRecord } from '../agent/orderDrafts.js';
import { appendAuditEntry, listAuditEntries } from '../audit/auditService.js';
import { BOUND_CONFIG } from '@b2b-agent/shared';

export const merchantRoute = new Hono<{ Variables: { merchantIdentity: string } }>();

/**
 * Merchant-only surface: sets per-buyer negotiated terms (margin floor, GST
 * threshold). Gated by EITHER a username/password checked against env vars,
 * OR a signed Google-session token minted by /auth/google-session. Neither
 * path is reachable from the buyer-facing chat session or any tool the LLM
 * can call - the buyer has no code path into this file at all.
 *
 * Deliberately no email allowlist on the Google path, per an explicit choice
 * to keep the merchant panel open to any Google account - it is a demo
 * convenience feature here, not a real security boundary. The username/
 * password path is the one meant to demonstrate genuine gating.
 */
merchantRoute.use('*', async (c, next) => {
  // The mint endpoint has its own separate check (internal shared secret,
  // called server-to-server from the frontend's OAuth callback) - it must
  // not be blocked by the credential check below, since that is what it exists
  // to issue in the first place.
  if (c.req.path.endsWith('/auth/google-session')) {
    return next();
  }

  const user = c.req.header('x-merchant-user');
  const pass = c.req.header('x-merchant-password');
  const expectedUser = process.env.MERCHANT_ADMIN_USER;
  const expectedPass = process.env.MERCHANT_ADMIN_PASSWORD;
  if (expectedUser && expectedPass && user === expectedUser && pass === expectedPass) {
    c.set('merchantIdentity', user);
    return next();
  }

  const googleToken = c.req.header('x-merchant-google-token');
  if (googleToken) {
    const verified = verifySessionToken(googleToken);
    if (verified.valid && verified.email) {
      c.set('merchantIdentity', verified.email);
      return next();
    }
  }

  return c.json({ error: 'unauthorized' }, 401);
});

/**
 * Mints a merchant session token for an email the frontend's OAuth callback
 * has already verified with Google. Only reachable with the internal shared
 * secret, known solely to the frontend server process and this backend -
 * never sent to or reachable from the browser.
 */
merchantRoute.post('/auth/google-session', async (c) => {
  const internalSecret = c.req.header('x-internal-secret');
  if (!internalSecret || internalSecret !== process.env.INTERNAL_AUTH_SECRET) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const { email } = await c.req.json<{ email: string }>();
  if (!email) {
    return c.json({ error: 'missing email' }, 400);
  }
  const session = mintSessionToken(email);
  appendAuditEntry({
    actionType: 'merchant_google_signin',
    description: `Merchant signed in via Google as ${email}.`,
    boundChecked: 'none',
    boundResult: 'n/a',
    gateTriggered: false,
    metadata: { email },
  });
  return c.json(session);
});

merchantRoute.get('/buyers', async (c) => {
  const rows = db.selectDistinct({ buyerId: orders.buyerId }).from(orders).all();
  const overrides = listBuyerOverrides();
  const buyerIds = new Set([...rows.map((r) => r.buyerId), ...overrides.map((o) => o.buyerId)]);

  const buyers = await Promise.all(
    [...buyerIds].map(async (buyerId) => {
      const limits = await computeBuyerLimits(buyerId);
      const override = getBuyerOverride(buyerId);
      return { buyerId, limits, override };
    }),
  );

  return c.json({ buyers, defaults: { marginPct: BOUND_CONFIG.MIN_MARGIN_PCT, gstThresholdInr: BOUND_CONFIG.GST_REQUIRED_ABOVE_INR } });
});

merchantRoute.get('/buyers/:id', async (c) => {
  const buyerId = c.req.param('id');
  const limits = await computeBuyerLimits(buyerId);
  const override = getBuyerOverride(buyerId);
  return c.json({ buyerId, limits, override, defaults: { marginPct: BOUND_CONFIG.MIN_MARGIN_PCT, gstThresholdInr: BOUND_CONFIG.GST_REQUIRED_ABOVE_INR } });
});

merchantRoute.put('/buyers/:id/override', async (c) => {
  const buyerId = c.req.param('id');
  const body = await c.req.json<{ marginPct?: number | null; gstThresholdInr?: number | null }>();

  const before = getBuyerOverride(buyerId);
  const after = setBuyerOverride(buyerId, body);

  appendAuditEntry({
    actionType: 'merchant_override_set',
    description: `Merchant set negotiated terms for buyer ${buyerId}: margin ${after.marginPct === null ? 'default' : `${after.marginPct * 100}%`}, GST threshold ${after.gstThresholdInr === null ? 'default' : `₹${after.gstThresholdInr}`}.`,
    boundChecked: 'none',
    boundResult: 'n/a',
    gateTriggered: false,
    metadata: { buyerId, before, after },
  });

  return c.json(after);
});

/** Every order across every buyer - the merchant's only view of actual order/revenue activity. */
merchantRoute.get('/orders', async (c) => {
  const buyerId = c.req.query('buyerId');
  const rows = buyerId
    ? db.select().from(orders).where(eq(orders.buyerId, buyerId)).orderBy(desc(orders.createdAt)).all()
    : db.select().from(orders).orderBy(desc(orders.createdAt)).all();
  return c.json(rows);
});

/**
 * Quantified impact view - the numbers a "growth" pitch needs, not just a
 * narrative claim. Computed fresh from orders + the audit trail each call;
 * no separate metrics table to keep in sync.
 */
merchantRoute.get('/analytics', async (c) => {
  const allOrders = db.select().from(orders).all();
  const totalOrders = allOrders.length;
  const totalValue = allOrders.reduce((sum, o) => sum + o.total, 0);
  const avgOrderValue = totalOrders > 0 ? totalValue / totalOrders : 0;

  const byBuyer = new Map<string, { orders: number; value: number }>();
  for (const o of allOrders) {
    const cur = byBuyer.get(o.buyerId) ?? { orders: 0, value: 0 };
    cur.orders += 1;
    cur.value += o.total;
    byBuyer.set(o.buyerId, cur);
  }
  const topBuyers = [...byBuyer.entries()]
    .map(([buyerId, v]) => ({ buyerId, orders: v.orders, value: v.value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const entries = listAuditEntries();
  const gateChecks = entries.filter((e) => e.actionType === 'order_gate_check');
  const gatedCount = gateChecks.filter((e) => e.gateTriggered).length;
  const autoApprovedCount = gateChecks.length - gatedCount;
  const gateRate = gateChecks.length > 0 ? gatedCount / gateChecks.length : 0;

  const discountChecks = entries.filter((e) => e.actionType === 'discount_proposal');
  const discountRefusals = discountChecks.filter((e) => e.boundResult === 'fail').length;

  return c.json({
    totalOrders,
    totalValue,
    avgOrderValue,
    topBuyers,
    gating: { gatedCount, autoApprovedCount, gateRate },
    discountFloor: { checked: discountChecks.length, refused: discountRefusals },
  });
});

/** Merchant-only catalog edit (price / stock / MOQ). Logged like every other merchant write. */
merchantRoute.patch('/products/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ unitPrice?: number; unitCost?: number; stockQty?: number; moq?: number }>();

  const [before] = db.select().from(products).where(eq(products.id, id)).all();
  if (!before) return c.json({ error: 'no such product' }, 404);

  db.update(products).set(body).where(eq(products.id, id)).run();
  const [after] = db.select().from(products).where(eq(products.id, id)).all();

  appendAuditEntry({
    actionType: 'merchant_catalog_edit',
    description: `Merchant updated ${after.name} (${id}): ${Object.entries(body)
      .map(([k, v]) => `${k} -> ${v}`)
      .join(', ')}.`,
    boundChecked: 'none',
    boundResult: 'n/a',
    gateTriggered: false,
    metadata: { productId: id, before, after },
  });

  return c.json(after);
});

/**
 * Every gated order still awaiting a merchant's approve/reject decision -
 * this is the maker-checker queue: a genuinely different identity than the
 * buyer (an authenticated merchant session) must review before Razorpay is
 * ever called, replacing the old buyer-self-confirm flow entirely.
 */
merchantRoute.get('/approvals', async (c) => {
  const ids = await listPendingApprovalIds();
  const drafts = await Promise.all(ids.map((id) => getDraft(id)));

  // Self-heal: a draft can vanish from Redis (TTL) without its id having
  // been removed from the pending-approvals set - drop those stale ids.
  const staleIds = ids.filter((_, i) => !drafts[i]);
  await Promise.all(staleIds.map((id) => removePendingApprovalId(id)));

  const pending = drafts
    .filter((d): d is OrderDraftRecord => !!d && d.confirmed === null && !d.executed)
    .map((d) => ({ draftId: d.id, buyerId: d.buyerId, items: d.items, total: d.total, gateReason: d.gateReason, createdAt: d.createdAt, expiresAt: d.expiresAt }));

  return c.json({ pending });
});

merchantRoute.post('/approvals/:draftId/approve', async (c) => {
  const draftId = c.req.param('draftId');
  const approverId = c.get('merchantIdentity');

  const outcome = await approveDraft(draftId, approverId);
  if (!outcome.success) return c.json(outcome, outcome.reason === 'not_found' ? 404 : 409);

  const placement = await executePlacement(draftId);
  return c.json({ approval: outcome.draft, placement });
});

merchantRoute.post('/approvals/:draftId/reject', async (c) => {
  const draftId = c.req.param('draftId');
  const approverId = c.get('merchantIdentity');
  const body = await c.req.json<{ reason?: string }>().catch(() => ({}) as { reason?: string });

  const outcome = await rejectDraft(draftId, approverId, body.reason);
  if (!outcome.success) return c.json(outcome, outcome.reason === 'not_found' ? 404 : 409);

  return c.json(outcome);
});
