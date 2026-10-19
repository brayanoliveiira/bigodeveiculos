'use strict';
/**
 * Cliente mínimo de PostgreSQL (protocolo v3, consulta simples, autenticação "trust"/senha em texto) SÓ PARA TESTES.
 * Serve para rodar a suíte contra um Postgres local sem instalar o pacote `pg`. Em produção o app usa o `pg` de verdade.
 * Expõe a mesma forma de um Pool: connect() -> client { query(text, values), release() }, query(), end().
 */
const net = require('net');

const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('número inválido'); return String(v); }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  const s = String(v);
  if (s.includes('\0')) throw new Error('NUL em texto');
  return `'${s.replace(/'/g, "''")}'`;
};
const conv = (oid, s) => {
  if (s === null) return null;
  if ([20, 21, 23, 700, 701, 1700].includes(oid)) return Number(s);
  if (oid === 16) return s === 't';
  return s;
};

class Client {
  constructor(opts) { this.opts = opts; this.buf = Buffer.alloc(0); this.waiters = []; this.queue = Promise.resolve(); }
  async open() {
    this.sock = net.connect(this.opts.port, this.opts.host);
    this.sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.pump(); });
    this.sock.on('error', (e) => this.waiters.splice(0).forEach((w) => w.reject(e)));
    await new Promise((res, rej) => { this.sock.once('connect', res); this.sock.once('error', rej); });
    const kv = (k, v) => `${k}\0${v}\0`;
    const body = Buffer.from(kv('user', this.opts.user) + kv('database', this.opts.database) + '\0');
    const head = Buffer.alloc(8); head.writeInt32BE(body.length + 8, 0); head.writeInt32BE(196608, 4);
    this.sock.write(Buffer.concat([head, body]));
    for (;;) {
      const m = await this.next();
      if (m.t === 'R' && m.d.readInt32BE(0) !== 0) throw new Error('pgwire: só autenticação trust é suportada');
      if (m.t === 'E') throw new Error('pgwire: ' + this.err(m.d).message);
      if (m.t === 'Z') return this;
    }
  }
  pump() { while (this.waiters.length) { const m = this.take(); if (!m) return; this.waiters.shift().resolve(m); } }
  take() {
    if (this.buf.length < 5) return null;
    const len = this.buf.readInt32BE(1);
    if (this.buf.length < len + 1) return null;
    const m = { t: String.fromCharCode(this.buf[0]), d: this.buf.subarray(5, len + 1) };
    this.buf = this.buf.subarray(len + 1);
    return m;
  }
  next() { const m = this.take(); return m ? Promise.resolve(m) : new Promise((resolve, reject) => this.waiters.push({ resolve, reject })); }
  err(d) {
    const o = {}; let i = 0;
    while (i < d.length && d[i] !== 0) { const k = String.fromCharCode(d[i]); const e = d.indexOf(0, i + 1); o[k] = d.toString('utf8', i + 1, e); i = e + 1; }
    return Object.assign(new Error(o.M || 'erro do Postgres'), { code: o.C });
  }
  /** Com parâmetros: PREPARE + EXECUTE, para o Postgres inferir os tipos dos $n como faz o driver `pg` de verdade. */
  async query(text, values) {
    if (!values || !values.length) return this.simple(text);
    const name = `s${(this.n = (this.n || 0) + 1)}`;
    await this.simple(`PREPARE ${name} AS ${text}`);
    try { return await this.simple(`EXECUTE ${name}(${values.map(lit).join(', ')})`); } finally { await this.simple(`DEALLOCATE ${name}`).catch(() => {}); }
  }
  simple(text) {
    const run = async () => {
      const q = Buffer.from(text + '\0');
      const head = Buffer.alloc(5); head.write('Q'); head.writeInt32BE(q.length + 4, 1);
      this.sock.write(Buffer.concat([head, q]));
      let cols = [], rows = [], count = 0, error = null;
      for (;;) {
        const m = await this.next();
        if (m.t === 'T') {
          cols = []; rows = []; let p = 2;
          for (let i = 0; i < m.d.readInt16BE(0); i++) {
            const e = m.d.indexOf(0, p); const name = m.d.toString('utf8', p, e);
            cols.push({ name, oid: m.d.readInt32BE(e + 7) }); p = e + 19;
          }
        } else if (m.t === 'D') {
          const n = m.d.readInt16BE(0); let p = 2; const row = {};
          for (let i = 0; i < n; i++) {
            const l = m.d.readInt32BE(p); p += 4;
            if (l < 0) row[cols[i].name] = null; else { row[cols[i].name] = conv(cols[i].oid, m.d.toString('utf8', p, p + l)); p += l; }
          }
          rows.push(row);
        } else if (m.t === 'C') { count = Number(String(m.d.toString().replace(/\0$/, '')).split(' ').pop()) || 0; }
        else if (m.t === 'E') error = this.err(m.d);
        else if (m.t === 'Z') break;
      }
      if (error) throw error;
      return { rows, rowCount: rows.length || count };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
  release() { this.free = true; }
  end() { this.sock.destroy(); }
}

class Pool {
  constructor(opts) { this.opts = opts; this.clients = []; }
  async connect() {
    let c = this.clients.find((x) => x.free);
    if (c) { c.free = false; return c; }
    c = await new Client(this.opts).open();
    this.clients.push(c);
    return c;
  }
  async query(text, values) { const c = await this.connect(); try { return await c.query(text, values); } finally { c.release(); } }
  async end() { this.clients.forEach((c) => c.end()); }
}

module.exports = { Pool };
