'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('./helpers/testapp');

const H = { 'content-type': 'application/json', 'x-requested-with': 'controle-de-carros' };
let calls = [], mode = 'ok', app, base, cookie = '';
const fakeFetch = async (url, opts) => {
  const path = String(url).replace('https://fipe.parallelum.com.br/api/v2', '');
  calls.push({ path, token: opts.headers['X-Subscription-Token'] });
  if (mode === 'limit') return { ok: false, status: 429, json: async () => ({}) };
  if (mode === 'net') throw new Error('rede');
  const R = {
    '/cars/brands': [{ code: '23', name: 'GM - Chevrolet' }, { code: '25', name: 'Fiat' }],
    '/cars/brands/23/models': [{ code: '926', name: 'A-10 2.5/4.1' }],
    '/cars/brands/23/models/926/years': [{ code: '1989-1', name: '1989 Gasolina' }],
    '/cars/brands/23/models/926/years/1989-1': { vehicleType: 1, price: 'R$ 11.534,00', brand: 'GM - Chevrolet', model: 'A-10 2.5/4.1', modelYear: 1989, fuel: 'Gasolina', codeFipe: '004113-0', referenceMonth: 'outubro de 2026' },
  };
  return R[path] ? { ok: true, status: 200, json: async () => R[path] } : { ok: false, status: 404, json: async () => ({}) };
};
const call = async (u) => {
  const r = await fetch(base + u, { headers: { ...H, ...(cookie ? { cookie } : {}) }, method: u === '/api/login' ? 'POST' : 'GET' });
  return { status: r.status, json: await r.json().catch(() => null) };
};
before(async () => {
  app = await createTestApp({ adminUser: 'brayan', adminPassword: 'senha-do-brayan', adminName: 'Brayan', fetch: fakeFetch, fipeToken: 'tk' });
  base = `http://127.0.0.1:${(await app.listen()).port}`;
  const r = await fetch(base + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'brayan', password: 'senha-do-brayan' }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => app.close());

test('marca > modelo > ano > preço, com cache e token', async () => {
  assert.deepEqual((await call('/api/fipe/marcas')).json.items[0], { code: '23', name: 'GM - Chevrolet' });
  assert.equal((await call('/api/fipe/marcas/23/modelos')).json.items[0].code, '926');
  assert.equal((await call('/api/fipe/marcas/23/modelos/926/anos')).json.items[0].code, '1989-1');
  const p = await call('/api/fipe/marcas/23/modelos/926/anos/1989-1');
  assert.equal(p.status, 200);
  assert.deepEqual(p.json, { valor: 11534, codigo: '004113-0', marca: 'GM - Chevrolet', modelo: 'A-10 2.5/4.1', anoModelo: 1989, combustivel: 'Gasolina', referencia: 'outubro de 2026' });
  const n = calls.length;
  await call('/api/fipe/marcas'); await call('/api/fipe/marcas/23/modelos/926/anos/1989-1');
  assert.equal(calls.length, n, 'segunda consulta vem do cache');
  assert.ok(calls.every((c) => c.token === 'tk'));
});

test('entradas inválidas e erros do provedor', async () => {
  assert.equal((await call('/api/fipe/marcas/abc/modelos')).status, 400);
  assert.equal((await call('/api/fipe/marcas?tipo=boats')).status, 400);
  assert.equal((await call('/api/fipe/marcas/23/modelos/926/anos/1989')).status, 400);
  assert.equal((await call('/api/fipe/marcas/99/modelos')).status, 404);
  mode = 'limit'; assert.equal((await call('/api/fipe/marcas?tipo=trucks')).status, 429);
  mode = 'net'; assert.equal((await call('/api/fipe/marcas?tipo=motorcycles')).status, 502);
});

test('se a v2 cair, usa a v1 da mesma tabela (plano B, sem cadastro)', async () => {
  const fipe = require('../server/fipe');
  const urls = [];
  const cfg = { fipeUrl: 'https://x.test/v2', fipeUrlV1: 'https://x.test/v1', fetch: async (url) => {
    urls.push(String(url));
    if (String(url).startsWith('https://x.test/v2')) return { ok: false, status: 503, json: async () => null };
    const R = {
      '/carros/marcas': [{ codigo: '59', nome: 'VW - VolksWagen' }],
      '/carros/marcas/59/modelos': { modelos: [{ codigo: 5940, nome: 'Gol 1.0' }], anos: [] },
      '/carros/marcas/59/modelos/5940/anos': [{ codigo: '2014-1', nome: '2014 Gasolina' }],
      '/carros/marcas/59/modelos/5940/anos/2014-1': { Valor: 'R$ 31.000,00', Marca: 'VW - VolksWagen', Modelo: 'Gol 1.0', AnoModelo: 2014, Combustivel: 'Gasolina', CodigoFipe: '005340-6', MesReferencia: 'outubro de 2026 ' },
    };
    const k = String(url).replace('https://x.test/v1', '');
    return R[k] ? { ok: true, status: 200, json: async () => R[k] } : { ok: false, status: 404, json: async () => null };
  } };
  await app.db.run('DELETE FROM fipe_cache');
  assert.deepEqual((await fipe.marcas(app.db, cfg, 'cars'))[0], { code: '59', name: 'VW - VolksWagen' });
  assert.equal((await fipe.modelos(app.db, cfg, 'cars', '59'))[0].code, '5940');
  assert.equal((await fipe.anos(app.db, cfg, 'cars', '59', '5940'))[0].code, '2014-1');
  const p = await fipe.preco(app.db, cfg, 'cars', '59', '5940', '2014-1');
  assert.equal(p.valor, 31000); assert.equal(p.codigo, '005340-6');
});
