import { Hono } from 'hono';
import { db } from '../db/client.js';
import { orders } from '../db/schema.js';
import { computeBuyerLimits } from '../agent/trust.js';
import { getBuyerOverride, listBuyerOverrides, setBuyerOverride } from '../agent/merchantOverrides.js';
import { mintSessionToken, verifySessionToken } from '../agent/merchantSession.js';
import { appendAuditEntry } from '../audit/auditService.js';
import { BOUND_CONFIG } from '@b2b-agent/shared';

export const merchantRoute = new Hono();

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
    return next();
  }

  const googleToken = c.req.header('x-merchant-google-token');
  if (googleToken && verifySessionToken(googleToken).valid) {
    return next();
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
