import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { listAuditEntries, verifyChain, auditEvents } from '../audit/auditService.js';
import type { AuditEntry } from '@b2b-agent/shared';

export const auditRoute = new Hono();

auditRoute.get('/', (c) => {
  return c.json(listAuditEntries());
});

auditRoute.get('/verify', (c) => {
  return c.json(verifyChain());
});

/** Live feed: existing entries first, then every newly appended entry, pushed as SSE. */
auditRoute.get('/stream', async (c) => {
  return streamSSE(c, async (stream) => {
    for (const entry of listAuditEntries()) {
      await stream.writeSSE({ event: 'audit', data: JSON.stringify(entry) });
    }

    let closed = false;
    stream.onAbort(() => {
      closed = true;
    });

    const listener = (entry: AuditEntry) => {
      if (closed) return;
      stream.writeSSE({ event: 'audit', data: JSON.stringify(entry) }).catch(() => {});
    };
    auditEvents.on('entry', listener);

    while (!closed) {
      await stream.sleep(15000);
      if (!closed) {
        await stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {
          closed = true;
        });
      }
    }
    auditEvents.off('entry', listener);
  });
});
