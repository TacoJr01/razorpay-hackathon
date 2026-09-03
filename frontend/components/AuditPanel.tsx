'use client';

import { useEffect, useRef, useState } from 'react';
import type { AuditEntry, ChainVerificationResult } from '@b2b-agent/shared';
import { subscribeAuditStream, verifyAuditChain } from '../lib/api';

const ACTION_LABELS: Record<string, string> = {
  discount_proposal: 'Discount checked',
  order_line_bound_check: 'Order line checked',
  order_gate_check: 'Gate check',
  order_placement_blocked: 'Order blocked',
  order_placed: 'Order placed',
  order_declined_by_user: 'Order declined',
  order_confirmed_by_user: 'Order confirmed',
  buyer_trust_computed: 'Trust limit computed',
  gstin_provided: 'GSTIN verified',
  catalog_lookup: 'Catalog lookup',
};

function actionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] ?? actionType.replace(/_/g, ' ');
}

function timeOf(ts: string) {
  return new Date(ts).toLocaleTimeString();
}

export function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<ChainVerificationResult | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeAuditStream((entry) => {
      setEntries((prev) => (prev.some((e) => e.id === entry.id) ? prev : [...prev, entry]));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [entries.length]);

  async function handleVerify() {
    setVerifying(true);
    try {
      setResult(await verifyAuditChain());
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Audit trail (hash-chained)</h2>
        <div className="audit-toolbar">
          {result && (
            <span className={`verify-result ${result.valid ? 'valid' : 'invalid'}`}>
              {result.valid
                ? `✓ chain valid (${result.checkedCount} entries)`
                : `✗ broken at #${result.brokenAtId}`}
            </span>
          )}
          <button className="btn" onClick={handleVerify} disabled={verifying}>
            {verifying ? 'Verifying…' : 'Verify chain'}
          </button>
        </div>
      </div>
      <div className="panel-body">
        {entries.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No audit entries yet. Ask the agent something to see the chain build live.</p>}
        {entries.map((e) => (
          <div key={e.id} className={`entry ${result && !result.valid && e.id >= (result.brokenAtId ?? Infinity) ? 'broken' : ''}`}>
            <div className="entry-top">
              <span className="entry-action">
                {actionLabel(e.actionType)}
                <span className="entry-code">{e.actionType} · #{e.id}</span>
              </span>
              <span className="entry-time">{timeOf(e.timestamp)}</span>
            </div>
            <div className="entry-desc">{e.description}</div>
            <div className="entry-meta">
              {e.boundChecked !== 'none' && <span className="pill">bound: {e.boundChecked}</span>}
              {e.boundResult !== 'n/a' && (
                <span className={`pill ${e.boundResult === 'pass' ? 'pass' : 'fail'}`}>{e.boundResult}</span>
              )}
              {e.gateTriggered && (
                <span className="pill gate">
                  gate {e.gateConfirmed === null ? 'pending' : e.gateConfirmed ? 'confirmed' : 'declined'}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
