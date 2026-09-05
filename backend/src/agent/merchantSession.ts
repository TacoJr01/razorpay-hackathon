import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function sign(payload: string): string {
  const secret = process.env.MERCHANT_SESSION_SECRET;
  if (!secret) throw new Error('MERCHANT_SESSION_SECRET is not set');
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Mints a signed, time-limited merchant session token for a Google-verified
 * email. Called only from the /merchant/auth/google-session route, which is
 * itself only reachable with the internal shared secret (see routes/merchant.ts) -
 * the buyer's chat session has no path to this at all.
 */
export function mintSessionToken(email: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${email}|${expiresAt}`;
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = sign(payloadB64);
  return { token: `${payloadB64}.${sig}`, expiresAt };
}

export function verifySessionToken(token: string): { valid: boolean; email?: string } {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return { valid: false };

  const expectedSig = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false };

  const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const [email, expiresAtStr] = payload.split('|');
  const expiresAt = Number(expiresAtStr);
  if (!email || !expiresAt || Date.now() > expiresAt) return { valid: false };

  return { valid: true, email };
}
