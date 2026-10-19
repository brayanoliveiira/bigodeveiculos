'use strict';
/** Dados de exemplo (marcados com example=1) para conhecer o app. Podem ser removidos de uma vez. */
const { now, writeAudit, bump, HttpError } = require('./services');

/** `hoje` é a data do navegador (o servidor pode estar em outro fuso, ex.: UTC). */
function mkDay(hoje) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(hoje || '') ? new Date(`${hoje}T12:00:00Z`).getTime() : Date.now();
  return (offset) => new Date(base + offset * 86400000).toISOString().slice(0, 10);
}

async function loadExamples(db, user, hoje) {
  const day = mkDay(hoje);
  return db.tx(async (db) => {
    if (await db.get('SELECT 1 AS x FROM cars WHERE example = 1 LIMIT 1')) throw new HttpError(409, 'Os exemplos já estão carregados.');
    const ts = now();
    const car = async (c) => {
      const row = { status: 'Em estoque', example: 1, deleted: 0, createdBy: user.id, createdAt: ts, updatedBy: user.id, updatedAt: ts, ...c };
      const keys = Object.keys(row);
      return db.insert(`INSERT INTO cars (${keys.map((k) => `"${k.toLowerCase()}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => row[k]));
    };
    const item = async (table, c) => {
      const row = { example: 1, deleted: 0, createdBy: user.id, createdAt: ts, updatedBy: user.id, updatedAt: ts, ...c };
      const keys = Object.keys(row);
      return db.insert(`INSERT INTO ${table} (${keys.map((k) => `"${k.toLowerCase()}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => row[k]));
    };

    const gol = await car({
      name: 'VW Gol 1.0 2016 (exemplo)', placa: 'ABC1D23', ano: 2016, dcompra: day(-70), entT: 28000, ovrA: 9000, ovrB: 19000,
      anun: 42000, loc: 'Pátio / Loja', status: 'Vendido', dvenda: day(-8), vvenda: 41000, quemrec: 'A',
      comprador: 'Cliente exemplo', divis: 'Proporcional ao investido',
    });
    const civic = await car({
      name: 'Honda Civic 2012 (exemplo — veio de troca)', placa: 'DEF4G56', ano: 2012, dcompra: day(-8), entT: 15000, origemId: gol,
      anun: 24500, loc: 'Funilaria e pintura', locdet: 'Funilaria do Zé', locdesde: day(-5), locprev: day(5),
    });
    const onix = await car({
      name: 'Chevrolet Onix 2018 (exemplo)', placa: 'GHI7J89', ano: 2018, dcompra: day(-60), entT: 38000, anun: 52900,
      loc: 'Oficina mecânica', locdet: 'Oficina do Carlos', locdesde: day(-52), locprev: day(-10),
    });
    const sandero = await car({
      name: 'Renault Sandero 2017 (exemplo)', placa: 'SAN5D67', ano: 2017, dcompra: day(-80), entT: 24000, anun: 33900, loc: 'Pátio / Loja',
      status: 'Vendido', dvenda: day(-45), vvenda: 33000, quemrec: 'B', comprador: 'Cliente parcelado', divis: '50/50',
    });
    const hb20 = await car({
      name: 'Hyundai HB20 2016 (exemplo)', placa: 'HBV2A20', ano: 2016, dcompra: day(-120), entT: 31000, ovrA: 12000, ovrB: 19000,
      anun: 40000, loc: 'Pátio / Loja', status: 'Vendido', dvenda: day(-100), vvenda: 39000, comprador: 'Cliente à vista', divis: 'Proporcional ao investido',
    });
    await car({ name: 'Fiat Argo 2019 (exemplo)', placa: 'KLM0N12', ano: 2019, dcompra: day(-12), entT: 45000, anun: 56900, loc: 'Pátio / Loja', locdesde: day(-12) });

    await item('expenses', { carId: gol, date: day(-60), cat: 'Mecânica', desc: 'Revisão e troca de óleo', valor: 900, quem: 'A' });
    await item('expenses', { carId: gol, date: day(-55), cat: 'Limpeza e estética', desc: 'Polimento', valor: 350, quem: 'B' });
    await item('expenses', { carId: civic, date: day(-4), cat: 'Funilaria e pintura', desc: 'Pintura do para-choque', valor: 1200, quem: 'B' });
    await item('expenses', { carId: onix, date: day(-50), cat: 'Peças', desc: 'Kit embreagem', valor: 1800, quem: 'A' });
    await item('expenses', { carId: onix, date: day(-30), cat: 'Pneus', desc: '4 pneus novos', valor: 1900, quem: 'B' });
    await item('expenses', { carId: sandero, date: day(-70), cat: 'Mecânica', desc: 'Suspensão', valor: 1400, quem: 'A' });
    await item('expenses', { carId: hb20, date: day(-110), cat: 'Funilaria e pintura', desc: 'Pintura', valor: 1800, quem: 'B' });
    // Gol: carro de troca + dinheiro (entrada em pix e 3 parcelas)
    await item('receipts', { carId: gol, label: 'Entrada (pix)', due: day(-8), valor: 10000, status: 'Recebido', paidAt: day(-8) });
    await item('receipts', { carId: gol, label: '1/3', due: day(-1), valor: 5333.33, status: 'Pendente' });
    await item('receipts', { carId: gol, label: '2/3', due: day(29), valor: 5333.33, status: 'Pendente' });
    await item('receipts', { carId: gol, label: '3/3', due: day(59), valor: 5333.34, status: 'Pendente' });
    // Sandero: 5x, duas já recebidas, uma atrasada
    for (const [i, [o, st]] of [[-45, 'Recebido'], [-15, 'Recebido'], [-1, 'Pendente'], [29, 'Pendente'], [59, 'Pendente']].entries()) {
      const rid = await item('receipts', { carId: sandero, label: `${i + 1}/5`, due: day(o), valor: 6600, status: st, paidAt: st === 'Recebido' ? day(o) : null });
      // 3/5: venceu ontem e o cliente só pagou uma parte (ficaram R$ 4.600 em aberto).
      if (i === 2) await item('payments', { receiptId: rid, date: day(0), valor: 2000, obs: 'Pagou só uma parte' });
    }
    // Consignado: carro do Felipe. Repasse mínimo de R$ 22.000; gastos e comissão saem do que sobrar da venda.
    const ka = await car({
      name: 'Ford Ka 2014 (exemplo — consignado)', placa: 'KAF1B14', ano: 2014, dcompra: day(-30), dono: 'Felipe', repasse: 22000,
      anun: 29900, loc: 'Pátio / Loja', status: 'Vendido', dvenda: day(-6), vvenda: 27500, comprador: 'Cliente do Ka', divis: '50/50',
    });
    await item('expenses', { carId: ka, date: day(-20), cat: 'Mecânica', desc: 'Revisão antes de vender', valor: 800, quem: 'A' });
    await item('repasses', { carId: ka, date: day(-5), valor: 15000, quem: 'B', obs: 'Primeira parte do repasse ao Felipe' });
    // HB20: à vista
    await item('receipts', { carId: hb20, label: 'À vista', due: day(-100), valor: 39000, status: 'Recebido', paidAt: day(-100) });
    await item('planned', { carId: civic, cat: 'Limpeza e estética', desc: 'Higienização completa', valor: 400, quem: 'A', prazo: day(7), status: 'Pendente' });
    await item('planned', { carId: onix, cat: 'Documentação e transferência', desc: 'Vistoria e transferência', valor: 700, prazo: day(-3), status: 'Pendente' });

    await writeAudit(db, user.id, 'settings', null, 'dados de exemplo', 'criou', [{ f: 'Dados de exemplo', de: null, para: 'carregados' }]);
    await bump(db);
    return { loaded: true };
  });
}

async function removeExamples(db, user) {
  return db.tx(async (db) => {
    await db.run('UPDATE cars SET origemId = NULL WHERE origemId IN (SELECT id FROM cars WHERE example = 1)');
    // Itens reais ligados a carros de exemplo seriam órfãos: bloqueia em vez de apagar.
    const orphan = await db.get('SELECT 1 AS x FROM expenses WHERE example = 0 AND carId IN (SELECT id FROM cars WHERE example = 1) LIMIT 1')
      || await db.get('SELECT 1 AS x FROM planned WHERE example = 0 AND carId IN (SELECT id FROM cars WHERE example = 1) LIMIT 1')
      || await db.get('SELECT 1 AS x FROM receipts WHERE example = 0 AND carId IN (SELECT id FROM cars WHERE example = 1) LIMIT 1')
      || await db.get('SELECT 1 AS x FROM repasses WHERE example = 0 AND carId IN (SELECT id FROM cars WHERE example = 1) LIMIT 1')
      || await db.get('SELECT 1 AS x FROM payments WHERE example = 0 AND receiptId IN (SELECT id FROM receipts WHERE example = 1) LIMIT 1');
    if (orphan) throw new HttpError(409, 'Há gastos reais ligados a um carro de exemplo. Mova ou exclua esses gastos antes.');
    await db.run('DELETE FROM payments WHERE example = 1');
    await db.run('DELETE FROM repasses WHERE example = 1');
    await db.run('DELETE FROM expenses WHERE example = 1');
    await db.run('DELETE FROM planned WHERE example = 1');
    await db.run('DELETE FROM receipts WHERE example = 1');
    const r = await db.run('DELETE FROM cars WHERE example = 1');
    await writeAudit(db, user.id, 'settings', null, 'dados de exemplo', 'excluiu', [{ f: 'Dados de exemplo', de: 'carregados', para: 'removidos' }]);
    await bump(db);
    return { removed: Number(r.changes) };
  });
}

module.exports = { loadExamples, removeExamples };
