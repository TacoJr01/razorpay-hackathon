'use client';

import { useEffect, useRef, useState } from 'react';
import type { AuditEntry, ChainVerificationResult } from '@b2b-agent/shared';
import { subscribeAuditStream, verifyAuditChain } from '../lib/api';

function shortHash(h: string) {
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
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
              <span className="entry-action">#{e.id} {e.actionType}</span>
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
            <div className="entry-hash">
              prev {shortHash(e.prevHash)} → hash {shortHash(e.hash)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
