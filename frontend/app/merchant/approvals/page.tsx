'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMerchantAuth } from '../../../lib/merchantAuth';
import { approveMerchantDraft, fetchMerchantApprovals, rejectMerchantDraft, type PendingApproval } from '../../../lib/api';

export default function MerchantApprovals() {
  const auth = useMerchantAuth();
  const [pending, setPending] = useState<PendingApproval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchMerchantApprovals(auth);
    if (!result.ok) {
      setError(`Request failed (${result.status}).`);
      return;
    }
    setError(null);
    setPending(result.data);
  }, [auth]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleApprove(draftId: string) {
    setActingOn(draftId);
    await approveMerchantDraft(auth, draftId);
    await load();
    setActingOn(null);
  }

  async function handleReject(draftId: string) {
    setActingOn(draftId);
    await rejectMerchantDraft(auth, draftId, reasons[draftId]?.trim() || undefined);
    await load();
    setActingOn(null);
  }

  return (
    <div className="merchant-body">
      <h2 className="merchant-section-title">Approvals</h2>
      {error && <div className="merchant-error">{error}</div>}

      {pending?.length === 0 ? (
        <p className="merchant-empty">No orders are waiting on merchant review right now.</p>
      ) : (
        <div className="merchant-table-card">
          <table className="merchant-table">
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Why it gated</th>
                <th>Requested</th>
                <th>Reason (optional)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending?.map((p) => (
                <tr key={p.draftId}>
                  <td className="merchant-buyer-id">{p.buyerId}</td>
                  <td>{p.items.map((it) => `${it.productName} ×${it.quantity}`).join(', ')}</td>
                  <td>₹{p.total.toLocaleString('en-IN')}</td>
                  <td style={{ maxWidth: 280 }}>{p.gateReason}</td>
                  <td>{new Date(p.createdAt).toLocaleString()}</td>
                  <td>
                    <input
                      type="text"
                      placeholder="only used if rejecting"
                      value={reasons[p.draftId] ?? ''}
                      onChange={(e) => setReasons((r) => ({ ...r, [p.draftId]: e.target.value }))}
                      className="merchant-input"
                      style={{ width: 160 }}
                    />
                  </td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn primary merchant-save-btn"
                      disabled={actingOn === p.draftId}
                      onClick={() => handleApprove(p.draftId)}
                    >
                      Approve
                    </button>
                    <button
                      className="btn danger merchant-save-btn"
                      disabled={actingOn === p.draftId}
                      onClick={() => handleReject(p.draftId)}
                    >
                      Reject
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
