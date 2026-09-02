import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

const dataDir = fileURLToPath(new URL('../../data', import.meta.url));
mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(fileURLToPath(new URL('../../data/app.db', import.meta.url)));
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
export { sqlite };
