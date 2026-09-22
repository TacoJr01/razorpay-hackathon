'use client';

import { useEffect, useState } from 'react';
import { useMerchantAuth } from '../../../lib/merchantAuth';
import { fetchMerchantAnalytics, type MerchantAnalytics } from '../../../lib/api';

export default function MerchantAnalyticsPage() {
  const auth = useMerchantAuth();
  const [data, setData] = useState<MerchantAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMerchantAnalytics(auth).then((result) => {
      if (!result.ok) {
        setError(`Request failed (${result.status}).`);
        return;
      }
      setData(result.data);
    });
  }, [auth]);

  return (
    <div className="merchant-body">
      <h2 className="merchant-section-title">Analytics</h2>
      {error && <div className="merchant-error">{error}</div>}
      {!data && !error && <p className="merchant-empty">Loading…</p>}

      {data && (
        <>
          <div className="merchant-stat-grid">
            <div className="merchant-stat-card">
              <div className="merchant-stat-label">Total orders</div>
              <div className="merchant-stat-value">{data.totalOrders}</div>
            </div>
            <div className="merchant-stat-card">
              <div className="merchant-stat-label">Total value</div>
              <div className="merchant-stat-value">₹{data.totalValue.toLocaleString('en-IN')}</div>
            </div>
            <div className="merchant-stat-card">
              <div className="merchant-stat-label">Avg order value</div>
              <div className="merchant-stat-value">
                ₹{Math.round(data.avgOrderValue).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="merchant-stat-card">
              <div className="merchant-stat-label">Gate rate</div>
              <div className="merchant-stat-value">{Math.round(data.gating.gateRate * 100)}%</div>
              <div className="merchant-stat-sub">
                {data.gating.gatedCount} gated · {data.gating.autoApprovedCount} auto-approved
              </div>
            </div>
            <div className="merchant-stat-card">
              <div className="merchant-stat-label">Discount floor refusals</div>
              <div className="merchant-stat-value">{data.discountFloor.refused}</div>
              <div className="merchant-stat-sub">of {data.discountFloor.checked} checked</div>
            </div>
          </div>

          <h2 className="merchant-section-title" style={{ marginTop: 32 }}>Top buyers</h2>
          {data.topBuyers.length === 0 ? (
            <p className="merchant-empty">No orders yet to rank.</p>
          ) : (
            <div className="merchant-table-card">
              <table className="merchant-table">
                <thead>
                  <tr>
                    <th>Buyer</th>
                    <th>Orders</th>
                    <th>Total value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topBuyers.map((b) => (
                    <tr key={b.buyerId}>
                      <td className="merchant-buyer-id">{b.buyerId}</td>
                      <td>{b.orders}</td>
                      <td>₹{b.value.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
