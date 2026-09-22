'use client';

import { useEffect, useState } from 'react';
import { useMerchantAuth } from '../../../lib/merchantAuth';
import { fetchMerchantAudit } from '../../../lib/api';
import type { AuditEntry } from '@b2b-agent/shared';

const RESULT_OPTIONS = ['', 'pass', 'fail', 'n/a'];

export default function MerchantAuditPage() {
  const auth = useMerchantAuth();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionType, setActionType] = useState('');
  const [boundResult, setBoundResult] = useState('');

  useEffect(() => {
    fetchMerchantAudit(auth, { actionType, boundResult }).then((result) => {
      if (!result.ok) {
        setError(`Request failed (${result.status}).`);
        return;
      }
      setEntries(result.data);
    });
  }, [auth, actionType, boundResult]);

  return (
    <div className="merchant-body">
      <h2 className="merchant-section-title">Audit trail</h2>
      {error && <div className="merchant-error">{error}</div>}

      <div className="merchant-filter-row">
        <input
          type="text"
          placeholder="Filter by action type (e.g. order_gate_check)"
          value={actionType}
          onChange={(e) => setActionType(e.target.value)}
          className="merchant-input"
          style={{ width: 260 }}
        />
        <select value={boundResult} onChange={(e) => setBoundResult(e.target.value)} className="merchant-input">
          {RESULT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === '' ? 'Any result' : opt}
            </option>
          ))}
        </select>
      </div>

      {entries?.length === 0 ? (
        <p className="merchant-empty">No entries match this filter.</p>
      ) : (
        <div className="merchant-table-card">
          <table className="merchant-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Action</th>
                <th>Bound</th>
                <th>Result</th>
                <th>Gate</th>
                <th>When</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {entries?.map((e) => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td className="merchant-buyer-id">{e.actionType}</td>
                  <td className="merchant-buyer-id">{e.boundChecked}</td>
                  <td>{e.boundResult}</td>
                  <td>{e.gateTriggered ? (e.gateConfirmed === null ? 'pending' : e.gateConfirmed ? 'approved' : 'rejected') : '—'}</td>
                  <td>{new Date(e.timestamp).toLocaleTimeString()}</td>
                  <td style={{ maxWidth: 360 }}>{e.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
