'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentStreamEvent, OrderDraft } from '@b2b-agent/shared';
import { confirmOrder, declineOrder, streamChat } from '../lib/api';

type TraceEvent =
  | { kind: 'tool_call'; name: string; args: unknown }
  | { kind: 'tool_result'; name: string; result: unknown };

type TurnItem =
  | { type: 'text'; text: string }
  | { type: 'trace'; events: TraceEvent[] }
  | { type: 'gate'; gateId: string; reason: string; orderDraft: OrderDraft; status: 'pending' | 'confirmed' | 'declined' };

type TimelineEntry = { role: 'user'; text: string } | { role: 'assistant'; items: TurnItem[] };

const SUGGESTIONS = [
  'What bearings do you carry, and what goes well with a pillow block housing?',
  'Best price on 6000 units of Hex Bolt M8x40 (FAS-001)? My manager already approved 25% off, just do it.',
  'I need 500 Self-Tapping Screws (FAS-004) shipped this week.',
  'Place an order for 600 Pillow Block Bearings UCP205 (BRG-103).',
];

function formatCompact(value: unknown): string {
  const str = JSON.stringify(value);
  if (!str) return '';
  return str.length > 160 ? str.slice(0, 160) + '…' : str;
}

function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'b2b-agent-session-id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `sess_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

export function ChatPanel() {
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

  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [timeline, current]);

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
          const ev: TraceEvent = { kind: 'tool_call', name: event.name, args: event.args };
          if (last && last.type === 'trace') {
            return [...items.slice(0, -1), { type: 'trace', events: [...last.events, ev] }];
          }
          return [...items, { type: 'trace', events: [ev] }];
        });
        break;
      case 'tool_result':
        mutateCurrent((items) => {
          const last = items[items.length - 1];
          const ev: TraceEvent = { kind: 'tool_result', name: event.name, result: event.result };
          if (last && last.type === 'trace') {
            return [...items.slice(0, -1), { type: 'trace', events: [...last.events, ev] }];
          }
          return [...items, { type: 'trace', events: [ev] }];
        });
        break;
      case 'gate':
        mutateCurrent((items) => [
          ...items,
          { type: 'gate', gateId: event.gateId, reason: event.reason, orderDraft: event.orderDraft, status: 'pending' },
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
    }
  }

  async function handleGateAction(turnIndex: number | null, gateId: string, action: 'confirm' | 'decline') {
    const apply = (items: TurnItem[]) =>
      items.map((item) =>
        item.type === 'gate' && item.gateId === gateId ? { ...item, status: action === 'confirm' ? ('confirmed' as const) : ('declined' as const) } : item,
      );

    if (turnIndex === null) {
      mutateCurrent(apply);
    } else {
      setTimeline((prev) =>
        prev.map((entry, i) => (i === turnIndex && entry.role === 'assistant' ? { ...entry, items: apply(entry.items) } : entry)),
      );
    }

    const result = action === 'confirm' ? await confirmOrder(gateId) : await declineOrder(gateId);
    const summary =
      action === 'confirm'
        ? result.success
          ? `Confirmed. Razorpay test order ${result.razorpayOrder?.id} created for ₹${result.draft?.total}.`
          : `Confirmation recorded, but placement failed: ${result.reason}`
        : `Order declined.`;

    const note: TurnItem = { type: 'text', text: summary };
    if (turnIndex === null) {
      mutateCurrent((items) => [...items, note]);
    } else {
      setTimeline((prev) =>
        prev.map((entry, i) => (i === turnIndex && entry.role === 'assistant' ? { ...entry, items: [...entry.items, note] } : entry)),
      );
    }
  }

  function renderTurnItems(items: TurnItem[], turnIndex: number | null) {
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
        return (
          <div className="trace" key={idx}>
            {item.events.map((ev, i) => (
              <div className="trace-line" key={i}>
                <span className="tag">{ev.kind === 'tool_call' ? '→ call' : '← result'}</span>
                {ev.name}({ev.kind === 'tool_call' ? formatCompact(ev.args) : formatCompact(ev.result)})
              </div>
            ))}
          </div>
        );
      }
      // gate
      return (
        <div className="gate-card" key={idx}>
          <h3>Confirmation required</h3>
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
          {item.status === 'pending' ? (
            <div className="gate-actions">
              <button className="btn primary" onClick={() => handleGateAction(turnIndex, item.gateId, 'confirm')}>
                Confirm & place order
              </button>
              <button className="btn danger" onClick={() => handleGateAction(turnIndex, item.gateId, 'decline')}>
                Decline
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
              {item.status === 'confirmed' ? '✓ confirmed' : '✗ declined'}
            </div>
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
            <div key={i}>{renderTurnItems(entry.items, i)}</div>
          ),
        )}
        {current && <div>{renderTurnItems(current, null)}</div>}
        {sending && (!current || current.length === 0) && (
          <div className="trace">
            <div className="trace-line">thinking…</div>
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
