'use client';

import { useEffect, useState } from 'react';
import { ChatPanel } from '../components/ChatPanel';
import { AuditPanel } from '../components/AuditPanel';
import { BACKEND_URL } from '../lib/api';
import type { BOUND_CONFIG } from '@b2b-agent/shared';

export default function Home() {
  const [config, setConfig] = useState<typeof BOUND_CONFIG | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/config`)
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>B2B Commerce Agent — Demo</h1>
        <div className="badges">
          {config && (
            <>
              <span className="badge">discount floor: cost + {config.MIN_MARGIN_PCT * 100}%</span>
              <span className="badge">gate: order &gt; ₹{config.GATE_ORDER_VALUE_INR.toLocaleString('en-IN')}</span>
              <span className="badge">gate: qty &gt; {config.GATE_QUANTITY_UNITS} units</span>
            </>
          )}
        </div>
      </div>
      <div className="main-grid">
        <ChatPanel />
        <AuditPanel />
      </div>
    </div>
  );
}
