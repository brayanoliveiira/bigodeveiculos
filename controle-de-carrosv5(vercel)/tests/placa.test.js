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

test('APIBrasil: dados + fipe com Bearer e DeviceToken', async () => {
  const seen = [];
  const a4 = await createTestApp({ adminUser: 'x1234', adminPassword: 'senha-12345', adminName: 'X', placaFree: false, apibrasilBearer: 'BT', apibrasilDevice: 'DT', apibrasilUrl: 'https://gw.test/api/v2',
    fetch: async (url, opts) => { seen.push({ url: String(url), opts });
      const dados = String(url).endsWith('/dados');
      return { ok: true, status: 200, json: async () => dados ? { error: false, response: { MARCA: 'FIAT', MODELO: 'UNO MILLE', ano: '2010', anoModelo: '2011', cor: 'BRANCA', uf: 'SP' } }
        : { error: false, response: { dados: [{ texto_valor: 'R$ 18.000,00', codigo_fipe: '001', texto_modelo: 'Uno Mille', ano_modelo: 2011, score: 80 }] } } }; } });
  const b4 = `http://127.0.0.1:${(await a4.listen()).port}`;
  const r = await fetch(b4 + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'x1234', password: 'senha-12345' }) });
  const ck = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await fetch(b4 + '/api/config')).json()).placa, true);
  const p = await fetch(b4 + '/api/placa/abc1d23', { headers: { ...H, cookie: ck } });
  assert.equal(p.status, 200);
  const j = await p.json();
  assert.equal(j.marca, 'Fiat'); assert.equal(j.fipe[0].valor, 18000); assert.equal(j.ano, 2011);
  assert.ok(seen.every((s) => s.opts.headers.authorization === 'Bearer BT' && s.opts.headers.devicetoken === 'DT'));
  await a4.close();
});

test('site zapcarconsulta: salvar carro com placa preenche FIPE e referência', async () => {
  const seen = [];
  const json = { tem_fipe: true, veiculo: { marca: 'GWM', modelo: 'HAVAL H6 PREM PHEV', submodelo: 'HAVAL', ano: '2025', ano_fabricacao: null, cor: 'CINZA', municipio: 'Brasília', uf: 'DF', placa: 'SSK3E54' },
    fipe: [{ texto_marca: 'GWM', texto_modelo: 'Haval H6 19 1.5 (Hibrido)', texto_valor: 'R$ 195.020,00', ano_modelo: '2025', combustivel: 'Híbrido', codigo_fipe: '096008-0', mes_referencia: 'outubro de 2026', score: 46 },
      { texto_marca: 'GWM', texto_modelo: 'Haval H6 GT 1.5 AWD (Hibrido)', texto_valor: 'R$ 236.560,00', ano_modelo: '2025', combustivel: 'Híbrido', codigo_fipe: '096003-9', mes_referencia: 'outubro de 2026', score: 52 }] };
  const a5 = await createTestApp({ adminUser: 'x1234', adminPassword: 'senha-12345', adminName: 'X', placaSite: true, placaSiteUrl: 'https://site.test/api/fipe-placa',
    fetch: async (url) => { seen.push(String(url));
      if (String(url).endsWith('=ZZZ9Z99')) return { ok: false, status: 503, json: async () => null };
      if (String(url).endsWith('=AAA0A00')) return { ok: false, status: 404, json: async () => ({ erro: 'Nenhum veículo foi encontrado para a placa AAA0A00' }) };
      return { ok: true, status: 200, json: async () => json }; } });
  const b5 = `http://127.0.0.1:${(await a5.listen()).port}`;
  const r = await fetch(b5 + '/api/login', { method: 'POST', headers: H, body: JSON.stringify({ username: 'x1234', password: 'senha-12345' }) });
  const ck = r.headers.get('set-cookie').split(';')[0];
  const post = (body) => fetch(b5 + '/api/cars', { method: 'POST', headers: { ...H, cookie: ck }, body: JSON.stringify(body) });
  const c = await post({ name: 'Haval', placa: 'SSK3E54', dcompra: '2026-10-01', entT: 100000 });
  assert.equal(c.status, 201);
  const j = await c.json();
  assert.equal(j.item.fipe, 236560); assert.match(j.item.fipeRef, /outubro de 2026 · cód\. 096003-9/); assert.equal(j.item.cor, 'Cinza'); assert.equal(j.fipeAuto.ok, true);
  assert.equal(seen[0], 'https://site.test/api/fipe-placa?placa=SSK3E54');
  // site fora do ar ou placa desconhecida: o carro é salvo mesmo assim
  for (const placa of ['ZZZ9Z99', 'AAA0A00']) {
    const c2 = await post({ name: 'Outro ' + placa, placa, dcompra: '2026-10-01', entT: 1000 });
    assert.equal(c2.status, 201);
    const j2 = await c2.json();
    assert.equal(j2.item.fipe, null); assert.equal(j2.fipeAuto.ok, false);
  }
  await a5.close();
});
