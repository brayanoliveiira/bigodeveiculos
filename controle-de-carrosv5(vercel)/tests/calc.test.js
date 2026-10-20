'use strict';
// Testes das regras de cálculo (public/js/calc.js). Sócios: 'A' (primeiro) e 'B' (segundo).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/calc.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: esperado ${b}, veio ${a}`);
const HOJE = '2026-10-18';
const SET = { meta: 0.1, alerta: 45 };
const t = test;

// Cenário igual ao da planilha: Gol vendido com Fiesta na troca, Onix em estoque.
const cars = () => [
  { id: 'g', name: 'Gol', status: 'Vendido', entT: 28000, ovrA: 9000, anun: 34500, vvenda: 32000,
    dcompra: '2026-08-20', dvenda: '2026-10-05', divis: 'Proporcional ao investido' },
  { id: 'o', name: 'Onix', status: 'Em estoque', entT: 41000, anun: 49900, dcompra: '2026-09-28',
    loc: 'Funilaria e pintura', locdesde: '2026-10-10', locprev: '2026-10-22' },
  { id: 'f', name: 'Fiesta', status: 'Em estoque', entT: 10000, origemId: 'g', anun: 13900, dcompra: '2026-10-05' },
];
const exps = () => [
  { carId: 'g', valor: 1200, quem: 'B', cat: 'Pneus' }, { carId: 'g', valor: 850, quem: 'A', cat: 'Mecânica' },
  { carId: 'g', valor: 600, quem: 'B', cat: 'Documentação e transferência' }, { carId: 'g', valor: 150, quem: 'A', cat: 'Limpeza e estética' },
  { carId: 'o', valor: 1500, quem: 'A', cat: 'Funilaria e pintura' },
];
const plan = () => [
  { carId: 'o', valor: 300, status: 'Pendente', prazo: '2026-10-20' },
  { carId: 'o', valor: 700, status: 'Pendente', prazo: '2026-10-30' },
  { carId: 'o', valor: 999, status: 'Realizado', prazo: '2026-10-01' },
];

t('entrada: só o total divide ao meio', () => {
  assert.deepStrictEqual(C.entry({ entT: 41000 }), { A: 20500, B: 20500 });
});
t('entrada: um sócio informado, o outro é o resto', () => {
  assert.deepStrictEqual(C.entry({ entT: 28000, ovrA: 9000 }), { A: 9000, B: 19000 });
  assert.deepStrictEqual(C.entry({ entT: 28000, ovrB: 8000 }), { A: 20000, B: 8000 });
});
t('Gol: custo, lucro, divisão proporcional', () => {
  const D = C.compute(cars(), exps(), plan(), SET, HOJE), g = D.g;
  near(g.custo, 30800, 'custo'); near(g.lucro, 1200, 'lucro');
  near(g.invA, 10000, 'investido Brayan'); near(g.invB, 20800, 'investido Marcos');
  near(g.pA * 100, 32.4675, 'percentual Brayan'); near(g.lucA, 389.61, 'lucro Brayan');
  near(g.perdeu, 2500, 'deixou de ganhar');
});
t('troca: dinheiro = venda - carro recebido; carro de troca entra metade cada', () => {
  const g = C.compute(cars(), exps(), plan(), SET, HOJE).g;
  near(g.troca, 10000, 'troca'); near(g.cash, 22000, 'dinheiro');
  near(g.recA, 11000, 'dinheiro Brayan'); near(g.kindA, 5000, 'carro Brayan');
});
t('Onix: preço mínimo ignora previsto realizado; projeção e local', () => {
  const o = C.compute(cars(), exps(), plan(), SET, HOJE).o;
  near(o.prev, 1000, 'previstos pendentes'); near(o.pmin, 43500, 'preço mínimo');
  near(o.pmeta, 47850, 'preço meta'); near(o.proj, 6400, 'lucro projetado');
  assert.strictEqual(o.diasLoc, 8); assert.strictEqual(o.pA, 0.5);
});
t('resumo e acerto entre sócios fecham com zero', () => {
  const D = C.compute(cars(), exps(), plan(), SET, HOJE);
  const s = C.summary(D, exps(), plan(), SET, HOJE, 2026);
  near(s.lucro, 1200, 'lucro total'); near(s.parado, 52500, 'dinheiro parado'); near(s.trocaTot, 10000, 'trocas');
  near(s.acerto[0].saldo, -5610.39, 'saldo Brayan'); near(s.acerto[1].saldo, 5610.39, 'saldo Marcos');
  near(s.acerto[0].saldo + s.acerto[1].saldo, 0, 'soma dos saldos');
  near(s.months[9].luc, 1200, 'lucro de outubro');
});
t('quem ficou com o dinheiro: um sócio recebeu tudo', () => {
  const c = cars(); c[0].quemrec = 'B';
  const g = C.compute(c, exps(), plan(), SET, HOJE).g;
  near(g.recA, 0, 'Brayan'); near(g.recB, 22000, 'Marcos');
});
t('divisão padrão é 50/50 e personalizada usa o percentual', () => {
  const c = cars(); c[0].divis = null;
  near(C.compute(c, exps(), plan(), SET, HOJE).g.pA, 0.5, '50/50');
  c[0].divis = 'Personalizado'; c[0].pcust = 0.3;
  near(C.compute(c, exps(), plan(), SET, HOJE).g.pA, 0.3, 'personalizado');
});
t('compra com carro + dinheiro nosso: dinheiro negativo, saldos ainda fecham', () => {
  // Demos o Gol (vendido por 32000) e levamos um carro avaliado em 40000: pagamos 8000 de diferença.
  const c = [
    { id: 'g', name: 'Gol', status: 'Vendido', entT: 28000, vvenda: 32000, dcompra: '2026-08-20', dvenda: '2026-10-05' },
    { id: 'x', name: 'Carro novo', status: 'Em estoque', entT: 40000, origemId: 'g' },
  ];
  const D = C.compute(c, [], [], SET, HOJE);
  near(D.g.cash, -8000, 'dinheiro negativo');
  const s = C.summary(D, [], [], SET, HOJE, 2026);
  near(s.acerto[0].saldo + s.acerto[1].saldo, 0, 'soma dos saldos');
});
t('item excluído não entra nas contas', () => {
  const e = exps(); e[0].deleted = true;
  near(C.compute(cars(), e, plan(), SET, HOJE).g.gast, 1600, 'gastos sem o excluído');
  const c = cars(); c[1].deleted = true;
  assert.strictEqual(C.compute(c, exps(), plan(), SET, HOJE).o, undefined);
});
t('alertas: carro parado e saída atrasada', () => {
  const c = cars(); c[1].dcompra = '2026-08-01'; c[1].locprev = '2026-10-10';
  const D = C.compute(c, exps(), plan(), SET, HOJE), s = C.summary(D, exps(), plan(), SET, HOJE, 2026);
  assert.ok(s.parados >= 1); assert.strictEqual(D.o.atrasoLoc, true); assert.ok(s.saidaVencida >= 1);
});

// ---- consignado e pagamentos parciais ----
t('consignado: custo = repasse + gastos; comissão = venda − custo; investimento só nos gastos', () => {
  const cs = [{ id: 'k', name: 'Ka', status: 'Vendido', dono: 'Felipe', repasse: 22000, vvenda: 27500, dvenda: '2026-10-01', divis: '50/50' }];
  const ex = [{ carId: 'k', valor: 800, quem: 'A' }];
  const rp = [{ carId: 'k', valor: 15000, quem: 'B' }];
  const D = C.compute(cs, ex, [], SET, HOJE, [], [], rp);
  near(D.k.custo, 22800, 'custo'); near(D.k.lucro, 4700, 'comissão'); near(D.k.invA, 800, 'inv A'); near(D.k.invB, 0, 'inv B');
  near(D.k.repFalta, 7000, 'falta repassar'); near(D.k.lucA, 2350, 'comissão A');
});
t('pagamento parcial: parcela fica em aberto com o resto; atrasa só o que falta', () => {
  const cs = [{ id: 'g', name: 'Gol', status: 'Vendido', entT: 10000, vvenda: 2000, dvenda: '2026-08-01', divis: '50/50' }];
  const rc = [{ id: 'r1', carId: 'g', valor: 1000, due: '2026-10-01', status: 'Pendente' }, { id: 'r2', carId: 'g', valor: 1000, due: '2026-12-01', status: 'Pendente' }];
  const pg = [{ id: 'p1', receiptId: 'r1', valor: 400, date: '2026-10-05' }];
  const D = C.compute(cs, [], [], SET, HOJE, rc, pg, []);
  near(D.g.recebido, 400, 'recebido'); near(D.g.aReceber, 1600, 'a receber'); near(D.g.atrasado, 600, 'atrasado');
  assert.equal(D.g.parcelas[0].st, 'Parcial'); near(D.g.parcelas[0].falta, 600, 'falta');
});

t('consignado vendido com carro na troca que fica com o dono: comissão normal, carro não é nosso, valor abate o repasse', () => {
  const cs = [
    { id: 'k', name: 'Ka', status: 'Vendido', dono: 'Felipe', repasse: 22000, vvenda: 30000, dvenda: '2026-10-01', divis: '50/50' },
    { id: 't', name: 'Celta (troca)', status: 'Em estoque', dono: 'felipe', entT: 8000, origemId: 'k', dcompra: '2026-10-01' },
  ];
  const D = C.compute(cs, [{ carId: 'k', valor: 500, quem: 'A' }], [], SET, HOJE, [], [], [{ carId: 'k', valor: 6000, quem: 'B' }]);
  near(D.k.lucro, 7500, 'comissão = 30000 − 22000 − 500'); near(D.k.cash, 22000, 'dinheiro = venda − carro de troca');
  near(D.k.emEspecie, 8000, 'pago em carro'); near(D.k.repFalta, 8000, 'falta repassar em dinheiro = 22000 − 8000 − 6000');
  assert.equal(D.t.entregue, true); near(D.t.invA + D.t.invB, 0, 'ninguém investiu no carro de troca');
  const S2 = C.summary(D, [], [], SET, HOJE, 2026);
  assert.equal(S2.estoque, 0);
});

test('empréstimo com juros mensais: juros todo mês e devolução no vencimento', () => {
  const p = C.loanPlan({ valor: 57000, data: '2026-08-15', modo: 'Juros mensais', jurosMes: 2000, venc: '2026-12-15' });
  assert.deepEqual(p.map((x) => [x.tipo, x.due, x.valor]), [
    ['Juros', '2026-09-15', 2000], ['Juros', '2026-10-15', 2000], ['Juros', '2026-11-15', 2000], ['Devolução', '2026-12-15', 59000]]);
  assert.equal(p[3].label, 'Devolução + juros dez/26');
  // juros em %: 3% de 10.000 = 300 por mês; devolução fora do dia do empréstimo ainda paga o juros daquele mês
  const q = C.loanPlan({ valor: 10000, data: '2026-01-10', modo: 'Juros mensais', taxaMes: 0.03, venc: '2026-03-20' });
  assert.deepEqual(q.map((x) => [x.tipo, x.due, x.valor]), [['Juros', '2026-02-10', 300], ['Devolução', '2026-03-20', 10300]]);
  assert.deepEqual(C.loanPlan({ valor: 1000, data: '2026-01-10', modo: 'Juros mensais', jurosMes: 10 }), []); // sem vencimento
});

test('empréstimo parcelado: tabela Price e sem juros com soma exata', () => {
  const p = C.loanPlan({ valor: 20000, data: '2026-10-20', modo: 'Parcelado', taxaMes: 0.058, nParc: 2 });
  assert.deepEqual(p.map((x) => [x.label, x.due, x.valor]), [['1/2', '2026-11-20', 10878.17], ['2/2', '2026-12-20', 10878.17]]);
  const z = C.loanPlan({ valor: 1000, data: '2026-01-31', modo: 'Parcelado', nParc: 3, venc: '2026-02-28' });
  assert.deepEqual(z.map((x) => [x.due, x.valor]), [['2026-02-28', 333.33], ['2026-03-28', 333.33], ['2026-04-28', 333.34]]);
});

test('contas a pagar: divisão entre sócios, atrasos, juros pagos e itens de carro ou empréstimo excluído', () => {
  const loans = [{ id: 1, valor: 57000, modo: 'Juros mensais', jurosMes: 2000 }, { id: 2, valor: 20000, modo: 'Parcelado', taxaMes: 0.058, nParc: 2 }, { id: 3, valor: 5, modo: 'Parcelado', deleted: true }];
  const cars = [{ id: 10, name: 'Gol' }, { id: 11, name: 'Velho', deleted: true }];
  const pay = [
    { id: 1, loanId: 1, tipo: 'Juros', due: '2026-09-15', valor: 2000, status: 'Pago' },
    { id: 2, loanId: 1, tipo: 'Juros', due: '2026-10-15', valor: 2000, status: 'Pendente' }, // atrasado
    { id: 3, loanId: 1, tipo: 'Devolução', due: '2026-12-15', valor: 57000, status: 'Pendente', quem: 'A' },
    { id: 4, loanId: 2, tipo: 'Parcela', due: '2026-11-20', valor: 10878.17, status: 'Pago' },
    { id: 5, loanId: 2, tipo: 'Parcela', due: '2026-12-20', valor: 10878.17, status: 'Pendente', quem: 'B' },
    { id: 6, carId: 10, tipo: 'Parcela', due: '2026-11-01', valor: 30000, status: 'Pendente' },
    { id: 7, carId: 11, tipo: 'Parcela', due: '2026-11-01', valor: 999, status: 'Pendente' },
    { id: 8, loanId: 3, tipo: 'Parcela', due: '2026-11-01', valor: 999, status: 'Pendente' },
    { id: 9, carId: 10, tipo: 'Parcela', due: '2026-11-01', valor: 999, status: 'Pendente', deleted: true },
  ];
  const s = C.debts(pay, loans, cars, HOJE);
  near(s.total, 2000 + 57000 + 10878.17 + 30000, 'total a pagar');
  near(s.A, 1000 + 57000 + 15000, 'A'); near(s.B, 1000 + 10878.17 + 15000, 'B');
  near(s.atrasado, 2000, 'atrasado');
  near(s.porLoan[1].juros, 4000, 'juros do empréstimo 1 (2 meses)');
  near(s.porLoan[2].juros, 1756.34, 'juros do parcelado');
  near(s.porLoan[2].jurosPagos, 878.17, 'metade dos juros já pagos');
  near(s.jurosPagos, 2000 + 878.17, 'juros pagos no total');
  near(s.jurosMes, 2000, 'juros por mês dos empréstimos em aberto');
  assert.equal(s.porCar[10].falta, 30000); assert.equal(s.porCar[11], undefined); assert.equal(s.porLoan[3], undefined);
  assert.equal(s.porLoan[1].prox, '2026-10-15'); assert.equal(s.porLoan[2].quitado, false);
});

test('rastreio do empréstimo: Kombi vendida com Celta na troca, até virar dinheiro', () => {
  const kombi = { id: 1, name: 'Kombi', status: 'Em estoque' }, celta = { id: 2, name: 'Celta', origemId: 1, status: 'Em estoque' };
  let t = C.loanTrail(1, [kombi]);
  assert.deepEqual(t.holders.map((c) => c.name), ['Kombi']); assert.equal(t.emDinheiro, false);
  kombi.status = 'Vendido'; kombi.dvenda = '2026-11-01';
  t = C.loanTrail(1, [kombi, celta]);
  assert.deepEqual(t.path.map((c) => c.name), ['Kombi', 'Celta']); assert.deepEqual(t.holders.map((c) => c.name), ['Celta']);
  celta.status = 'Vendido'; celta.dvenda = '2026-12-05';
  t = C.loanTrail(1, [kombi, celta]);
  assert.equal(t.emDinheiro, true); assert.equal(t.ultimaVenda, '2026-12-05');
  // troca ignorada (ex.: ficou com o dono do consignado) não segura o dinheiro; carro excluído some do rastreio
  const gol = { id: 3, name: 'Gol', origemId: 2, status: 'Em estoque' };
  assert.equal(C.loanTrail(1, [kombi, celta, gol], (c) => c.id === 3).emDinheiro, true);
  assert.deepEqual(C.loanTrail(1, [kombi, celta, gol]).holders.map((c) => c.name), ['Gol']);
  assert.equal(C.loanTrail(9, [kombi]), null);
});

test('juros pagos saem do lucro: metade de cada sócio, quem pagou do bolso recebe de volta', () => {
  const loans = [{ id: 1, valor: 57000, modo: 'Juros mensais', jurosMes: 2000 }, { id: 2, valor: 20000, modo: 'Parcelado' }];
  const pay = [
    { loanId: 1, tipo: 'Juros', due: '2026-09-15', paidAt: '2026-09-15', valor: 2000, status: 'Pago', quem: 'A' },
    { loanId: 1, tipo: 'Juros', due: '2026-10-15', paidAt: '2026-10-16', valor: 2000, status: 'Pago' },
    { loanId: 1, tipo: 'Juros', due: '2026-11-15', valor: 2000, status: 'Pendente' },
    { loanId: 1, tipo: 'Devolução', due: '2026-12-15', valor: 57000, status: 'Pago', paidAt: '2026-12-15' }, // devolução sem juros junto: não é juros
    { loanId: 2, tipo: 'Parcela', due: '2026-11-20', paidAt: '2026-11-20', valor: 10878.17, status: 'Pago', quem: 'B' },
    { loanId: 2, tipo: 'Parcela', due: '2026-12-20', valor: 10878.17, status: 'Pendente' },
  ];
  const j = C.jurosPagos(pay, loans);
  near(j.total, 4000 + 878.17, 'juros pagos');
  near(j.pagoA, 2000 + 1000, 'A tirou do bolso'); near(j.pagoB, 1000 + 878.17, 'B tirou do bolso');
  near(j.porMes['2026-10'], 2000, 'outubro'); near(j.porMes['2026-11'], 878.17, 'novembro');
  near(C.jurosPagos(pay, loans, '2026-10-01', '2026-10-31').total, 2000, 'só outubro');

  const cars = [{ id: 1, name: 'Gol', entT: 20000, status: 'Vendido', vvenda: 30000, dvenda: '2026-10-10' }];
  const D = C.compute(cars, [], [], { meta: 0.1 }, HOJE, [], [], []);
  const sem = C.summary(D, [], [], { meta: 0.1, alerta: 45 }, HOJE, 2026), com = C.summary(D, [], [], { meta: 0.1, alerta: 45 }, HOJE, 2026, j);
  near(com.lucroLiq, 10000 - j.total, 'lucro líquido');
  near(com.acerto[0].luc, sem.acerto[0].luc - j.total / 2, 'metade do juros sai do lucro de A');
  // A pagou mais juros do bolso que a metade dele: B passa a dever essa diferença a A
  near(com.acerto[0].saldo - sem.acerto[0].saldo, j.pagoA - j.total / 2, 'acerto devolve a A');
  near(com.months[9].luc, sem.months[9].luc - 2000, 'outubro no gráfico');
});

test('quitação prevista: informada ou a última parcela; juros depois dela não contam como a pagar', () => {
  const loans = [{ id: 1, valor: 30000, modo: 'Juros mensais', jurosMes: 1000, quitPrev: '2026-11-20' }, { id: 2, valor: 1000, modo: 'Parcelado' }];
  const pay = [
    { loanId: 1, tipo: 'Juros', due: '2026-11-15', valor: 1000, status: 'Pendente' },
    { loanId: 1, tipo: 'Juros', due: '2026-12-15', valor: 1000, status: 'Pendente' }, // depois da quitação prevista
    { loanId: 1, tipo: 'Devolução', due: '2026-12-15', valor: 30000, status: 'Pendente' },
    { loanId: 2, tipo: 'Parcela', due: '2026-09-01', valor: 600, status: 'Pendente' },
    { loanId: 2, tipo: 'Parcela', due: '2026-10-01', valor: 600, status: 'Pendente' },
  ];
  const s = C.debts(pay, loans, [], HOJE);
  assert.equal(s.porLoan[1].quitPrev, '2026-11-20'); assert.equal(s.porLoan[1].quitPrevManual, true);
  assert.equal(s.porLoan[2].quitPrev, '2026-10-01'); assert.equal(s.porLoan[2].quitPrevManual, false);
  assert.equal(s.porLoan[2].quitAtrasada, true); assert.equal(s.porLoan[1].quitAtrasada, false); assert.equal(s.quitAtrasadas, 1);
  near(s.jurosPend, 1000 + 200, 'juros a pagar: 1 mês do primeiro + juros do parcelado');
});

test('juros a partir da %: reais inteiros, arredondado para cima', () => {
  assert.equal(C.jurosDaTaxa(57000, 0.03), 1710);
  assert.equal(C.jurosDaTaxa(33333, 0.033), 1100); // 1.099,99 -> 1.100
  assert.equal(C.jurosDaTaxa(20000, 0.0585), 1170);
  assert.equal(C.jurosDaTaxa(10001, 0.03), 301); // 300,03 -> 301
  assert.ok(Object.is(C.jurosDaTaxa(57000, null), 0), 'sem % não vira -0 (aparecia "-R$ 0,00")');
  assert.equal(C.loanPlan({ valor: 10001, data: '2026-01-10', modo: 'Juros mensais', taxaMes: 0.03, venc: '2026-03-10' })[0].valor, 301);
});

test('devolução com juros do mês junto: só a parte acima do valor emprestado é juros', () => {
  const loans = [{ id: 1, valor: 57000, modo: 'Juros mensais', jurosMes: 2000 }];
  const pay = [
    { loanId: 1, tipo: 'Juros', due: '2026-11-15', paidAt: '2026-11-15', valor: 2000, status: 'Pago' },
    { loanId: 1, tipo: 'Devolução', due: '2026-12-15', paidAt: '2026-12-15', valor: 59000, status: 'Pago', quem: 'A' },
  ];
  const j = C.jurosPagos(pay, loans);
  near(j.total, 4000, 'juros pagos'); near(j.porMes['2026-12'], 2000, 'dezembro'); near(j.pagoA, 1000 + 2000, 'A pagou a devolução');
  const s = C.debts(pay, loans, [], HOJE);
  near(s.jurosPagos, 4000, 'resumo'); near(s.porLoan[1].juros, 4000, 'juros total'); assert.equal(s.porLoan[1].quitado, true);
});

test('juros mensais com dia de vencimento escolhido: 57 mil em agosto, 2 mil em 09, 10 e 11, 59 mil em 12', () => {
  const p = C.loanPlan({ valor: 57000, data: '2026-08-02', modo: 'Juros mensais', jurosMes: 2000, venc1: '2026-09-10', venc: '2026-12-10' });
  assert.deepEqual(p.map((x) => [x.label, x.due, x.valor]), [
    ['Juros set/26', '2026-09-10', 2000], ['Juros out/26', '2026-10-10', 2000], ['Juros nov/26', '2026-11-10', 2000], ['Devolução + juros dez/26', '2026-12-10', 59000]]);
  // devolução em dia diferente do dos juros: o mês dela não ganha juros separado
  const q = C.loanPlan({ valor: 57000, data: '2026-08-02', modo: 'Juros mensais', jurosMes: 2000, venc1: '2026-09-25', venc: '2026-12-05' });
  assert.deepEqual(q.map((x) => x.due), ['2026-09-25', '2026-10-25', '2026-11-25', '2026-12-05']);
});
