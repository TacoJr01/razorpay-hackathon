'use client';

import { useEffect, useState } from 'react';
import { fetchBuyerGSTIN, fetchBuyerLimits, getSessionId } from '../../../lib/api';
import type { BuyerLimits } from '@b2b-agent/shared';

const TRUST_MIN_ORDERS = 3;

export default function DemoAccount() {
  const [limits, setLimits] = useState<BuyerLimits | null>(null);
  const [gstin, setGstin] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const buyerId = getSessionId();
    fetchBuyerLimits(buyerId).then(setLimits);
    fetchBuyerGSTIN(buyerId).then((r) => setGstin(r.gstin));
  }, []);

  const progress = limits ? Math.min(limits.completedOrders, TRUST_MIN_ORDERS) : 0;

  return (
    <div className="merchant-body">
      <h2 className="merchant-section-title">Account</h2>

      <div className="merchant-stat-grid">
        <div className="merchant-stat-card">
          <div className="merchant-stat-label">Completed orders</div>
          <div className="merchant-stat-value">{limits?.completedOrders ?? '—'}</div>
        </div>
        <div className="merchant-stat-card">
          <div className="merchant-stat-label">Auto-approve limit</div>
          <div className="merchant-stat-value">
            {limits ? `₹${limits.valueLimit.toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="merchant-stat-sub">{limits ? `${limits.qtyLimit} units per order` : ''}</div>
        </div>
        <div className="merchant-stat-card">
          <div className="merchant-stat-label">Trust tier</div>
          <div className="merchant-stat-value">{limits?.trustApplied ? 'Raised' : 'Standard'}</div>
          <div className="merchant-stat-sub">
            {limits && !limits.trustApplied
              ? `${progress}/${TRUST_MIN_ORDERS} orders toward trust-raised limits`
              : limits?.trustApplied
                ? 'Limits raised from your order history'
                : ''}
          </div>
        </div>
        <div className="merchant-stat-card">
          <div className="merchant-stat-label">GSTIN on file</div>
          <div className="merchant-stat-value">{gstin === undefined ? '—' : gstin ?? 'Not provided'}</div>
          <div className="merchant-stat-sub">
            {gstin ? 'Verified for GST-threshold orders' : 'Provide it in chat when asked, for orders above the GST threshold'}
          </div>
        </div>
      </div>
    </div>
  );
}
