'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('./helpers/testapp');
const { normalize, parseBRL } = require('../server/placa');

const H = { 'content-type': 'application/json', 'x-requested-with': 'controle-de-carros' };
const SAMPLE = {
  MARCA: 'VW - VolksWagen', MODELO: 'GOL 1.0 MI', VERSAO: 'CITY', ano: '2015', anoModelo: '2016', cor: 'Prata', uf: 'SP', municipio: 'SAO PAULO', situacao: 'Em circulação',
  fipe: { dados: [
    { texto_valor: 'R$ 38.000,00', codigo_fipe: '005001-9', texto_modelo: 'Gol City 1.0', ano_modelo: '2016', mes_referencia: 'outubro de 2026', score: 80, combustivel: 'Gasolina' },
    { texto_valor: 'R$ 41.250,50', codigo_fipe: '005002-7', texto_modelo: 'Gol Trend 1.0', ano_modelo: '2016', mes_referencia: 'outubro de 2026', score: 95, combustivel: 'Gasolina' },
  ] },
};
let calls = 0, mode = 'ok', app, base, cookie = '';
const fakeFetch = async (url) => {
  calls++;
  assert.match(String(url), /\/consulta\/ABC1D23\/tok123$/);
  if (mode === 'ok') return { ok: true, status: 200, json: async () => SAMPLE };
  if (mode === 'auth') return { ok: false, status: 401, json: async () => ({ mensagemRetorno: 'Token inválido' }) };
  if (mode === 'miss') return { ok: true, status: 200, json: async () => ({ mensagemRetorno: 'Placa não encontrada' }) };
  throw new Error('rede');
};
const call = async (m, u, b) => {
  const r = await fetch(base + u, { method: m, headers: { ...H, ...(cookie ? { cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, json: await r.json().catch(() => null) };
};

before(async () => {
  app = await createTestApp({ adminUser: 'brayan', adminPassword: 'senha-do-brayan', adminName: 'Brayan', placaToken: 'tok123', fetch: fakeFetch });
  base = `http://127.0.0.1:${(await app.listen()).port}`;
  await call('POST', '/api/login', { username: 'brayan', password: 'senha-do-brayan' });
});
after(() => app.close());

test('parseBRL e normalize', () => {
  assert.equal(parseBRL('R$ 45.300,00'), 45300);
  const n = normalize(SAMPLE, 'ABC1D23');
  assert.equal(n.fipe[0].valor, 41250.5); // maior score primeiro
  assert.equal(n.cor, 'Prata'); assert.equal(n.ano, 2016);
  assert.equal(n.nome, "Volkswagen Gol 1.0 MI City");
});

test('consulta, cache e fresh', async () => {
  const a = await call('GET', '/api/placa/abc-1d23');
  assert.equal(a.status, 200); assert.equal(a.json.cache, false); assert.equal(a.json.fipe[0].codigo, '005002-7');
  const b = await call('GET', '/api/placa/ABC1D23');
  assert.equal(b.json.cache, true); assert.equal(calls, 1);
  await call('GET', '/api/placa/ABC1D23?fresh=1');
  assert.equal(calls, 2);
});

test('erros: placa inválida, token recusado, sem resultado, rede', async () => {
  assert.equal((await call('GET', '/api/placa/123')).status, 400);
  mode = 'auth'; await call('GET', '/api/placa/ABC1D23?fresh=1');
  assert.equal((await call('GET', '/api/placa/ABC1D23?fresh=1')).status, 502);
  mode = 'miss'; assert.equal((await call('GET', '/api/placa/ABC1D23?fresh=1')).status, 404);
  mode = 'net'; assert.equal((await call('GET', '/api/placa/ABC1D23?fresh=1')).status, 502);
});

test('sem token: 503 e /api/config avisa a tela', async () => {
  const a2 = await createTestApp({ adminUser: 'x1234', adminPassword: 'senha-12345', adminName: 'X', placaFree: false });
  const b2 = `http://127.0.0.1:${(await a2.listen()).port}`;
  const r = await fetch(b2 + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'x1234', password: 'senha-12345' }) });
  const ck = r.headers.get('set-cookie').split(';')[0];
  const p = await fetch(b2 + '/api/placa/ABC1D23', { headers: { ...H, cookie: ck } });
  assert.equal(p.status, 503);
  assert.equal((await (await fetch(b2 + '/api/config')).json()).placa, false);
  await a2.close();
});

test('carro guarda cor e FIPE', async () => {
  const r = await call('POST', '/api/cars', { name: 'VW Gol', placa: 'abc1d23', cor: 'Prata', fipe: 41250.5, fipeRef: 'out/2026 · 005002-7' });
  assert.equal(r.status, 201); assert.equal(r.json.item.fipe, 41250.5); assert.equal(r.json.item.placa, 'ABC1D23');
});

test('consulta grátis (sem token): POST com a placa, sem token na URL', async () => {
  const seen = [];
  const a3 = await createTestApp({ adminUser: 'x1234', adminPassword: 'senha-12345', adminName: 'X', placaFree: true, placaFreeUrl: 'https://livre.test/placa/consulta',
    fetch: async (url, opts) => { seen.push({ url: String(url), opts }); return { ok: true, status: 200, json: async () => ({ data: { marca: 'VW - VolksWagen', modelo: 'GOL 1.0', ano: '2016', anoModelo: '2016', cor: 'PRATA',
      fipe: { dados: [{ texto_valor: 'R$ 41.250,50', codigo_fipe: '005002-7', texto_modelo: 'Gol 1.0', ano_modelo: 2016, mes_referencia: 'outubro de 2026', score: 90 }] } } }) }; } });
  const b3 = `http://127.0.0.1:${(await a3.listen()).port}`;
  const r = await fetch(b3 + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'x1234', password: 'senha-12345' }) });
  const ck = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await fetch(b3 + '/api/config')).json()).placa, true);
  const p = await fetch(b3 + '/api/placa/abc1d23', { headers: { ...H, cookie: ck } });
  assert.equal(p.status, 200);
  const j = await p.json();
  assert.equal(j.marca, 'Volkswagen'); assert.equal(j.fipe[0].valor, 41250.5);
  assert.equal(seen[0].url, 'https://livre.test/placa/consulta'); assert.equal(seen[0].opts.method, 'POST'); assert.equal(JSON.parse(seen[0].opts.body).placa, 'ABC1D23');
  await a3.close();
});
