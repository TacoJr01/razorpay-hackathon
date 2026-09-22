'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMerchantAuth } from '../../lib/merchantAuth';
import { fetchMerchantBuyers, setMerchantOverride, type MerchantBuyer, type MerchantBuyersResponse } from '../../lib/api';

export default function MerchantBuyers() {
  const auth = useMerchantAuth();
  const [data, setData] = useState<MerchantBuyersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { marginPct: string; gstThresholdInr: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await fetchMerchantBuyers(auth);
    if (!result.ok) {
      setError(`Request failed (${result.status}).`);
      return;
    }
    setData(result.data);
    const nextDrafts: Record<string, { marginPct: string; gstThresholdInr: string }> = {};
    for (const b of result.data.buyers) {
      nextDrafts[b.buyerId] = {
        marginPct: b.override?.marginPct != null ? String(b.override.marginPct * 100) : '',
        gstThresholdInr: b.override?.gstThresholdInr != null ? String(b.override.gstThresholdInr) : '',
      };
    }
    setDrafts(nextDrafts);
  }, [auth]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(buyerId: string) {
    const draft = drafts[buyerId];
    setSavingId(buyerId);
    const marginPct = draft.marginPct.trim() === '' ? null : Number(draft.marginPct) / 100;
    const gstThresholdInr = draft.gstThresholdInr.trim() === '' ? null : Number(draft.gstThresholdInr);
    const result = await setMerchantOverride(auth, buyerId, { marginPct, gstThresholdInr });
    if (result.ok) {
      await load();
    } else {
      setError(`Save failed (${result.status}).`);
    }
    setSavingId(null);
  }

  return (
    <div className="merchant-body">
      <div className="merchant-defaults-row">
        <span className="badge">default margin: {data ? data.defaults.marginPct * 100 : ''}%</span>
        <span className="badge">default GST threshold: ₹{data?.defaults.gstThresholdInr.toLocaleString('en-IN')}</span>
      </div>

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
  );
}
