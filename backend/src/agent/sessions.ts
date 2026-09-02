import type { ModelMessage } from 'ai';
import { redis } from '../redis/client.js';

const TTL_SECONDS = 60 * 60 * 24; // 1 day - demo chat history, not the durable record (that's the audit trail)

function key(sessionId: string): string {
  return `b2b-agent:session:${sessionId}:messages`;
}

export async function getSessionMessages(sessionId: string): Promise<ModelMessage[]> {
  const raw = await redis.get(key(sessionId));
  return raw ? (JSON.parse(raw) as ModelMessage[]) : [];
}

export async function setSessionMessages(sessionId: string, messages: ModelMessage[]): Promise<void> {
  await redis.set(key(sessionId), JSON.stringify(messages), 'EX', TTL_SECONDS);
}
