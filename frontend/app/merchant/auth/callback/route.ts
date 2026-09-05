import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';

/**
 * Server-side OAuth callback. Exchanges the authorization code for tokens
 * using the client secret (never exposed to the browser), verifies the ID
 * token with Google directly, then asks the backend to mint a signed
 * merchant session for that email. The backend call is itself gated by an
 * internal shared secret known only to this server process and the backend -
 * nothing the browser sends can reach that mint endpoint directly.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const origin = req.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/merchant?error=missing_code`);
  }

  const redirectUri = `${origin}/merchant/auth/callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/merchant?error=token_exchange_failed`);
  }

  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) {
    return NextResponse.redirect(`${origin}/merchant?error=no_id_token`);
  }

  // Verify the ID token's signature/audience/expiry with Google directly,
  // rather than decoding it ourselves - avoids needing a JWT/JWKS library.
  const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`);
  if (!verifyRes.ok) {
    return NextResponse.redirect(`${origin}/merchant?error=invalid_id_token`);
  }
  const claims = (await verifyRes.json()) as { email?: string; aud?: string; email_verified?: string };

  if (claims.aud !== process.env.GOOGLE_CLIENT_ID || !claims.email || claims.email_verified !== 'true') {
    return NextResponse.redirect(`${origin}/merchant?error=unverified_email`);
  }

  const sessionRes = await fetch(`${BACKEND_URL}/merchant/auth/google-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_AUTH_SECRET ?? '',
    },
    body: JSON.stringify({ email: claims.email }),
  });

  if (!sessionRes.ok) {
    return NextResponse.redirect(`${origin}/merchant?error=session_mint_failed`);
  }

  const { token } = (await sessionRes.json()) as { token: string };
  const url = new URL(`${origin}/merchant`);
  url.searchParams.set('googleToken', token);
  url.searchParams.set('googleEmail', claims.email);
  return NextResponse.redirect(url);
}
