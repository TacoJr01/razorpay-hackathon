import { redis } from '../redis/client.js';

const TTL_SECONDS = 60 * 60 * 24; // 1 day - same demo-scoped lifetime as sessions.ts

function key(buyerId: string): string {
  return `b2b-agent:buyer:${buyerId}:gstin`;
}

export async function getBuyerGSTIN(buyerId: string): Promise<string | null> {
  return redis.get(key(buyerId));
}

export async function setBuyerGSTIN(buyerId: string, gstin: string): Promise<void> {
  await redis.set(key(buyerId), gstin, 'EX', TTL_SECONDS);
}
