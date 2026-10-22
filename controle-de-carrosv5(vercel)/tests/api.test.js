'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('./helpers/testapp');

let app, base;
const H = { 'content-type': 'application/json', 'x-requested-with': 'controle-de-carros' };

// Cliente simples com "cookie jar" por usuário.
function client() {
  let cookie = '';
  return async (method, url, body, extra = {}) => {
    const r = await fetch(base + url, {
      method, headers: { ...H, ...(cookie ? { cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* estático */ }
    return { status: r.status, json, text, headers: r.headers };
  };
}

before(async () => {
  app = await createTestApp({ adminUser: 'brayan', adminPassword: 'senha-do-brayan', adminName: 'Brayan' });
  const addr = await app.listen();
  base = `http://127.0.0.1:${addr.port}`;
});
after(() => app.close());

test('health e config são públicos; dados exigem login', async () => {
  const c = client();
  assert.equal((await c('GET', '/api/health')).status, 200);
  assert.ok((await c('GET', '/api/config')).json.lists.locs.length > 3);
  assert.equal((await c('GET', '/api/data')).status, 401);
});

test('login: senha errada, bloqueio após 5 erros, cookie HttpOnly', async () => {
  const c = client();
  const bad = await c('POST', '/api/login', { username: 'brayan', password: 'errada' });
  assert.equal(bad.status, 401);
  const ok = await c('POST', '/api/login', { username: 'BRAYAN', password: 'senha-do-brayan' });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
  assert.match(ok.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal((await c('GET', '/api/me')).json.user.name, 'Brayan');

  const d = client();
  for (let i = 0; i < 5; i++) await d('POST', '/api/login', { username: 'lock', password: 'x' });
  assert.equal((await d('POST', '/api/login', { username: 'lock', password: 'x' })).status, 429);
});

test('CSRF: POST sem cabeçalho ou com Origin de outro site é recusado', async () => {
  const r1 = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r1.status, 403);
  const c = client();
  const r2 = await c('POST', '/api/login', { username: 'brayan', password: 'senha-do-brayan' }, { origin: 'https://evil.example' });
  assert.equal(r2.status, 403);
});

test('fluxo completo: usuários, perfis, CRUD, histórico atômico e permissões', async () => {
  const brayan = client();
  await brayan('POST', '/api/login', { username: 'brayan', password: 'senha-do-brayan' });

  assert.equal((await brayan('POST', '/api/users', { username: 'marcos', name: 'Marcos', role: 'member', password: 'curta' })).status, 400);
  assert.equal((await brayan('POST', '/api/users', { username: 'marcos', name: 'Marcos', role: 'member', password: 'senha-do-marcos' })).status, 201);
  assert.equal((await brayan('POST', '/api/users', { username: 'visita', name: 'Visita', role: 'viewer', password: 'senha-da-visita' })).status, 201);
  assert.equal((await brayan('POST', '/api/users', { username: 'MARCOS', name: 'X', role: 'member', password: 'senha-do-marcos' })).status, 409);

  const marcos = client();
  await marcos('POST', '/api/login', { username: 'marcos', password: 'senha-do-marcos' });
  const visita = client();
  await visita('POST', '/api/login', { username: 'visita', password: 'senha-da-visita' });

  // member não gerencia usuários; viewer não grava
  assert.equal((await marcos('GET', '/api/users')).status, 403);
  assert.equal((await visita('POST', '/api/cars', { name: 'X' })).status, 403);
  assert.equal((await visita('GET', '/api/data')).status, 200);

  // Marcos cria um carro vendido com troca
  const v0 = (await marcos('GET', '/api/version')).json.version;
  assert.equal((await marcos('POST', '/api/cars', { name: 'Gol', status: 'Vendido' })).status, 400); // sem valor de venda
  const gol = (await marcos('POST', '/api/cars', { name: 'Gol 1.0', entT: 28000, ovrA: 9000, ovrB: 19000, status: 'Em estoque', loc: 'Oficina mecânica' })).json.item;
  assert.equal(gol.name, 'Gol 1.0');
  assert.ok((await marcos('GET', '/api/version')).json.version > v0);

  assert.equal((await marcos('POST', '/api/cars', { name: 'Y', campoInventado: 1 })).status, 400);
  assert.equal((await marcos('POST', '/api/cars', { name: 'Y', entT: -5 })).status, 400);
  assert.equal((await marcos('POST', '/api/cars', { name: 'Y', dcompra: '2026-02-31' })).status, 400);

  const sold = await brayan('PATCH', `/api/cars/${gol.id}`, { status: 'Vendido', vvenda: 41000, dvenda: '2026-10-10', quemrec: 'A' });
  assert.equal(sold.status, 200);
  assert.equal(sold.json.item.status, 'Vendido');
  const civic = (await brayan('POST', '/api/cars', { name: 'Civic', entT: 15000, origemId: gol.id })).json.item;
  assert.equal(civic.origemId, gol.id);
  assert.equal((await brayan('PATCH', `/api/cars/${civic.id}`, { origemId: civic.id })).status, 400);

  // mover carro: só campos de local
  assert.equal((await marcos('PATCH', `/api/cars/${civic.id}`, { _action: 'move', loc: 'Funilaria e pintura', locdet: 'Zé' })).status, 200);
  assert.equal((await marcos('PATCH', `/api/cars/${civic.id}`, { _action: 'move', entT: 1 })).status, 400);

  // gasto e previsto
  const gasto = (await marcos('POST', '/api/expenses', { carId: gol.id, date: '2026-09-01', cat: 'Mecânica', desc: 'Revisão', valor: 900.456, quem: 'B' })).json.item;
  assert.equal(gasto.valor, 900.46);
  assert.equal((await marcos('POST', '/api/expenses', { carId: 9999, date: '2026-09-01', cat: 'Mecânica', valor: 1, quem: 'B' })).status, 400);
  assert.equal((await marcos('POST', '/api/expenses', { carId: gol.id, date: '2026-09-01', cat: 'Mecânica', valor: 1, quem: 'C' })).status, 400);
  assert.equal((await marcos('POST', '/api/planned', { carId: civic.id, cat: 'Pneus', valor: 2000 })).json.item.status, 'Pendente');

  // exclusão lógica e restauração
  assert.equal((await marcos('DELETE', `/api/expenses/${gasto.id}`)).status, 200);
  assert.equal((await marcos('PATCH', `/api/expenses/${gasto.id}`, { valor: 1 })).status, 409);
  assert.equal((await marcos('POST', `/api/expenses/${gasto.id}/restore`)).status, 200);
  assert.equal((await marcos('GET', '/api/nada/1/x')).status, 404);

  // dados
  const data = (await brayan('GET', '/api/data')).json;
  assert.equal(data.cars.length, 2);
  assert.equal(data.settings.partners.A, 'Brayan');
  assert.equal(data.cars.find((c) => c.id === gol.id).deleted, false);

  // histórico: quem fez o quê
  const audit = (await brayan('GET', '/api/audit')).json.audit;
  const edit = audit.find((a) => a.action === 'editou' && a.label === 'Gol 1.0');
  assert.equal(edit.userName, 'Brayan');
  assert.ok(edit.changes.some((c) => c.f === 'Status' && c.de === 'Em estoque' && c.para === 'Vendido'));
  assert.ok(edit.changes.some((c) => c.f.startsWith('Valor total da venda') && /41\.000/.test(c.para)));
  const created = audit.find((a) => a.action === 'criou' && a.label === 'Gol 1.0');
  assert.equal(created.userName, 'Marcos');
  assert.ok(audit.some((a) => a.action === 'moveu' && a.userName === 'Marcos'));
  assert.ok(audit.some((a) => a.action === 'excluiu') && audit.some((a) => a.action === 'restaurou'));
  assert.ok(!JSON.stringify(audit).includes('senha-do'));
});

test('histórico é somente de inclusão (gatilhos do banco) e falha de gravação desfaz tudo', async () => {
  await assert.rejects(() => app.db.run("UPDATE audit SET label = 'x'"), /somente de inclusão/);
  await assert.rejects(() => app.db.run('DELETE FROM audit'), /somente de inclusão/);

  const S = require('../server/services');
  const count = async (t) => (await app.db.get(`SELECT COUNT(*) AS n FROM ${t}`)).n;
  const before = { cars: await count('cars'), audit: await count('audit'), v: await S.version(app.db) };
  const orig = S.writeAudit;
  // Simula falha na gravação do histórico: o carro não pode ter sido criado.
  if (app.db.dialect === 'pg') {
    await app.db.exec(`CREATE FUNCTION boom_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falhou'; END; $$;
      CREATE TRIGGER boom BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION boom_fn()`);
  } else {
    await app.db.exec('CREATE TRIGGER boom BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT, \'falhou\'); END');
  }
  await assert.rejects(() => S.createItem(app.db, { id: 1 }, 'cars', { name: 'Fantasma' }), /falhou/);
  await app.db.exec(app.db.dialect === 'pg' ? 'DROP TRIGGER boom ON audit; DROP FUNCTION boom_fn()' : 'DROP TRIGGER boom');
  assert.equal(await count('cars'), before.cars);
  assert.equal(await count('audit'), before.audit);
  assert.equal(await S.version(app.db), before.v);
  assert.equal(orig, S.writeAudit);
});

test('usuários: último admin protegido, reset de senha derruba sessões, desativado não entra', async () => {
  const adm = client();
  await adm('POST', '/api/login', { username: 'brayan', password: 'senha-do-brayan' });
  const users = (await adm('GET', '/api/users')).json.users;
  const me = users.find((u) => u.username === 'brayan');
  assert.equal((await adm('PATCH', `/api/users/${me.id}`, { role: 'member' })).status, 400);
  assert.equal((await adm('PATCH', `/api/users/${me.id}`, { active: false })).status, 400);

  const marcos = users.find((u) => u.username === 'marcos');
  const cm = client();
  await cm('POST', '/api/login', { username: 'marcos', password: 'senha-do-marcos' });
  assert.equal((await adm('PATCH', `/api/users/${marcos.id}`, { password: 'nova-senha-123' })).status, 200);
  assert.equal((await cm('GET', '/api/me')).status, 401);
  assert.equal((await cm('POST', '/api/login', { username: 'marcos', password: 'nova-senha-123' })).status, 200);

  // trocar a própria senha
  assert.equal((await cm('POST', '/api/password', { current: 'errada', next: 'outra-senha-1' })).status, 400);
  assert.equal((await cm('POST', '/api/password', { current: 'nova-senha-123', next: 'outra-senha-1' })).status, 200);

  await adm('PATCH', `/api/users/${marcos.id}`, { active: false });
  assert.equal((await cm('GET', '/api/me')).status, 401);
  const c2 = client();
  assert.equal((await c2('POST', '/api/login', { username: 'marcos', password: 'outra-senha-1' })).status, 401);
});

test('ajustes, nomes dos sócios (só admin), exemplos e exportação', async () => {
  const adm = client();
  await adm('POST', '/api/login', { username: 'brayan', password: 'senha-do-brayan' });
  assert.equal((await adm('PUT', '/api/settings', { meta: 0.15, alerta: 30 })).status, 200);
  assert.equal((await adm('PUT', '/api/settings', { meta: 9, alerta: 30 })).status, 400);
  assert.equal((await adm('PUT', '/api/settings/partners', { A: 'Ana', B: 'ana' })).status, 400);
  assert.equal((await adm('PUT', '/api/settings/partners', { A: 'Brayan', B: 'Marcos' })).status, 200);

  assert.equal((await adm('POST', '/api/examples')).status, 201);
  assert.equal((await adm('POST', '/api/examples')).status, 409);
  const withEx = (await adm('GET', '/api/data')).json;
  assert.ok(withEx.cars.some((c) => c.example && c.origemId));
  assert.equal((await adm('DELETE', '/api/examples')).status, 200);
  assert.ok((await adm('GET', '/api/data')).json.cars.every((c) => !c.example));

  const ex = await adm('GET', '/api/export');
  assert.match(ex.headers.get('content-disposition'), /attachment/);
  assert.ok(Array.isArray(ex.json.audit) && ex.json.cars.length >= 2);
  assert.ok(!ex.text.includes('password_hash'));
});

test('arquivos estáticos: sem travessia de diretório e com cabeçalhos de segurança', async () => {
  const r = await fetch(base + '/../package.json');
  assert.notEqual(r.status, 200);
  const r2 = await fetch(base + '/%2e%2e/package.json');
  assert.notEqual(r2.status, 200);
  const r3 = await fetch(base + '/api/health');
  assert.match(r3.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r3.headers.get('x-content-type-options'), 'nosniff');
});

test('placa sempre maiúscula (criação e edição) e recebimentos: plano, receber, validações', async () => {
  const adm = client();
  await adm('POST', '/api/login', { username: 'brayan', password: 'senha-do-brayan' });
  const car = (await adm('POST', '/api/cars', { name: 'Palio', placa: ' abc1d23 ', entT: 20000 })).json.item;
  assert.equal(car.placa, 'ABC1D23');
  assert.equal((await adm('PATCH', `/api/cars/${car.id}`, { placa: 'xyz9k88' })).json.item.placa, 'XYZ9K88');

  const parts = [
    { label: 'Entrada', due: '2026-10-10', valor: 5000, status: 'Recebido', paidAt: '2026-10-10' },
    { label: '1/2', due: '2026-11-10', valor: 7500 }, { label: '2/2', due: '2026-12-10', valor: 7500, quem: 'A' },
  ];
  assert.equal((await adm('POST', `/api/cars/${car.id}/plan`, { parts: [] })).status, 400);
  assert.equal((await adm('POST', `/api/cars/${car.id}/plan`, { parts: [{ label: 'x', due: '2026-10-10', valor: 1, status: 'Recebido' }] })).status, 400); // sem data de recebimento
  assert.equal((await adm('POST', `/api/cars/9999/plan`, { parts })).status, 404);
  assert.equal((await adm('POST', `/api/cars/${car.id}/plan`, { parts })).status, 201);
  let data = (await adm('GET', '/api/data')).json;
  assert.equal(data.receipts.filter((r) => r.carId === car.id && !r.deleted).length, 3);

  // refazer o plano substitui só o que estava pendente
  assert.equal((await adm('POST', `/api/cars/${car.id}/plan`, { parts: parts.slice(1) })).status, 201);
  data = (await adm('GET', '/api/data')).json;
  const live = data.receipts.filter((r) => r.carId === car.id && !r.deleted);
  assert.equal(live.length, 3); // entrada recebida mantida + 2 novas
  assert.ok(live.some((r) => r.label === 'Entrada' && r.status === 'Recebido'));

  const parc = live.find((r) => r.label === '1/2');
  assert.equal((await adm('PATCH', `/api/receipts/${parc.id}`, { status: 'Recebido' })).status, 400);
  assert.equal((await adm('PATCH', `/api/receipts/${parc.id}`, { status: 'Recebido', paidAt: '2026-11-11' })).status, 200);

  const audit = (await adm('GET', '/api/audit')).json.audit;
  const plan = audit.find((a) => a.action === 'programou');
  assert.equal(plan.userName, 'Brayan');
  assert.ok(plan.changes.some((c) => /7\.500/.test(c.para)));
  assert.ok(audit.some((a) => a.entity === 'receipt' && a.action === 'editou'));
});

test('pagamentos parciais e repasses de consignado: validação, sincronia da parcela e plano', async () => {
  const adm = client();
  await adm('POST', '/api/login', { username: 'brayan', password: 'senha-do-brayan' });
  const car = (await adm('POST', '/api/cars', { name: 'Uno', status: 'Vendido', entT: 10000, vvenda: 3000, dvenda: '2026-10-01' })).json.item;
  const rc = (await adm('POST', '/api/receipts', { carId: car.id, label: '1/1', due: '2026-10-10', valor: 3000 })).json.item;
  const get = async () => (await adm('GET', '/api/data')).json.receipts.find((r) => r.id === rc.id);
  assert.equal((await adm('POST', '/api/payments', { receiptId: rc.id, date: '2026-10-12', valor: 3500 })).status, 400); // passa do que falta
  const p1 = await adm('POST', '/api/payments', { receiptId: rc.id, date: '2026-10-12', valor: 1000, obs: 'metade' });
  assert.equal(p1.status, 201); assert.equal((await get()).status, 'Pendente');
  // refazer o plano não apaga parcela que já recebeu algo
  await adm('POST', `/api/cars/${car.id}/plan`, { parts: [{ label: 'novo', due: '2026-11-10', valor: 2000 }] });
  assert.ok((await adm('GET', '/api/data')).json.receipts.some((r) => r.id === rc.id && !r.deleted));
  assert.equal((await adm('POST', '/api/payments', { receiptId: rc.id, date: '2026-10-20', valor: 2000 })).status, 201);
  const q = await get(); assert.equal(q.status, 'Recebido'); assert.equal(q.paidAt, '2026-10-20');
  assert.equal((await adm('DELETE', `/api/payments/${p1.json.item.id}`)).status, 200);
  assert.equal((await get()).status, 'Pendente');

  // repasse só existe em carro consignado
  assert.equal((await adm('POST', '/api/repasses', { carId: car.id, date: '2026-10-02', valor: 100 })).status, 400);
  const k = (await adm('POST', '/api/cars', { name: 'Ka', dono: 'Felipe', repasse: 22000 })).json.item;
  assert.equal((await adm('POST', '/api/repasses', { carId: k.id, date: '2026-10-02', valor: 15000 })).status, 201);
  assert.equal((await adm('POST', '/api/repasses', { carId: k.id, date: '2026-10-02', valor: 0 })).status, 400);
});

test('fase 1: pátio sem data usa a compra, vendido vira Entregue, leilão/sinistro e montadora', async () => {
  const adm = client();
  await adm('POST', '/api/login', { username: 'brayan', password: 'senha-do-brayan' });
  const c = (await adm('POST', '/api/cars', { name: 'Fiat Uno', marca: 'Fiat', dcompra: '2026-09-01', entT: 15000, loc: 'Pátio / Loja', leilao: 1, histObs: 'leilão de financeira' })).json.item;
  assert.equal(c.locdesde, '2026-09-01'); assert.equal(c.leilao, 1); assert.equal(c.sinistro, null); assert.equal(c.marca, 'Fiat');
  // data informada é respeitada; local que não é o pátio não ganha data
  assert.equal((await adm('POST', '/api/cars', { name: 'A', dcompra: '2026-09-01', loc: 'Pátio / Loja', locdesde: '2026-09-05' })).json.item.locdesde, '2026-09-05');
  assert.equal((await adm('POST', '/api/cars', { name: 'B', dcompra: '2026-09-01', loc: 'Oficina mecânica' })).json.item.locdesde, null);
  const of = (await adm('POST', '/api/cars', { name: 'D', loc: 'Oficina mecânica', locdet: 'Oficina do Zé' })).json.item;
  assert.equal(of.locdet, 'Oficina do Zé');
  const pat = (await adm('PATCH', `/api/cars/${of.id}`, { _action: 'move', loc: 'Pátio / Loja', locdet: 'Oficina do Zé', locprev: '2026-12-01' })).json.item;
  assert.equal(pat.locdet, null); assert.equal(pat.locprev, null); // voltou ao pátio: sem oficina nem previsão de saída
  assert.equal((await adm('POST', '/api/cars', { name: 'C', sinistro: 'talvez' })).status, 400);

  const sold = await adm('PATCH', `/api/cars/${c.id}`, { status: 'Vendido', vvenda: 20000, dvenda: '2026-10-10', locdet: 'Oficina do Zé' });
  assert.equal(sold.json.item.loc, 'Entregue'); assert.equal(sold.json.item.locdet, null); assert.equal(sold.json.item.locdesde, '2026-10-10');
  // vendido não sai de "Entregue" ao ser movido
  assert.equal((await adm('PATCH', `/api/cars/${c.id}`, { _action: 'move', loc: 'Oficina mecânica' })).json.item.loc, 'Entregue');
  // voltou para o estoque: sai de "Entregue"
  const back = await adm('PATCH', `/api/cars/${c.id}`, { status: 'Em estoque' });
  assert.equal(back.json.item.loc, null);

  const audit = (await adm('GET', '/api/audit?limit=200')).json.audit;
  const ch = (h) => (typeof h.changes === 'string' ? JSON.parse(h.changes) : h.changes) || [];
  assert.ok(audit.some((h) => h.entityId === c.id && ch(h).some((x) => x.f === 'Veio de leilão' && x.para === 'Sim')));
});

test('montadora: nomes padronizados e tirados do nome do carro', async () => {
  const { marcaNome, marcaOf } = await import('../public/js/util.js');
  assert.equal(marcaNome('VW - VolksWagen'), 'Volkswagen'); assert.equal(marcaNome('GM - Chevrolet'), 'Chevrolet'); assert.equal(marcaNome('FIAT'), 'Fiat');
  assert.equal(marcaOf({ name: 'VW Gol 1.0 2016' }), 'Volkswagen'); assert.equal(marcaOf({ name: 'Land Rover Evoque' }), 'Land Rover');
  assert.equal(marcaOf({ name: 'Honda Civic', marca: 'HONDA' }), 'Honda'); assert.equal(marcaOf({ name: '' }), 'Sem montadora');
});

test('empréstimos e contas a pagar: cadastro, programação, troca das pendentes e validações', async () => {
  const adm = client();
  await adm('POST', '/api/login', { username: 'brayan', password: 'senha-do-brayan' });
  const bad = await adm('POST', '/api/loans', { credor: 'Mãe', data: '2026-08-15', valor: 57000, modo: 'Juros mensais', jurosMes: 2000 });
  assert.equal(bad.status, 400); assert.match(bad.json.error || bad.json.message || '', /devolvido/);
  const l = (await adm('POST', '/api/loans', { credor: 'Mãe', data: '2026-08-15', valor: 57000, modo: 'Juros mensais', jurosMes: 2000, venc: '2026-12-15' })).json.item;
  const parts = [{ label: 'Juros set/26', tipo: 'Juros', due: '2026-09-15', valor: 2000 }, { label: 'Devolução', tipo: 'Devolução', due: '2026-12-15', valor: 57000, quem: 'A' }];
  assert.equal((await adm('POST', '/api/payables/plan', { loanId: l.id, parts })).status, 201);
  let pays = (await adm('GET', '/api/data')).json.payables.filter((p) => p.loanId === l.id && !p.deleted);
  assert.equal(pays.length, 2); assert.ok(pays.every((p) => p.origem === 'Empréstimo' && p.credor === 'Mãe'));
  // pagar o juros e refazer: a paga fica, as pendentes são trocadas
  const juros = pays.find((p) => p.tipo === 'Juros');
  assert.equal((await adm('PATCH', `/api/payables/${juros.id}`, { status: 'Pago' })).status, 400); // sem data
  assert.equal((await adm('PATCH', `/api/payables/${juros.id}`, { status: 'Pago', paidAt: '2026-09-15' })).json.item.status, 'Pago');
  await adm('POST', '/api/payables/plan', { loanId: l.id, replace: true, parts: [{ label: 'Devolução', tipo: 'Devolução', due: '2027-01-15', valor: 57000 }] });
  pays = (await adm('GET', '/api/data')).json.payables.filter((p) => p.loanId === l.id && !p.deleted);
  assert.deepEqual(pays.map((p) => [p.tipo, p.due, p.status]).sort(), [['Devolução', '2027-01-15', 'Pendente'], ['Juros', '2026-09-15', 'Pago']]);

  // carro comprado a prazo: 60 dias, só um sócio paga
  const car = (await adm('POST', '/api/cars', { name: 'Corolla', dcompra: '2026-10-01', entT: 80000 })).json.item;
  assert.equal((await adm('POST', '/api/payables/plan', { carId: car.id, parts: [{ label: '60 dias', tipo: 'Parcela', due: '2026-11-30', valor: 80000, forma: 'Pix', quem: 'B', credor: 'João' }] })).status, 201);
  const cp = (await adm('GET', '/api/data')).json.payables.find((p) => p.carId === car.id);
  assert.equal(cp.origem, 'Carro'); assert.equal(cp.quem, 'B'); assert.equal(cp.forma, 'Pix');
  assert.equal((await adm('POST', '/api/payables/plan', { carId: 999999, parts })).status, 404);
  assert.equal((await adm('POST', '/api/payables/plan', { carId: car.id, parts: [{ due: '2026-11-30', valor: 0 }] })).status, 400);
  assert.equal((await adm('POST', '/api/payables', { origem: 'Carro', due: '2026-11-30', valor: 10 })).status, 400); // sem carro
  // histórico registra a programação
  const audit = (await adm('GET', '/api/audit?limit=50')).json.audit;
  assert.ok(audit.some((a) => a.entity === 'loan' && a.action === 'programou'));
  assert.ok(audit.some((a) => a.entity === 'car' && a.action === 'programou a pagar'));
});

test('documento do carro: transferido grava a data, voltar apaga; documentação pendente', async () => {
  const adm = client();
  await adm('POST', '/api/login', { username: 'brayan', password: 'senha-do-brayan' });
  const c = (await adm('POST', '/api/cars', { name: 'Doc', docNome: 'Antigo dono', docPend: 1, docObs: 'pegar o DUT' })).json.item;
  assert.equal(c.docNome, 'Antigo dono'); assert.equal(c.docPend, 1); assert.equal(c.docObs, 'pegar o DUT');
  assert.equal((await adm('POST', '/api/cars', { name: 'X', docNome: 'Outro' })).status, 400);
  const t = (await adm('PATCH', `/api/cars/${c.id}`, { docNome: 'Comprador' })).json.item;
  assert.match(t.docTransf, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await adm('PATCH', `/api/cars/${c.id}`, { docNome: 'Nosso nome' })).json.item.docTransf, null);
  assert.equal((await adm('PATCH', `/api/cars/${c.id}`, { docPend: 0, docObs: null })).json.item.docPend, 0);
});
