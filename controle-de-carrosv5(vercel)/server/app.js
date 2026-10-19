'use strict';
/** Monta o servidor. `createApp(opts)` é usado tanto por server/index.js quanto pelos testes. */
const http = require('http');
const { fromEnv } = require('./config');
const dbm = require('./db');
const A = require('./auth');
const S = require('./services');
const { Router, parseCookies, readJson, sendJson, serveStatic, securityHeaders } = require('./http');
const { register } = require('./routes');

const COOKIE = 'cc_sid';
const ROLE_OK = {
  any: () => true,
  write: (u) => u.role === 'admin' || u.role === 'member',
  admin: (u) => u.role === 'admin',
};

async function bootstrapAdmin(db, cfg) {
  if ((await db.get('SELECT COUNT(*) AS n FROM users')).n > 0) return false;
  if (!cfg.adminUser || !cfg.adminPassword) return false;
  const bad = A.checkPasswordRules(cfg.adminPassword);
  if (bad) throw new Error(`ADMIN_PASSWORD inválida: ${bad}`);
  await db.run('INSERT INTO users (username, name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
    cfg.adminUser, cfg.adminName, A.hashPassword(cfg.adminPassword), 'admin', S.now());
  return true;
}

async function createApp(opts = {}) {
  const cfg = { ...fromEnv(), ...opts };
  const db = await dbm.open(cfg);
  await dbm.migrate(db);
  const created = await bootstrapAdmin(db, cfg);
  const limiter = new A.LoginLimiter(db);
  const router = new Router();
  register(router, { db, cfg, limiter });

  const clientIp = (req) => {
    if (cfg.trustProxy) {
      const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (xf) return xf;
    }
    return req.socket.remoteAddress || '';
  };

  async function handleApi(req, res, url) {
    const m = router.match(req.method, url.pathname);
    if (!m) throw new S.HttpError(404, 'Rota não encontrada.');
    if (m.methodNotAllowed) throw new S.HttpError(405, 'Método não permitido.');
    const { route, params } = m;

    // Defesa contra CSRF: cabeçalho que um formulário de outro site não consegue enviar + conferência de Origin.
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.headers['x-requested-with'] !== 'controle-de-carros') throw new S.HttpError(403, 'Requisição não autorizada.');
      const origin = req.headers.origin;
      if (origin) {
        let host = '';
        try { host = new URL(origin).host; } catch { /* inválido */ }
        if (host !== req.headers.host) throw new S.HttpError(403, 'Origem não autorizada.');
      }
    }

    const token = parseCookies(req.headers.cookie)[COOKIE] || null;
    const ctx = {
      req, res, params, query: url.searchParams, body: {}, ip: clientIp(req), token, user: null, status: 200, headers: {},
      setSession(tok, expires) {
        ctx.headers['Set-Cookie'] = `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${cfg.cookieSecure ? '; Secure' : ''}`;
      },
      clearSession() {
        ctx.headers['Set-Cookie'] = `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cfg.cookieSecure ? '; Secure' : ''}`;
      },
    };

    const need = route.opts.role;
    if (need) {
      ctx.user = await A.findSession(db, token, cfg.sessionDays);
      if (!ctx.user) throw new S.HttpError(401, 'Sessão expirada. Entre novamente.');
      if (!ROLE_OK[need](ctx.user)) throw new S.HttpError(403, 'Seu perfil não permite esta ação.');
    }
    if (!['GET', 'HEAD', 'DELETE'].includes(req.method)) ctx.body = await readJson(req);
    const out = await route.handler(ctx);
    sendJson(res, ctx.status, out, ctx.headers);
  }

  const onRequest = async (req, res) => {
    securityHeaders(res, cfg.cookieSecure);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new S.HttpError(405, 'Método não permitido.');
      return serveStatic(cfg.publicDir, url.pathname, req, res);
    } catch (e) {
      if (e instanceof S.HttpError) return sendJson(res, e.status, { error: e.message, ...(e.extra || {}) });
      console.error(`[erro] ${req.method} ${req.url}:`, e);
      if (res.headersSent) return res.end();
      return sendJson(res, 500, { error: 'Erro interno do servidor.' });
    }
  };
  const server = http.createServer(onRequest);

  return {
    cfg, db, server, handle: onRequest, bootstrapped: created,
    listen: () => new Promise((resolve) => server.listen(cfg.port, cfg.host, () => resolve(server.address()))),
    close: () => new Promise((resolve) => server.close(() => { Promise.resolve(db.close()).then(resolve); })),
  };
}

module.exports = { createApp };
