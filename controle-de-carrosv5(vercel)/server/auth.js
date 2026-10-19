'use strict';
/**
 * Senhas, sessões e proteção contra tentativas em massa.
 * - Senha: scrypt (módulo crypto embutido) com sal aleatório. Formato: scrypt$N$r$p$sal$hash (base64).
 * - Sessão: token aleatório no cookie; no banco fica só o SHA-256 do token (vazar o banco não vaza sessões).
 */
const crypto = require('crypto');

const N = 16384, R = 8, P = 1, KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

function verifyPassword(password, stored) {
  try {
    const [alg, n, r, p, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const got = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

// Usado quando o usuário não existe, para o tempo de resposta não revelar quais usuários existem.
const DUMMY_HASH = hashPassword('senha-que-nunca-sera-usada');

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function createSession(db, userId, days) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const exp = new Date(now.getTime() + days * 86400000);
  await db.run('DELETE FROM sessions WHERE expires_at < ?', now.toISOString());
  await db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    sha(token), userId, now.toISOString(), exp.toISOString());
  return { token, expires: exp };
}

/** Retorna o usuário dono do token (ativo e dentro do prazo) ou null. Renova o prazo (sessão deslizante). */
async function findSession(db, token, days) {
  if (!token) return null;
  const h = sha(token);
  const row = await db.get(`SELECT s.expires_at, u.id, u.username, u.name, u.role, u.active
                      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, h);
  if (!row || !row.active) return null;
  const now = Date.now();
  const exp = new Date(row.expires_at).getTime();
  if (exp < now) { await db.run('DELETE FROM sessions WHERE token_hash = ?', h); return null; }
  // Só reescreve a cada ~1h para não gravar no banco em toda requisição.
  if (exp - now < (days - 1 / 24) * 86400000) {
    await db.run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', new Date(now + days * 86400000).toISOString(), h);
  }
  return { id: row.id, username: row.username, name: row.name, role: row.role };
}

async function destroySession(db, token) {
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', sha(token));
}
async function destroyUserSessions(db, userId, exceptToken) {
  if (exceptToken) await db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', userId, sha(exceptToken));
  else await db.run('DELETE FROM sessions WHERE user_id = ?', userId);
}

/**
 * Limitador de tentativas de login: 5 erros seguidos bloqueiam por 5 minutos (por IP + usuário).
 * Fica no banco (tabela login_fail) para valer também com várias instâncias do servidor (Vercel).
 */
class LoginLimiter {
  constructor(db, max = 5, lockMs = 5 * 60 * 1000) { this.db = db; this.max = max; this.lockMs = lockMs; }
  async check(key) {
    const e = await this.db.get('SELECT until_ms FROM login_fail WHERE key = ?', key);
    return e && e.until_ms > Date.now() ? Math.ceil((e.until_ms - Date.now()) / 1000) : 0;
  }
  async fail(key) {
    const now = Date.now();
    const e = await this.db.get('SELECT n, until_ms FROM login_fail WHERE key = ?', key);
    let n = (e ? e.n : 0) + 1;
    let until = 0;
    if (n >= this.max) { until = now + this.lockMs; n = 0; }
    await this.db.run(`INSERT INTO login_fail (key, n, until_ms, updated_ms) VALUES (?, ?, ?, ?)
                       ON CONFLICT(key) DO UPDATE SET n = excluded.n, until_ms = excluded.until_ms, updated_ms = excluded.updated_ms`, key, n, until, now);
    if (Math.random() < 0.05) await this.db.run('DELETE FROM login_fail WHERE updated_ms < ?', now - 86400000);
  }
  async ok(key) { await this.db.run('DELETE FROM login_fail WHERE key = ?', key); }
}

function checkPasswordRules(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (pw.length > 200) return 'A senha é grande demais.';
  return null;
}

module.exports = {
  hashPassword, verifyPassword, DUMMY_HASH, createSession, findSession, destroySession,
  destroyUserSessions, LoginLimiter, checkPasswordRules,
};
