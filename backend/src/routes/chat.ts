import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ModelMessage } from 'ai';
import { runAgentTurn } from '../agent/loop.js';
import { getSessionMessages, setSessionMessages } from '../agent/sessions.js';

export const chatRoute = new Hono();

chatRoute.post('/', async (c) => {
  const { sessionId, message } = await c.req.json<{ sessionId: string; message: string }>();
  if (!sessionId || !message) {
    return c.json({ error: 'sessionId and message are required' }, 400);
  }

  const buyerId = sessionId;
  const history = await getSessionMessages(sessionId);
  const messages: ModelMessage[] = [...history, { role: 'user', content: message }];

  return streamSSE(c, async (stream) => {
    try {
      const { messages: updated } = await runAgentTurn(messages, buyerId, async (event) => {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      });
      await setSessionMessages(sessionId, updated);
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ type: 'done' }) });
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : String(err) }),
      });
    }
  });
});
