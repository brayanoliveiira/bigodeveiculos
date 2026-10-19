'use strict';
// Recebimentos (à vista / prazo / parcelado) e relatórios gerenciais. Sócios: 'A' e 'B'.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/calc.js');
const R = require('../public/js/reports.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: esperado ${b}, veio ${a}`);
const HOJE = '2026-10-18';
const SET = { meta: 0.1, alerta: 45 };

const cars = () => [
  { id: 1, name: 'Gol', status: 'Vendido', entT: 28000, ovrA: 9000, anun: 34500, vvenda: 32000, dcompra: '2026-08-20', dvenda: '2026-10-05', divis: 'Proporcional ao investido', comprador: 'João' },
  { id: 2, name: 'Onix', status: 'Em estoque', entT: 41000, anun: 49900, dcompra: '2026-09-28', loc: 'Funilaria e pintura', locdesde: '2026-10-10' },
  { id: 3, name: 'Fiesta', status: 'Em estoque', entT: 10000, origemId: 1, anun: 13900, dcompra: '2026-10-05' },
  { id: 4, name: 'Sandero', status: 'Vendido', entT: 24000, vvenda: 33000, dcompra: '2026-07-01', dvenda: '2026-08-10', quemrec: 'B' },
];
const exps = () => [
  { carId: 1, valor: 1200, quem: 'B', cat: 'Pneus', date: '2026-09-01' }, { carId: 1, valor: 850, quem: 'A', cat: 'Mecânica', date: '2026-09-03' },
  { carId: 1, valor: 600, quem: 'B', cat: 'Documentação e transferência', date: '2026-09-10' }, { carId: 1, valor: 150, quem: 'A', cat: 'Limpeza e estética', date: '2026-09-12' },
  { carId: 2, valor: 1500, quem: 'A', cat: 'Funilaria e pintura', date: '2026-10-08' },
];
const rcp = () => [
  { id: 1, carId: 1, label: 'Entrada', due: '2026-10-05', valor: 7000, status: 'Recebido', paidAt: '2026-10-05' },
  { id: 2, carId: 1, label: '1/2', due: '2026-10-15', valor: 7500, status: 'Pendente' },
  { id: 3, carId: 1, label: '2/2', due: '2026-11-14', valor: 7500, status: 'Pendente' },
  // Sandero: 3x, o dinheiro (33000) fica com B. Duas recebidas, uma por vir.
  { id: 4, carId: 4, label: '1/3', due: '2026-08-10', valor: 11000, status: 'Recebido', paidAt: '2026-08-10' },
  { id: 5, carId: 4, label: '2/3', due: '2026-09-10', valor: 11000, status: 'Recebido', paidAt: '2026-09-12' },
  { id: 6, carId: 4, label: '3/3', due: '2026-10-20', valor: 11000, status: 'Pendente' },
];
const build = (r = rcp()) => C.compute(cars(), exps(), [], SET, HOJE, r);

test('plan: à vista, a prazo, parcelado e entrada; soma sempre fecha', () => {
  const v = C.plan({ total: 10000, base: '2026-10-18', mode: 'vista' });
  assert.deepEqual(v.map((p) => [p.label, p.status, p.due]), [['À vista', 'Recebido', '2026-10-18']]);
  const pz = C.plan({ total: 9000, base: '2026-10-18', mode: 'prazo', prazoDias: 45, entrada: 2000 });
  assert.deepEqual(pz.map((p) => [p.label, p.valor, p.status, p.due]), [['Entrada', 2000, 'Recebido', '2026-10-18'], ['45 dias', 7000, 'Pendente', '2026-12-02']]);
  for (const n of [3, 5, 12]) {
    const ps = C.plan({ total: 26000.01, base: '2026-01-31', mode: 'parcelado', entrada: 10000, n });
    near(ps.reduce((a, p) => a + p.valor, 0), 26000.01, `soma ${n}x`);
    assert.equal(ps.length, n + 1);
  }
  assert.deepEqual(C.plan({ total: 100, base: '2026-01-31', mode: 'parcelado', n: 3 }).map((p) => p.due), ['2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(C.plan({ total: 100, base: '2026-01-10', mode: 'parcelado', n: 2, primeiro: '2026-03-05' }).map((p) => p.due), ['2026-03-05', '2026-04-05']);
});

test('venda parcelada com troca: recebido, a receber, atrasado e forma', () => {
  const g = build()[1];
  near(g.cash, 22000, 'dinheiro'); near(g.recebido, 7000, 'recebido'); near(g.aReceber, 15000, 'a receber'); near(g.atrasado, 7500, 'atrasado');
  assert.equal(g.parcAtras, 1); assert.equal(g.prox, '2026-10-15'); assert.equal(g.forma, 'Troca + Parcelado');
  near(g.recA, 11000, 'dinheiro A (metade)'); near(g.recebidoA, 3500, 'recebido A'); near(g.aReceberA, 7500, 'a receber A');
});

test('sem recebimentos cadastrados, a venda conta como recebida (à vista)', () => {
  const g = build([])[1];
  near(g.recebido, 22000, 'recebido'); near(g.aReceber, 0, 'a receber'); assert.equal(g.forma, 'Troca + À vista');
});

test('quem recebeu: regra do carro e sobrescrita por parcela', () => {
  const d = build()[4];
  near(d.recB, 33000, 'tudo com B'); near(d.recebidoB, 22000, 'recebido B'); near(d.aReceberB, 11000, 'a receber B'); near(d.recebidoA, 0, 'A não recebeu');
  const r = rcp(); r[5].quem = 'A';
  const e = build(r)[4];
  near(e.recA, 11000, 'parcela com A'); near(e.recB, 22000, 'resto com B');
});

test('plano que não cobre tudo: o que falta aparece como "sem programar"', () => {
  const r = rcp().filter((x) => x.id !== 3);
  const g = build(r)[1];
  near(g.semProg, 7500, 'sem programar'); near(g.aReceber, 15000, 'a receber inclui o que falta programar');
  const rec = R.recebiveis(build(r), HOJE);
  near(rec.semProgramar, 7500, 'relatório');
});

test('acerto: o saldo "hoje" fecha com o que ainda vai entrar', () => {
  const D = build(), s = C.summary(D, exps(), [], SET, HOJE, 2026);
  near(s.acerto[0].saldo + s.acerto[1].saldo, 0, 'saldo final soma zero');
  near(s.acerto[0].saldoHoje + s.acerto[1].saldoHoje, s.aReceber, 'saldo hoje soma o a receber');
  near(s.aReceber, 26000, 'a receber total'); near(s.atrasado, 7500, 'atrasado'); assert.equal(s.parcAtras, 1);
});

test('lucro por mês por investidor e total', () => {
  const D = build(), m = R.lucroMensal(D);
  assert.deepEqual(m.rows.map((r) => r.mes), ['2026-08', '2026-09', '2026-10']); // setembro sem vendas entra zerado
  const out = m.rows[2];
  near(out.lucro, 1200, 'lucro out'); near(out.lucA + out.lucB, 1200, 'A + B'); near(out.lucA, 389.61, 'lucro A (proporcional)');
  near(m.total.lucro, 1200 + 9000, 'total'); assert.equal(m.rows[1].n, 0);
  const so = R.lucroMensal(D, '2026-10-01', '2026-10-31');
  assert.deepEqual(so.rows.map((r) => r.mes), ['2026-10']);
});

test('investido por sócio antes de vender (estoque) e depois', () => {
  const p = R.porSocio(build(), exps());
  near(p.A.estoque.inv, 20500 + 1500 + 5000, 'A em estoque'); near(p.B.estoque.inv, 20500 + 5000, 'B em estoque');
  near(p.A.estoque.entrada, 20500 + 5000, 'entrada A'); near(p.A.estoque.gastos, 1500, 'gastos A');
  near(p.A.vendidos.inv, 10000 + 12000, 'A vendidos'); // Gol 9000+1000 ; Sandero 12000
  near(p.A.totalInvestido, p.A.estoque.inv + p.A.vendidos.inv, 'total');
  assert.equal(p.A.vendidos.n, 2);
  near(p.A.vendidos.luc + p.B.vendidos.luc, 1200 + 9000, 'lucro soma');
  near(p.A.saldo + p.B.saldo, 0, 'saldos somam zero');
});

test('caixa por mês: recebido e previsto, por sócio', () => {
  const k = R.caixaMensal(build(), HOJE);
  const mes = (m) => k.rows.find((r) => r.mes === m);
  near(mes('2026-08').recebido, 11000, 'ago'); near(mes('2026-09').recebido, 11000, 'set (pago em 12/09)');
  near(mes('2026-10').recebido, 7000, 'out recebido'); near(mes('2026-10').previsto, 7500 + 11000, 'out previsto'); near(mes('2026-10').atrasado, 7500, 'out atrasado');
  near(mes('2026-11').previsto, 7500, 'nov'); near(mes('2026-08').recB, 11000, 'ago B');
  near(k.total.recebido, 29000, 'recebido total');
});

test('recebíveis: faixas de vencimento e total por sócio', () => {
  const r = R.recebiveis(build(), HOJE);
  assert.equal(r.items.length, 3);
  near(r.faixas[0].valor, 7500, 'atrasado'); near(r.faixas[1].valor, 7500 + 11000, 'até 30 dias');
  near(r.total, 26000, 'total'); near(r.A + r.B, 26000, 'A + B'); near(r.B, 11000 + 3750 + 3750, 'B (Sandero inteiro + metade do Gol)');
  assert.equal(r.items[0].atraso, 3);
  assert.equal(r.porCarro.length, 2);
});

test('vendas por forma de pagamento e prazo médio', () => {
  const v = R.vendasPorForma(build());
  const f = v.rows.find((x) => x.forma === 'Troca + Parcelado');
  assert.equal(f.n, 1); near(f.fat, 32000, 'faturamento'); near(f.prazoMedio, (0 * 7000 + 10 * 7500 + 40 * 7500) / 22000, 'prazo médio');
  assert.ok(v.rows.some((x) => x.forma === 'Parcelado'));
  assert.equal(v.trocas.n, 1); near(v.trocas.valor, 10000, 'valor em troca');
  near(v.rows.reduce((a, x) => a + x.share, 0), 1, 'participação soma 100%');
});

test('estoque, gastos, ranking e visão geral', () => {
  const D = build(), e = R.estoque(D, SET);
  assert.equal(e.rows.length, 2); near(e.total.custo, 52500, 'capital em estoque'); near(e.total.A + e.total.B, 52500, 'A + B = custo');
  assert.equal(e.faixas[0].n, 2);
  const g = R.gastos(D, exps());
  near(g.total, 4300, 'gastos'); near(g.A, 2500, 'gastos A'); near(g.B, 1800, 'gastos B'); assert.equal(g.cats[0].cat, 'Funilaria e pintura');
  assert.deepEqual(g.meses.map((m) => m.mes), ['2026-09', '2026-10']);
  const rk = R.ranking(D);
  assert.equal(rk.melhor.car, 'Sandero'); assert.equal(rk.pior.car, 'Gol');
  const v = R.visaoGeral(D, exps(), HOJE, SET);
  assert.equal(v.vendas, 2); near(v.lucro, 10200, 'lucro'); near(v.aReceber, 26000, 'a receber'); near(v.atrasado, 7500, 'atrasado');
});

test('período e CSV', () => {
  assert.deepEqual(R.periodo('ano', HOJE), { from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(R.periodo('mes', HOJE), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(R.periodo('12m', HOJE), { from: '2025-10-18', to: HOJE });
  assert.deepEqual(R.periodo('tudo', HOJE), { from: '', to: '' });
  const csv = R.toCsv([{ k: 'a', label: 'Nome' }, { k: 'b', label: 'Valor' }, { k: 'c', label: 'Data', date: true }], [{ a: 'Gol; "1.0"', b: 1234.5, c: '2026-10-05' }]);
  assert.equal(csv, 'Nome;Valor;Data\r\n"Gol; ""1.0""";1234,5;05/10/2026');
});
