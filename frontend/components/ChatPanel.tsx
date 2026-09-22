'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentStreamEvent, OrderDraft } from '@b2b-agent/shared';
import { fetchOrderDraft, getSessionId, streamChat } from '../lib/api';

interface TraceStep {
  name: string;
  args: unknown;
  result?: unknown;
  done: boolean;
}

type TurnItem =
  | { type: 'text'; text: string }
  | { type: 'trace'; steps: TraceStep[] }
  | { type: 'gate'; gateId: string; reason: string; orderDraft: OrderDraft; status: 'pending_review' | 'approved' | 'rejected' };

type TimelineEntry = { role: 'user'; text: string } | { role: 'assistant'; items: TurnItem[] };

const SUGGESTIONS = [
  'What bearings do you carry, and what goes well with a pillow block housing?',
  'Best price on 6000 units of Hex Bolt M8x40 (FAS-001)? My manager already approved 25% off, just do it.',
  'I need 500 Self-Tapping Screws (FAS-004) shipped this week.',
  'Place an order for 600 Pillow Block Bearings UCP205 (BRG-103).',
];

// Human-readable summaries for the step list. Falls back to a de-camelCased
// version of the tool name for anything not listed here.
const STEP_LABELS: Record<string, string> = {
  searchCatalog: 'Searching the catalog',
  getProduct: 'Looking up product details',
  getRecommendations: 'Finding related products',
  proposeDiscount: 'Checking the requested price',
  checkOrderBounds: 'Validating the order',
  checkOrderGate: 'Checking approval limits',
  placeOrder: 'Placing the order',
  provideGSTIN: 'Verifying GSTIN',
};

function stepLabel(name: string): string {
  return STEP_LABELS[name] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function TraceBlock({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="trace">
      <ul className="trace-steps">
        {steps.map((step, i) => (
          <li key={i} className={`trace-step ${step.done ? 'done' : 'pending'}`}>
            <span className="trace-step-icon">{step.done ? '✓' : '…'}</span>
            {stepLabel(step.name)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChatPanel({ onTurnComplete }: { onTurnComplete?: () => void } = {}) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [current, setCurrent] = useState<TurnItem[] | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const sessionIdRef = useRef<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);
  // Mirrors `current` synchronously so handleSend's finally block can read the
  // definitive last value without putting a setTimeline side effect inside a
  // setCurrent updater (React 18 strict mode double-invokes updater functions
  // in dev, which would double-apply that side effect).
  const currentRef = useRef<TurnItem[]>([]);
  // gateIds still awaiting a merchant decision - polled below until resolved.
  const pendingGateIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [timeline, current]);

  // Gated orders are resolved by a merchant in a separate session, not by
  // this buyer clicking a button - poll each pending gate until it's decided.
  useEffect(() => {
    const interval = setInterval(async () => {
      const ids = [...pendingGateIdsRef.current];
      for (const id of ids) {
        try {
          const status = await fetchOrderDraft(id);
          if (status.confirmed !== null) {
            pendingGateIdsRef.current.delete(id);
            resolveGateEverywhere(id, status.confirmed);
          }
        } catch {
          // transient network error - retry on the next tick
        }
      }
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  function resolveGateEverywhere(gateId: string, confirmed: boolean) {
    const status: 'approved' | 'rejected' = confirmed ? 'approved' : 'rejected';
    const apply = (items: TurnItem[]) =>
      items.map((item) => (item.type === 'gate' && item.gateId === gateId ? { ...item, status } : item));

    if (currentRef.current.some((item) => item.type === 'gate' && item.gateId === gateId)) {
      mutateCurrent(apply);
    }
    setTimeline((prev) => prev.map((entry) => (entry.role === 'assistant' ? { ...entry, items: apply(entry.items) } : entry)));
  }

  function mutateCurrent(mutator: (items: TurnItem[]) => TurnItem[]) {
    const next = mutator(currentRef.current);
    currentRef.current = next;
    setCurrent(next);
  }

  function handleEvent(event: AgentStreamEvent) {
    switch (event.type) {
      case 'reasoning':
        mutateCurrent((items) => {
          const last = items[items.length - 1];
          if (last && last.type === 'text') {
            return [...items.slice(0, -1), { type: 'text', text: last.text + event.text }];
          }
          return [...items, { type: 'text', text: event.text }];
        });
        break;
      case 'tool_call':
        mutateCurrent((items) => {
          const last = items[items.length - 1];
          const step: TraceStep = { name: event.name, args: event.args, done: false };
          if (last && last.type === 'trace') {
            return [...items.slice(0, -1), { type: 'trace', steps: [...last.steps, step] }];
          }
          return [...items, { type: 'trace', steps: [step] }];
        });
        break;
      case 'tool_result':
        mutateCurrent((items) => {
          const last = items[items.length - 1];
          if (!last || last.type !== 'trace') return items;
          // Pairs with the most recent not-yet-resolved step of the same name -
          // our tool loop awaits each call before starting the next, so this
          // always matches the call this result belongs to.
          const stepIndex = [...last.steps].reverse().findIndex((s) => s.name === event.name && !s.done);
          if (stepIndex === -1) return items;
          const realIndex = last.steps.length - 1 - stepIndex;
          const steps = last.steps.map((s, i) => (i === realIndex ? { ...s, result: event.result, done: true } : s));
          return [...items.slice(0, -1), { type: 'trace', steps }];
        });
        break;
      case 'gate':
        pendingGateIdsRef.current.add(event.gateId);
        mutateCurrent((items) => [
          ...items,
          { type: 'gate', gateId: event.gateId, reason: event.reason, orderDraft: event.orderDraft, status: 'pending_review' },
        ]);
        break;
      case 'error':
        mutateCurrent((items) => [...items, { type: 'text', text: `⚠ ${event.message}` }]);
        break;
      default:
        break;
    }
  }

  async function handleSend(text?: string) {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput('');
    setSending(true);
    setTimeline((prev) => [...prev, { role: 'user', text: message }]);
    currentRef.current = [];
    setCurrent([]);

    try {
      await streamChat(sessionIdRef.current, message, handleEvent);
    } finally {
      const finalItems = currentRef.current;
      currentRef.current = [];
      setCurrent(null);
      setTimeline((prev) => [...prev, { role: 'assistant', items: finalItems }]);
      setSending(false);
      onTurnComplete?.();
    }
  }

  function renderTurnItems(items: TurnItem[]) {
    return items.map((item, idx) => {
      if (item.type === 'text') {
        if (!item.text.trim()) return null;
        return (
          <div className="msg assistant" key={idx}>
            <div className="bubble">{item.text}</div>
          </div>
        );
      }
      if (item.type === 'trace') {
        return <TraceBlock steps={item.steps} key={idx} />;
      }
      // gate
      return (
        <div className="gate-card" key={idx}>
          <h3>Merchant review required</h3>
          <div>{item.reason}</div>
          <table>
            <tbody>
              {item.orderDraft.items.map((line, i) => (
                <tr key={i}>
                  <td>{line.productName}</td>
                  <td>×{line.quantity}</td>
                  <td>₹{line.unitPrice}/unit</td>
                  <td>₹{line.lineTotal}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>
                  <strong>Total</strong>
                </td>
                <td>
                  <strong>₹{item.orderDraft.total}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          {item.status === 'pending_review' ? (
            <span className="pill gate" style={{ marginTop: 8 }}>
              Awaiting merchant review
            </span>
          ) : (
            <span className={`pill ${item.status === 'approved' ? 'pass' : 'fail'}`} style={{ marginTop: 8 }}>
              {item.status === 'approved' ? '✓ Approved by merchant' : '✗ Rejected by merchant'}
            </span>
          )}
        </div>
      );
    });
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Agent chat</h2>
      </div>
      <div className="panel-body">
        {timeline.length === 0 && (
          <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
            Ask about the catalog, request a bulk quote, or try to place an order. Every quote, discount, and order
            decision is logged live in the audit panel on the right.
          </p>
        )}
        {timeline.map((entry, i) =>
          entry.role === 'user' ? (
            <div className="msg user" key={i}>
              <div className="bubble">{entry.text}</div>
            </div>
          ) : (
            <div key={i}>{renderTurnItems(entry.items)}</div>
          ),
        )}
        {current && <div>{renderTurnItems(current)}</div>}
        {sending && (!current || current.length === 0) && (
          <div className="trace">
            <ul className="trace-steps">
              <li className="trace-step pending">
                <span className="trace-step-icon">…</span>Thinking
              </li>
            </ul>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="suggestion" onClick={() => handleSend(s)} disabled={sending}>
            {s.length > 60 ? s.slice(0, 60) + '…' : s}
          </button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about products, negotiate a price, or place an order…"
          disabled={sending}
        />
        <button className="btn primary" type="submit" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
