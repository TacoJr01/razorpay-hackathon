'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChatPanel } from '../../components/ChatPanel';
import { AuditPanel } from '../../components/AuditPanel';
import { BACKEND_URL, fetchBuyerLimits, getSessionId } from '../../lib/api';
import type { BOUND_CONFIG, BuyerLimits } from '@b2b-agent/shared';

export default function Demo() {
  const [config, setConfig] = useState<typeof BOUND_CONFIG | null>(null);
  const [limits, setLimits] = useState<BuyerLimits | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/config`)
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  const refreshLimits = useCallback(() => {
    fetchBuyerLimits(getSessionId()).then(setLimits).catch(() => {});
  }, []);

  useEffect(() => {
    refreshLimits();
  }, [refreshLimits]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="topbar-brand">
          <h1>Hisaab — Demo</h1>
        </Link>
        <div className="badges">
          {config && (
            <>
              <span className="badge">discount floor: cost + {config.MIN_MARGIN_PCT * 100}%</span>
              <span className="badge">GSTIN required above ₹{config.GST_REQUIRED_ABOVE_INR.toLocaleString('en-IN')}</span>
            </>
          )}
          {limits && (
            <span className="badge" title={`${limits.completedOrders} completed order(s) - largest ₹${limits.largestOrderValue}, ${limits.largestLineQty} units`}>
              your auto-approve limit: ₹{limits.valueLimit.toLocaleString('en-IN')} / {limits.qtyLimit} units
              {limits.trustApplied ? ' (trust-raised)' : ''}
            </span>
          )}
        </div>
      </div>
      <div className="main-grid">
        <ChatPanel onTurnComplete={refreshLimits} />
        <AuditPanel />
      </div>
    </div>
  );
}
