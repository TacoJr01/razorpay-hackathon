'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DotBackground } from '../../components/ui/dot-background';
import {
  clearMerchantCreds,
  clearMerchantGoogleSession,
  fetchMerchantBuyers,
  getMerchantCreds,
  getMerchantGoogleSession,
  setMerchantCreds,
  setMerchantGoogleSession,
  setMerchantOverride,
  type MerchantAuth,
  type MerchantBuyer,
  type MerchantBuyersResponse,
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

export default function Merchant() {
  return (
    <Suspense fallback={null}>
      <MerchantInner />
    </Suspense>
  );
}

function MerchantInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [auth, setAuth] = useState<MerchantAuth | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [data, setData] = useState<MerchantBuyersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { marginPct: string; gstThresholdInr: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (activeAuth: MerchantAuth) => {
    setError(null);
    const result = await fetchMerchantBuyers(activeAuth);
    if (!result.ok) {
      setUnlocked(false);
      clearMerchantCreds();
      clearMerchantGoogleSession();
      setError(result.status === 401 ? 'Sign-in failed or expired.' : `Request failed (${result.status}).`);
      return;
    }
    setData(result.data);
    setAuth(activeAuth);
    setUnlocked(true);
    const nextDrafts: Record<string, { marginPct: string; gstThresholdInr: string }> = {};
    for (const b of result.data.buyers) {
      nextDrafts[b.buyerId] = {
        marginPct: b.override?.marginPct != null ? String(b.override.marginPct * 100) : '',
        gstThresholdInr: b.override?.gstThresholdInr != null ? String(b.override.gstThresholdInr) : '',
      };
    }
    setDrafts(nextDrafts);
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
      load({ kind: 'google', token: googleToken, email: googleEmail });
      return;
    }

    const storedGoogle = getMerchantGoogleSession();
    if (storedGoogle) {
      load({ kind: 'google', token: storedGoogle.token, email: storedGoogle.email });
      return;
    }

    const storedCreds = getMerchantCreds();
    if (storedCreds) {
      setUsername(storedCreds.username);
      setPassword(storedCreds.password);
      load({ kind: 'basic', ...storedCreds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    const creds = { username, password };
    setMerchantCreds(creds);
    await load({ kind: 'basic', ...creds });
  }

  async function handleSave(buyerId: string) {
    if (!auth) return;
    const draft = drafts[buyerId];
    setSavingId(buyerId);
    const marginPct = draft.marginPct.trim() === '' ? null : Number(draft.marginPct) / 100;
    const gstThresholdInr = draft.gstThresholdInr.trim() === '' ? null : Number(draft.gstThresholdInr);
    const result = await setMerchantOverride(auth, buyerId, { marginPct, gstThresholdInr });
    if (result.ok) {
      await load(auth);
    } else {
      setError(`Save failed (${result.status}).`);
    }
    setSavingId(null);
  }

  if (!unlocked) {
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
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="topbar-brand">
          <h1>Hisaab — Merchant</h1>
        </Link>
        <div className="badges">
          <span className="badge">default margin: {data ? data.defaults.marginPct * 100 : ''}%</span>
          <span className="badge">default GST threshold: ₹{data?.defaults.gstThresholdInr.toLocaleString('en-IN')}</span>
        </div>
      </div>

      <div className="merchant-body">
        {error && <div className="merchant-error">{error}</div>}

        <h2 className="merchant-section-title">Buyers</h2>

        {data?.buyers.length === 0 ? (
          <p className="merchant-empty">No buyers yet — overrides can still be set ahead of a buyer's first order.</p>
        ) : (
          <div className="merchant-table-card">
            <table className="merchant-table">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Completed orders</th>
                  <th>Auto-approve limit</th>
                  <th>Margin override (%)</th>
                  <th>GST threshold override (₹)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data?.buyers.map((b: MerchantBuyer) => (
                  <tr key={b.buyerId}>
                    <td className="merchant-buyer-id">{b.buyerId}</td>
                    <td>{b.limits.completedOrders}</td>
                    <td className="merchant-limit">
                      ₹{b.limits.valueLimit.toLocaleString('en-IN')} / {b.limits.qtyLimit} units
                      {b.limits.trustApplied && <span className="merchant-limit-raised">trust-raised</span>}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="default"
                        value={drafts[b.buyerId]?.marginPct ?? ''}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [b.buyerId]: { ...d[b.buyerId], marginPct: e.target.value } }))
                        }
                        className="merchant-input"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="1000"
                        placeholder="default"
                        value={drafts[b.buyerId]?.gstThresholdInr ?? ''}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [b.buyerId]: { ...d[b.buyerId], gstThresholdInr: e.target.value } }))
                        }
                        className="merchant-input"
                      />
                    </td>
                    <td>
                      <button
                        className="btn primary merchant-save-btn"
                        disabled={savingId === b.buyerId}
                        onClick={() => handleSave(b.buyerId)}
                      >
                        {savingId === b.buyerId ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
