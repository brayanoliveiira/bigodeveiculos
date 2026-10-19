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
