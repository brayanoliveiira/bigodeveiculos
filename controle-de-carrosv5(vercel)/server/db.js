'use strict';
/**
 * Acesso ao banco. Dois motores com a MESMA interface assíncrona:
 *   - SQLite (node:sqlite, sem dependências): uso local / no seu computador.
 *   - PostgreSQL (pacote `pg`): uso na nuvem (Supabase + Vercel). Escolhido quando existe DATABASE_URL.
 * Interface: get, all, run, insert, exec, tx(async (db) => ...), close. O SQL do app usa `?` como parâmetro
 * (convertido para $1, $2... no Postgres) e nomes de colunas sem aspas (no Postgres ficam em minúsculas;
 * o driver devolve de volta com a caixa original: carid -> carId).
 */
const fs = require('fs');
const path = require('path');

// Colunas com letra maiúscula no código. O Postgres guarda tudo em minúsculas; aqui voltamos ao nome do código.
const CASE = Object.fromEntries(['carId', 'receiptId', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'entT', 'ovrA', 'ovrB',
  'origemId', 'fipeRef', 'paidAt', 'userId', 'entityId'].map((k) => [k.toLowerCase(), k]));

const clean = (params) => params.map((p) => (p === undefined ? null : p));

// ---------- SQLite ----------
function openSqlite(file) {
  const { DatabaseSync } = require('node:sqlite');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
    return s;
  };
  let lock = Promise.resolve();
  let inTx = false;
  const db = {
    dialect: 'sqlite', raw,
    exec: async (sql) => { raw.exec(sql); },
    run: async (sql, ...p) => { const r = stmt(sql).run(...clean(p)); return { changes: Number(r.changes) }; },
    insert: async (sql, ...p) => Number(stmt(sql).run(...clean(p)).lastInsertRowid),
    get: async (sql, ...p) => stmt(sql).get(...clean(p)),
    all: async (sql, ...p) => stmt(sql).all(...clean(p)),
    /** Executa fn dentro de uma transação (uma de cada vez). Se lançar erro, desfaz tudo. */
    async tx(fn) {
      if (inTx) return fn(db);
      const prev = lock;
      let release;
      lock = new Promise((r) => { release = r; });
      await prev;
      try {
        raw.exec('BEGIN IMMEDIATE');
        inTx = true;
        try {
          const r = await fn(db);
          raw.exec('COMMIT');
          return r;
        } catch (e) {
          raw.exec('ROLLBACK');
          throw e;
        } finally { inTx = false; }
      } finally { release(); }
    },
    close: async () => { raw.close(); },
  };
  return db;
}

// ---------- PostgreSQL ----------
const toPg = (sql) => { let n = 0; return sql.replace(/\?/g, () => `$${++n}`); };
const fixRow = (r) => { const o = {}; for (const k of Object.keys(r)) o[CASE[k] || k] = r[k]; return o; };

function handle(exec) {
  return {
    dialect: 'pg',
    exec: async (sql) => { await exec(sql); },
    run: async (sql, ...p) => { const r = await exec(toPg(sql), clean(p)); return { changes: r.rowCount }; },
    insert: async (sql, ...p) => { const r = await exec(`${toPg(sql)} RETURNING id`, clean(p)); return Number(r.rows[0].id); },
    get: async (sql, ...p) => { const r = await exec(toPg(sql), clean(p)); return r.rows[0] ? fixRow(r.rows[0]) : undefined; },
    all: async (sql, ...p) => (await exec(toPg(sql), clean(p))).rows.map(fixRow),
  };
}

function openPg(cfg) {
  let pool = cfg.pgPool;
  if (!pool) {
    const pg = require('pg');
    pg.types.setTypeParser(20, Number); // bigint (COUNT, ids) -> número
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(cfg.databaseUrl || '');
    pool = new pg.Pool({
      connectionString: cfg.databaseUrl,
      max: Number(process.env.PG_POOL_MAX) || 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      ssl: cfg.databaseSsl === false || local ? false : { rejectUnauthorized: false },
    });
    pool.on('error', (e) => console.error('[pg] conexão ociosa caiu:', e.message));
  }
  const top = handle((text, values) => pool.query(text, values));
  const db = {
    ...top,
    async tx(fn) {
      const client = await pool.connect();
      const t = handle((text, values) => client.query(text, values));
      t.tx = async (f) => f(t); // transação dentro de transação: reaproveita
      t.close = async () => {};
      t.pool = pool;
      try {
        await client.query('BEGIN');
        const r = await fn(t);
        await client.query('COMMIT');
        return r;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* conexão já caiu */ }
        throw e;
      } finally { client.release(); }
    },
    close: async () => { if (!cfg.pgPool || cfg.closePool) await pool.end(); },
    pool,
  };
  return db;
}

/** Abre o banco: Postgres se houver databaseUrl (ou pgPool), senão SQLite em dbPath. */
async function open(cfg) {
  if (typeof cfg === 'string') cfg = { dbPath: cfg };
  return cfg.databaseUrl || cfg.pgPool ? openPg(cfg) : openSqlite(cfg.dbPath);
}

/** Aplica, em ordem, os arquivos .sql que ainda não foram aplicados (pasta migrations/ no SQLite, migrations-pg/ no Postgres). */
async function migrate(db, dir) {
  dir = dir || path.join(__dirname, db.dialect === 'pg' ? 'migrations-pg' : 'migrations');
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const pending = async (d) => {
    const done = new Set((await d.all('SELECT name FROM schema_migrations')).map((r) => r.name));
    return files.filter((f) => !done.has(f));
  };
  if (!(await pending(db)).length) return;
  await db.tx(async (t) => {
    if (t.dialect === 'pg') await t.exec('SELECT pg_advisory_xact_lock(727274)'); // duas instâncias subindo juntas: uma espera a outra
    for (const f of await pending(t)) {
      await t.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      await t.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', f, new Date().toISOString());
    }
  });
}

module.exports = { open, migrate };
