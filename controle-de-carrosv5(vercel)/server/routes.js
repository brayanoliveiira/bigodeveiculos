'use strict';
/**
 * Rotas da API. Cada rota declara quem pode usá-la em `opts.role`:
 *   (nada) = público · 'any' = qualquer usuário logado · 'write' = admin ou member · 'admin' = só admin.
 * Rotas específicas ANTES das genéricas (/api/:entity): a primeira que combina vence.
 */
const { lists } = require('./config');
const { entities } = require('./schema');
const S = require('./services');
const A = require('./auth');
const { lookup: lookupPlaca } = require('./placa');
const fipe = require('./fipe');
const { loadExamples, removeExamples } = require('./examples');

const { HttpError } = S;

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/i;

function id(ctx) {
  const n = Number(ctx.params.id);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Item não encontrado.');
  return n;
}
function entity(ctx) {
  const e = ctx.params.entity;
  if (!Object.prototype.hasOwnProperty.call(entities, e)) throw new HttpError(404, 'Rota não encontrada.');
  return e;
}
const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role });

function register(router, { db, cfg, limiter }) {
  // ---- público ----
  router.add('GET', '/api/health', {}, async () => {
    await db.get('SELECT 1 AS ok');
    return { ok: true };
  });
  router.add('GET', '/api/config', {}, async () => ({ lists: { locs: lists.locs, cats: lists.cats, status: lists.status, pstatus: lists.pstatus, rstatus: lists.rstatus, divis: lists.divis, roles: lists.roles }, placa: !!cfg.placaToken || !!cfg.placaFree || !!(cfg.apibrasilBearer && cfg.apibrasilDevice) }));

  router.add('POST', '/api/login', {}, async (ctx) => {
    const username = String(ctx.body.username || '').trim();
    const password = String(ctx.body.password || '');
    const key = `${ctx.ip}|${username.toLowerCase()}`;
    const wait = await limiter.check(key);
    if (wait) throw new HttpError(429, `Muitas tentativas. Tente de novo em ${Math.ceil(wait / 60)} min.`);
    const u = username ? await db.get('SELECT * FROM users WHERE lower(username) = lower(?)', username) : null;
    const ok = A.verifyPassword(password, u ? u.password_hash : A.DUMMY_HASH) && u && u.active;
    if (!ok) {
      await limiter.fail(key);
      throw new HttpError(401, 'Usuário ou senha incorretos.');
    }
    await limiter.ok(key);
    await db.run('UPDATE users SET last_login = ? WHERE id = ?', S.now(), u.id);
    const s = await A.createSession(db, u.id, cfg.sessionDays);
    ctx.setSession(s.token, s.expires);
    return { user: publicUser(u) };
  });

  // ---- sessão ----
  router.add('POST', '/api/logout', { role: 'any' }, async (ctx) => {
    await A.destroySession(db, ctx.token);
    ctx.clearSession();
    return { ok: true };
  });
  router.add('GET', '/api/me', { role: 'any' }, async (ctx) => ({ user: publicUser(ctx.user) }));

  router.add('POST', '/api/password', { role: 'any' }, async (ctx) => {
    const { current, next } = ctx.body;
    const row = await db.get('SELECT * FROM users WHERE id = ?', ctx.user.id);
    if (!A.verifyPassword(String(current || ''), row.password_hash)) throw new HttpError(400, 'A senha atual está incorreta.');
    const bad = A.checkPasswordRules(next);
    if (bad) throw new HttpError(400, bad);
    await db.tx(async (db) => {
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', A.hashPassword(next), ctx.user.id);
      await A.destroyUserSessions(db, ctx.user.id, ctx.token);
      await S.writeAudit(db, ctx.user.id, 'user', ctx.user.id, row.username, 'editou', [{ f: 'Senha', de: null, para: 'alterada pelo próprio usuário' }]);
    });
    return { ok: true };
  });

  // ---- consulta de placa + FIPE (cobrada pelo provedor: só quem pode lançar dados) ----
  router.add('GET', '/api/placa/:placa', { role: 'write' }, async (ctx) => await lookupPlaca({ db, cfg, user: ctx.user, placa: ctx.params.placa, fresh: ctx.query.get('fresh') === '1' }));

  // ---- tabela FIPE gratuita: marca > modelo > ano (passa pelo servidor, com cache) ----
  const tipo = (ctx) => ctx.query.get('tipo') || 'cars';
  router.add('GET', '/api/fipe/marcas', { role: 'write' }, async (ctx) => ({ items: await fipe.marcas(db, cfg, tipo(ctx)) }));
  router.add('GET', '/api/fipe/marcas/:b/modelos', { role: 'write' }, async (ctx) => ({ items: await fipe.modelos(db, cfg, tipo(ctx), ctx.params.b) }));
  router.add('GET', '/api/fipe/marcas/:b/modelos/:m/anos', { role: 'write' }, async (ctx) => ({ items: await fipe.anos(db, cfg, tipo(ctx), ctx.params.b, ctx.params.m) }));
  router.add('GET', '/api/fipe/marcas/:b/modelos/:m/anos/:y', { role: 'write' }, async (ctx) => fipe.preco(db, cfg, tipo(ctx), ctx.params.b, ctx.params.m, ctx.params.y));

  // ---- leitura de dados ----
  router.add('GET', '/api/version', { role: 'any' }, async () => ({ version: await S.version(db) }));
  router.add('GET', '/api/data', { role: 'any' }, async () => await S.getData(db));
  router.add('GET', '/api/audit', { role: 'any' }, async (ctx) => ({ audit: await S.getAudit(db, ctx.query.get('limit'), ctx.query.get('offset')) }));
  router.add('GET', '/api/export', { role: 'any' }, async (ctx) => {
    ctx.headers['Content-Disposition'] = `attachment; filename="controle-de-carros-${new Date().toISOString().slice(0, 10)}.json"`;
    return { exportedAt: S.now(), ...await S.getData(db), audit: await S.getAudit(db, 2000, 0) };
  });

  // ---- usuários (admin) ----
  const userRow = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: !!u.active, created_at: u.created_at, last_login: u.last_login });
  router.add('GET', '/api/users', { role: 'admin' }, async () => ({ users: (await db.all('SELECT * FROM users ORDER BY id')).map(userRow) }));

  router.add('POST', '/api/users', { role: 'admin' }, async (ctx) => {
    const { username, name, role, password } = ctx.body;
    if (!USERNAME_RE.test(String(username || ''))) throw new HttpError(400, 'Usuário: 3 a 30 caracteres (letras, números, ponto, hífen ou _).');
    if (!String(name || '').trim()) throw new HttpError(400, 'Informe o nome da pessoa.');
    if (!lists.roles.includes(role)) throw new HttpError(400, 'Perfil inválido.');
    const bad = A.checkPasswordRules(password);
    if (bad) throw new HttpError(400, bad);
    if (await db.get('SELECT 1 AS x FROM users WHERE lower(username) = lower(?)', username)) throw new HttpError(409, 'Esse usuário já existe.');
    const u = await db.tx(async (db) => {
      const newId = await db.insert('INSERT INTO users (username, name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
        username, String(name).trim().slice(0, 80), A.hashPassword(password), role, S.now());
      await S.writeAudit(db, ctx.user.id, 'user', newId, username, 'criou', [{ f: 'Perfil', de: null, para: role }]);
      await S.bump(db);
      return db.get('SELECT * FROM users WHERE id = ?', newId);
    });
    ctx.status = 201;
    return { user: userRow(u) };
  });

  router.add('PATCH', '/api/users/:id', { role: 'admin' }, async (ctx) => {
    const uid = id(ctx);
    const u = await db.get('SELECT * FROM users WHERE id = ?', uid);
    if (!u) throw new HttpError(404, 'Usuário não encontrado.');
    const b = ctx.body;
    const changes = [];
    const sets = {};
    if (b.name !== undefined) {
      const n = String(b.name).trim().slice(0, 80);
      if (!n) throw new HttpError(400, 'Informe o nome da pessoa.');
      if (n !== u.name) { sets.name = n; changes.push({ f: 'Nome', de: u.name, para: n }); }
    }
    if (b.role !== undefined && b.role !== u.role) {
      if (!lists.roles.includes(b.role)) throw new HttpError(400, 'Perfil inválido.');
      sets.role = b.role; changes.push({ f: 'Perfil', de: u.role, para: b.role });
    }
    if (b.active !== undefined && !!b.active !== !!u.active) {
      sets.active = b.active ? 1 : 0; changes.push({ f: 'Ativo', de: u.active ? 'sim' : 'não', para: b.active ? 'sim' : 'não' });
    }
    let newHash = null;
    if (b.password !== undefined) {
      const bad = A.checkPasswordRules(b.password);
      if (bad) throw new HttpError(400, bad);
      newHash = A.hashPassword(b.password);
      changes.push({ f: 'Senha', de: null, para: 'redefinida pelo administrador' });
    }
    // Nunca deixar o sistema sem administrador ativo.
    const losesAdmin = u.role === 'admin' && u.active && ((sets.role && sets.role !== 'admin') || sets.active === 0);
    if (losesAdmin && (await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?", uid)).n === 0) {
      throw new HttpError(400, 'Precisa existir ao menos um administrador ativo.');
    }
    if (uid === ctx.user.id && sets.active === 0) throw new HttpError(400, 'Você não pode desativar o próprio usuário.');
    if (!changes.length) return { user: userRow(u) };
    await db.tx(async (db) => {
      const keys = Object.keys(sets);
      if (newHash) { sets.password_hash = newHash; keys.push('password_hash'); }
      if (keys.length) await db.run(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => sets[k]), uid);
      if (newHash || sets.active === 0 || sets.role) await A.destroyUserSessions(db, uid, uid === ctx.user.id ? ctx.token : null);
      await S.writeAudit(db, ctx.user.id, 'user', uid, u.username, 'editou', changes);
      await S.bump(db);
    });
    return { user: userRow(await db.get('SELECT * FROM users WHERE id = ?', uid)) };
  });

  // ---- ajustes e exemplos ----
  router.add('PUT', '/api/settings', { role: 'write' }, async (ctx) => await S.saveSettings(db, ctx.user, ctx.body));
  router.add('PUT', '/api/settings/partners', { role: 'admin' }, async (ctx) => await S.savePartners(db, ctx.user, ctx.body));
  router.add('POST', '/api/examples', { role: 'write' }, async (ctx) => { ctx.status = 201; return await loadExamples(db, ctx.user, ctx.body.today); });
  router.add('DELETE', '/api/examples', { role: 'write' }, async (ctx) => await removeExamples(db, ctx.user));

  // ---- carros, gastos, previstos, recebimentos ----
  router.add('POST', '/api/cars/:id/plan', { role: 'write' }, async (ctx) => {
    const r = await S.schedulePlan(db, ctx.user, id(ctx), ctx.body.parts);
    ctx.status = 201;
    return r;
  });
  router.add('POST', '/api/:entity', { role: 'write' }, async (ctx) => {
    const item = await S.createItem(db, ctx.user, entity(ctx), ctx.body);
    ctx.status = 201;
    return { item };
  });
  router.add('PATCH', '/api/:entity/:id', { role: 'write' }, async (ctx) => {
    const name = entity(ctx);
    const { _action, ...fields } = ctx.body;
    if (_action !== undefined && _action !== 'move') throw new HttpError(400, 'Ação desconhecida.');
    if (_action === 'move' && name !== 'cars') throw new HttpError(400, 'Só carros podem ser movidos.');
    return await S.updateItem(db, ctx.user, name, id(ctx), fields, { move: _action === 'move' });
  });
  router.add('DELETE', '/api/:entity/:id', { role: 'write' }, async (ctx) => await S.setDeleted(db, ctx.user, entity(ctx), id(ctx), true));
  router.add('POST', '/api/:entity/:id/restore', { role: 'write' }, async (ctx) => await S.setDeleted(db, ctx.user, entity(ctx), id(ctx), false));
}

module.exports = { register };
