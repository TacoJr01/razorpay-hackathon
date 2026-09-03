import type { AgentStreamEvent, AuditEntry, BuyerLimits, ChainVerificationResult, PublicProduct } from '@b2b-agent/shared';

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';

/** Each browser session is one synthetic buyer - this id doubles as buyerId throughout the backend. */
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'b2b-agent-session-id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `sess_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

/**
 * The chat endpoint needs a POST body (the message), so it can't use the
 * browser's EventSource (GET-only). We stream the fetch response body
 * ourselves and parse the same `event: ...\ndata: ...\n\n` framing.
 */
export async function streamChat(
  sessionId: string,
  message: string,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
    signal,
  });

  if (!res.ok || !res.body) {
    onEvent({ type: 'error', message: `Chat request failed: ${res.status} ${res.statusText}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);

      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const jsonStr = dataLine.slice(5).trim();
      try {
        const event = JSON.parse(jsonStr) as AgentStreamEvent;
        onEvent(event);
      } catch {
        // ignore malformed frame
      }
    }
  }
}

export function subscribeAuditStream(onEntry: (entry: AuditEntry) => void): () => void {
  const es = new EventSource(`${BACKEND_URL}/audit/stream`);
  es.addEventListener('audit', (e) => {
    try {
      onEntry(JSON.parse((e as MessageEvent).data));
    } catch {
      // ignore
    }
  });
  return () => es.close();
}

export async function verifyAuditChain(): Promise<ChainVerificationResult> {
  const res = await fetch(`${BACKEND_URL}/audit/verify`);
  return res.json();
}

export async function fetchProducts(): Promise<PublicProduct[]> {
  const res = await fetch(`${BACKEND_URL}/products`);
  return res.json();
}

export async function confirmOrder(draftId: string) {
  const res = await fetch(`${BACKEND_URL}/orders/${draftId}/confirm`, { method: 'POST' });
  return res.json();
}

export async function declineOrder(draftId: string) {
  const res = await fetch(`${BACKEND_URL}/orders/${draftId}/decline`, { method: 'POST' });
  return res.json();
}

export async function fetchBuyerLimits(buyerId: string): Promise<BuyerLimits> {
  const res = await fetch(`${BACKEND_URL}/buyers/${buyerId}/limits`);
  return res.json();
}
