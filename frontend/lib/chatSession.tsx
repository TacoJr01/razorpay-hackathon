'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AgentStreamEvent, OrderDraft } from '@b2b-agent/shared';
import { fetchOrderDraft, getSessionId, streamChat } from './api';

export interface TraceStep {
  name: string;
  args: unknown;
  result?: unknown;
  done: boolean;
}

export type TurnItem =
  | { type: 'text'; text: string }
  | { type: 'trace'; steps: TraceStep[] }
  | { type: 'gate'; gateId: string; reason: string; orderDraft: OrderDraft; status: 'pending_review' | 'approved' | 'rejected' };

export type TimelineEntry = { role: 'user'; text: string } | { role: 'assistant'; items: TurnItem[] };

interface ChatSessionValue {
  timeline: TimelineEntry[];
  current: TurnItem[] | null;
  sending: boolean;
  sendMessage: (text: string) => Promise<void>;
}

const ChatSessionContext = createContext<ChatSessionValue | null>(null);

/**
 * Owns the conversation instead of the Chat page owning it, so switching to
 * Orders/Catalog/Account (which unmounts the page) doesn't lose the
 * transcript or abandon a message that's still streaming - this provider
 * lives in the /demo layout, which stays mounted across those tabs.
 */
export function ChatSessionProvider({ children }: { children: React.ReactNode }) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [current, setCurrent] = useState<TurnItem[] | null>(null);
  const [sending, setSending] = useState(false);
  const sessionIdRef = useRef<string>('');
  // Mirrors `current` synchronously so sendMessage's finally block can read the
  // definitive last value without putting a setTimeline side effect inside a
  // setCurrent updater (React 18 strict mode double-invokes updater functions
  // in dev, which would double-apply that side effect).
  const currentRef = useRef<TurnItem[]>([]);
  // gateIds still awaiting a merchant decision - polled below until resolved.
  const pendingGateIdsRef = useRef<Set<string>>(new Set());
  // Mirrors `sending` so sendMessage can guard against a double-submit
  // without needing `sending` in its own dependency array (which would
  // otherwise force a new function identity on every send).
  const sendingRef = useRef(false);

  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  // Gated orders are resolved by a merchant in a separate session, not by
  // this buyer clicking a button - poll each pending gate until it's decided.
  // Runs at the layout level so it keeps working even while the buyer is
  // looking at a different tab.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mutateCurrent(mutator: (items: TurnItem[]) => TurnItem[]) {
    const next = mutator(currentRef.current);
    currentRef.current = next;
    setCurrent(next);
  }

  function resolveGateEverywhere(gateId: string, confirmed: boolean) {
    const status: 'approved' | 'rejected' = confirmed ? 'approved' : 'rejected';
    const apply = (items: TurnItem[]) =>
      items.map((item) => (item.type === 'gate' && item.gateId === gateId ? { ...item, status } : item));

    if (currentRef.current.some((item) => item.type === 'gate' && item.gateId === gateId)) {
      mutateCurrent(apply);
    }
    setTimeline((prev) => prev.map((entry) => (entry.role === 'assistant' ? { ...entry, items: apply(entry.items) } : entry)));
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

  const sendMessage = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || sendingRef.current) return;
    sendingRef.current = true;
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
      sendingRef.current = false;
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ChatSessionContext.Provider value={{ timeline, current, sending, sendMessage }}>
      {children}
    </ChatSessionContext.Provider>
  );
}

export function useChatSession(): ChatSessionValue {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) {
    throw new Error('useChatSession() called outside the demo layout - the chat session is not available yet.');
  }
  return ctx;
}
