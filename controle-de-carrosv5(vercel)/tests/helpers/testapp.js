'use strict';
/**
 * Cria um app para teste. Por padrão usa SQLite em memória. Com TEST_PG=1 usa um PostgreSQL local
 * (TEST_PG_URL, padrão postgres://postgres@127.0.0.1:5432), com um banco novo para cada app.
 */
const { createApp } = require('../../server/app');

let n = 0;
async function createTestApp(extra = {}) {
  const base = { port: 0, host: '127.0.0.1', ...extra };
  if (process.env.TEST_PG !== '1') return createApp({ dbPath: ':memory:', ...base });
  const { Pool } = require('./pgwire');
  const u = new URL(process.env.TEST_PG_URL || 'postgres://postgres@127.0.0.1:5432');
  const mk = (database) => new Pool({ host: u.hostname, port: Number(u.port) || 5432, user: u.username || 'postgres', database });
  const admin = mk('postgres');
  const name = `t_${process.pid}_${Date.now()}_${++n}`;
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const app = await createApp({ ...base, pgPool: mk(name), closePool: true });
  const close = app.close;
  app.close = async () => {
    await close();
    const a = mk('postgres');
    await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
    await a.end();
  };
  return app;
}
module.exports = { createTestApp };
