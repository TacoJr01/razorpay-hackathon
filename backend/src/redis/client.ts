import Redis from 'ioredis';

/**
 * Redis holds the two pieces of state that don't belong in the durable
 * audit trail: per-session chat history and in-flight order drafts (the
 * gate/confirmation working state between "the agent evaluated an order"
 * and "the buyer confirmed or declined it"). This is separate from the
 * audit trail itself, which stays in SQLite - that's the record that must
 * survive and be independently verifiable, not this working state.
 */
export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});
