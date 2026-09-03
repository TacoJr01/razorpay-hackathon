import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { runMigrations } from './db/migrate.js';
import { getAllProducts } from './db/catalog.js';
import { chatRoute } from './routes/chat.js';
import { auditRoute } from './routes/audit.js';
import { ordersRoute } from './routes/orders.js';
import { buyersRoute } from './routes/buyers.js';
import { BOUND_CONFIG, toPublicProduct } from '@b2b-agent/shared';

runMigrations();

const app = new Hono();

app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true }));

app.get('/config', (c) => c.json(BOUND_CONFIG));

app.get('/products', (c) => c.json(getAllProducts().map(toPublicProduct)));

app.route('/chat', chatRoute);
app.route('/audit', auditRoute);
app.route('/orders', ordersRoute);
app.route('/buyers', buyersRoute);

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`backend listening on http://localhost:${info.port}`);
});
