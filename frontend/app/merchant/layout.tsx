'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DotBackground } from '../../components/ui/dot-background';
import { MerchantAuthContext } from '../../lib/merchantAuth';
import {
  clearMerchantCreds,
  clearMerchantGoogleSession,
  fetchMerchantBuyers,
  getMerchantCreds,
  getMerchantGoogleSession,
  setMerchantCreds,
  setMerchantGoogleSession,
  type MerchantAuth,
} from '../../lib/api';

// Demo credentials, shown on the login screen itself so anyone reviewing the
// project can get in without asking - this is a synthetic demo, not a real
// merchant account. Real deployments would never print credentials on the page.
const DEMO_USERNAME = 'merchant';
const DEMO_PASSWORD = 'hisaab2026';

function googleAuthUrl(): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
  const redirectUri = `${window.location.origin}/merchant/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

const NAV_LINKS = [
  { href: '/merchant/approvals', label: 'Approvals' },
  { href: '/merchant', label: 'Buyers' },
  { href: '/merchant/orders', label: 'Orders' },
  { href: '/merchant/analytics', label: 'Analytics' },
  { href: '/merchant/audit', label: 'Audit' },
  { href: '/merchant/catalog', label: 'Catalog' },
];

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <MerchantGate>{children}</MerchantGate>
    </Suspense>
  );
}

function MerchantGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [auth, setAuth] = useState<MerchantAuth | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validates a candidate auth by hitting a cheap real endpoint - the buyers
  // list data itself is discarded here; each page under /merchant fetches
  // its own data independently once auth is confirmed good.
  const validate = useCallback(async (candidate: MerchantAuth) => {
    setError(null);
    const result = await fetchMerchantBuyers(candidate);
    if (!result.ok) {
      setUnlocked(false);
      clearMerchantCreds();
      clearMerchantGoogleSession();
      setError(result.status === 401 ? 'Sign-in failed or expired.' : `Request failed (${result.status}).`);
      return;
    }
    setAuth(candidate);
    setUnlocked(true);
  }, []);

  useEffect(() => {
    const googleToken = searchParams.get('googleToken');
    const googleEmail = searchParams.get('googleEmail');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      setError(`Google sign-in failed (${oauthError}).`);
      router.replace('/merchant');
      return;
    }

    if (googleToken && googleEmail) {
      setMerchantGoogleSession({ token: googleToken, email: googleEmail });
      router.replace('/merchant');
      validate({ kind: 'google', token: googleToken, email: googleEmail });
      return;
    }

    const storedGoogle = getMerchantGoogleSession();
    if (storedGoogle) {
      validate({ kind: 'google', token: storedGoogle.token, email: storedGoogle.email });
      return;
    }

    const storedCreds = getMerchantCreds();
    if (storedCreds) {
      setUsername(storedCreds.username);
      setPassword(storedCreds.password);
      validate({ kind: 'basic', ...storedCreds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    const creds = { username, password };
    setMerchantCreds(creds);
    await validate({ kind: 'basic', ...creds });
  }

  if (!unlocked || !auth) {
    return (
      <div className="merchant-gate">
        <DotBackground />
        <form onSubmit={handleUnlock} className="merchant-gate-form">
          <h1>Merchant admin</h1>
          <p>Sign in to view and set per-buyer negotiated terms.</p>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoFocus
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          <button type="submit" className="btn primary">Sign in</button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              window.location.href = googleAuthUrl();
            }}
          >
            Sign in with Google
          </button>
          {error && <div className="merchant-error">{error}</div>}
          <div className="merchant-demo-creds">
            Demo credentials — Username: <strong>{DEMO_USERNAME}</strong> · Password: <strong>{DEMO_PASSWORD}</strong>
          </div>
        </form>
      </div>
    );
  }

  return (
    <MerchantAuthContext.Provider value={auth}>
      <div className="app-shell">
        <div className="topbar">
          <Link href="/" className="topbar-brand">
            <h1>Hisaab — Merchant</h1>
          </Link>
          <nav className="merchant-nav">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`merchant-nav-link${pathname === link.href ? ' active' : ''}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        {children}
      </div>
    </MerchantAuthContext.Provider>
  );
}
