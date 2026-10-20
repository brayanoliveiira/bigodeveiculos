// Aba Gerencial: relatórios completos (sócios, lucro mensal por investidor, caixa e recebíveis, vendas por forma, estoque, gastos, ranking).
// As contas ficam em reports.js; aqui só a apresentação, o filtro de período e a exportação em CSV.
import { $, esc, brl, pct, dmy, today, sign, table, mlabel, downloadFile } from './util.js';
import { S, names } from './state.js';
import { views } from './views.js';

const REPORTS = [['geral', 'Visão geral'], ['socios', 'Sócios'], ['lucro', 'Lucro por mês'], ['caixa', 'Caixa e recebíveis'], ['vendas', 'Vendas por forma'], ['estoque', 'Estoque'], ['consig', 'Consignados'], ['gastos', 'Gastos'], ['ranking', 'Carros vendidos']];
const PERIODOS = [['ano', 'Este ano'], ['mes', 'Este mês'], ['12m', 'Últimos 12 meses'], ['ano-passado', 'Ano passado'], ['tudo', 'Tudo'], ['custom', 'Personalizado']];
const nm = (c) => names()[c] || '—';
const csvReg = {};
let csvSeq = 0;

/** Juros de empréstimos pagos no período: saem do lucro (Calc.jurosPagos). */
const jurosDe = (p) => Calc.jurosPagos(S.payables, S.loans, p.from, p.to);
function per() { return Reports.periodo(S.ui.per, today(), { from: S.ui.from, to: S.ui.to }); }
function perText() {
  const p = per();
  if (!p.from && !p.to) return 'todo o período';
  return `${p.from ? dmy(p.from) : 'início'} a ${p.to ? dmy(p.to) : 'hoje'}`;
}
const K = (t, v, cls, hero) => `<div class="kpi${hero ? ' hero' : ''}"><dt>${esc(t)}</dt><dd class="${cls || ''}">${v}</dd></div>`;
const kpis = (arr) => `<dl class="grid kpis" style="margin:0">${arr.join('')}</dl>`;
const val = (v, cls) => `<span class="${cls || sign(v)}">${brl(v)}</span>`;
function panel(title, body, csv, note) {
  let btn = '';
  if (csv) { const id = 'c' + (++csvSeq); csvReg[id] = csv; btn = `<button class="btn sm no-print" data-act="csv" data-id="${id}">Exportar CSV</button>`; }
  return `<section class="panel"><div class="rep-h"><h2>${esc(title)}</h2>${btn}</div>${note ? `<p class="mut small" style="margin:0 0 8px">${note}</p>` : ''}${body}</section>`;
}
const legend = (items) => `<div class="legend">${items.map(([c, l]) => `<span><i class="${c}"></i>${esc(l)}</span>`).join('')}</div>`;

const compact = (v) => { const a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1000 ? (a / 1000).toFixed(1).replace('.', ',') + ' mil' : String(Math.round(a))); };
function groupedChart(rows, series, aria) {
  if (!rows.length) return '<p class="mut" style="margin:0">Sem dados no período.</p>';
  const W = 720, H = 250, L = 60, T = 16, B = 34, w = W - L - 8, h = H - T - B;
  const vals = rows.flatMap((r) => series.map((s) => r[s.k] || 0));
  let hi = Math.max(0, ...vals);
  const lo = Math.min(0, ...vals);
  if (hi === lo) hi = 1;
  const y = (v) => T + (hi - v) / (hi - lo) * h, gw = w / rows.length, bw = Math.min(30, gw * 0.84 / series.length);
  const labels = series.length === 1 && rows.length <= 8; // com duas séries os rótulos se sobrepõem; o valor está no tooltip e na tabela
  let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">`;
  [hi, 0, lo].filter((v, i, a) => a.indexOf(v) === i).forEach((v) => { g += `<line x1="${L}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${compact(v)}</text>`; });
  rows.forEach((r, i) => {
    const x0 = L + i * gw + (gw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = r[s.k] || 0, x = x0 + j * bw;
      if (v !== 0) {
        g += `<rect class="${v < 0 && !s.keepColor ? 'bar neg' : s.cls}" x="${x}" y="${Math.min(y(v), y(0))}" width="${bw - 2}" height="${Math.max(Math.abs(y(v) - y(0)), 1)}" rx="2"><title>${esc(s.label)} · ${esc(mlabel(r.mes))}: ${brl(v)}</title></rect>`;
        if (labels) g += `<text x="${x + (bw - 2) / 2}" y="${v >= 0 ? y(v) - 4 : y(v) + 11}" text-anchor="middle">${compact(v)}</text>`;
      }
    });
    if (rows.length <= 14 || i % 2 === 0) g += `<text x="${L + i * gw + gw / 2}" y="${H - 12}" text-anchor="middle">${esc(mlabel(r.mes))}</text>`;
  });
  return g + '</svg>';
}

/* ---------- relatórios ---------- */
const R = {};

R.geral = (D) => {
  const p = per(), J = jurosDe(p), v = Reports.visaoGeral(D, S.expenses, today(), S.settings, p.from, p.to, J);
  const soc = Reports.porSocio(D, S.expenses, p.from, p.to, J), lm = Reports.lucroMensal(D, p.from, p.to, J);
  let h = `<p class="mut small" style="margin:0">Vendas e gastos de ${esc(perText())}. Estoque e recebíveis são a situação de hoje.</p>`;
  h += kpis([...(v.juros ? [K('Lucro líquido (após juros)', brl(v.lucroLiq), sign(v.lucroLiq), true), K('Juros de empréstimos pagos', brl(v.juros), 'neg')] : []), K('Lucro das vendas', brl(v.lucro), '', !v.juros), K('Vendas', String(v.vendas)), K('Faturamento (inclui trocas)', brl(v.fat)), K('Margem sobre o custo', pct(v.margem)),
    K('Ticket médio', brl(v.ticket)), K('Lucro médio por carro', brl(v.lucroMedio), sign(v.lucroMedio)), K('Dias médios para vender', v.diasMedio == null ? '—' : Math.round(v.diasMedio) + ' dias'), K('Deixou de ganhar (descontos)', brl(v.perdeu)),
    K('Capital em estoque', brl(v.capitalEstoque)), K('Lucro projetado do estoque', brl(v.projEstoque), sign(v.projEstoque)), K('A receber de clientes', brl(v.aReceber)), K('Atrasado', brl(v.atrasado), v.atrasado > 0 ? 'neg' : ''),
    K('Gastos no período', brl(v.gastos)), K('Vendas com prejuízo', String(v.prejuizo), v.prejuizo ? 'neg' : '')]);
  const sociosCols = [
    { label: 'Sócio', get: (r) => esc(r.nome) }, { label: 'Investido em estoque', r: true, get: (r) => brl(r.est) }, { label: 'Investido nos vendidos', r: true, get: (r) => brl(r.vend) },
    { label: 'Lucro líquido no período', r: true, get: (r) => val(r.luc) }, { label: 'Saldo a acertar', r: true, get: (r) => val(r.saldo) }];
  const rows = ['A', 'B'].map((c) => ({ nome: nm(c), est: soc[c].estoque.inv, vend: soc[c].vendidos.inv, luc: soc[c].vendidos.lucLiq, saldo: soc[c].saldo }));
  h += panel('Resumo por sócio', table(sociosCols, rows), null);
  h += panel('Lucro líquido por mês', legend([['sw-a', nm('A')], ['sw-b', nm('B')]]) + groupedChart(lm.rows, [{ k: 'liqA', cls: 'ba', label: nm('A') }, { k: 'liqB', cls: 'bb', label: nm('B') }], 'Lucro líquido por mês e por sócio'), null);
  return { html: `<div class="stack">${h}</div>` };
};

R.socios = (D) => {
  const p = per(), soc = Reports.porSocio(D, S.expenses, p.from, p.to, jurosDe(p)), est = Reports.estoque(D, S.settings);
  const A = soc.A, B = soc.B, sum = (f) => f(A) + f(B);
  const defs = [
    ['Investido em carros em estoque', (s) => s.estoque.inv, 'Entrada + gastos pagos pelo sócio nos carros ainda não vendidos (consignado: só os gastos)'],
    ['  Entrada paga', (s) => s.estoque.entrada], ['  Gastos pagos', (s) => s.estoque.gastos],
    ['Investido em carros vendidos (período)', (s) => s.vendidos.inv, 'Entrada + gastos dos carros vendidos no período'],
    ['Total investido', (s) => s.totalInvestido],
    ['Lucro das vendas (período)', (s) => s.vendidos.luc], ['Juros de empréstimos (metade de cada)', (s) => -s.vendidos.juros], ['Lucro líquido (período)', (s) => s.vendidos.lucLiq],
    ['Juros pagos do próprio bolso', (s) => s.vendidos.jurosPago, 'Volta para o sócio no acerto'], ['Retorno sobre o investido nos vendidos', (s) => s.roi, null, true],
    ['Dinheiro e carros recebidos nas vendas', (s) => s.vendidos.rec], ['Já entrou no caixa', (s) => s.vendidos.recHoje], ['Ainda a receber de clientes', (s) => s.vendidos.aReceber],
    ['Repasses a donos de carros consignados (quando tudo for pago)', (s) => s.vendidos.rep, 'O dinheiro da venda que não é nosso: vai para o dono do carro'], ['Já repassado a donos', (s) => s.vendidos.repHoje],
    ['Saldo a acertar com o outro sócio (quando tudo for recebido)', (s) => s.saldo], ['Saldo hoje (só o que já entrou)', (s) => s.saldoHoje],
    ['Gastos pagos no período', (s) => s.gastoPeriodo],
  ];
  const rows = defs.map(([l, f, , isPct]) => ({ l, a: f(A), b: f(B), t: isPct ? null : sum(f), isPct }));
  const fmt = (v, isPct) => (v == null ? '—' : isPct ? pct(v) : brl(v));
  const cols = [{ label: 'Indicador', get: (r) => esc(r.l.trim()) + (r.l.startsWith('  ') ? '' : '') }, { label: nm('A'), r: true, get: (r) => fmt(r.a, r.isPct) }, { label: nm('B'), r: true, get: (r) => fmt(r.b, r.isPct) }, { label: 'Total', r: true, get: (r) => fmt(r.t, r.isPct) }];
  let h = `<p class="mut small" style="margin:0">Vendas de ${esc(perText())}. O investido em estoque é a situação de hoje.</p>`;
  h += kpis([K(`Investido por ${nm('A')}`, brl(A.totalInvestido), '', true), K(`Investido por ${nm('B')}`, brl(B.totalInvestido), '', true), K(`Em estoque (${nm('A')})`, brl(A.estoque.inv)), K(`Em estoque (${nm('B')})`, brl(B.estoque.inv)),
    K(`Lucro líquido de ${nm('A')}`, brl(A.vendidos.lucLiq), sign(A.vendidos.lucLiq)), K(`Lucro líquido de ${nm('B')}`, brl(B.vendidos.lucLiq), sign(B.vendidos.lucLiq))]);
  h += panel('Por sócio', table(cols, rows), { name: 'socios', cols: [{ k: 'l', label: 'Indicador' }, { k: 'a', label: nm('A') }, { k: 'b', label: nm('B') }, { k: 't', label: 'Total' }], rows: rows.map((r) => ({ l: r.l.trim(), a: r.a, b: r.b, t: r.t })) });
  const carCols = [{ label: 'Carro', get: (r) => esc(r.car) }, { label: 'Dias', r: true, get: (r) => (r.dias == null ? '—' : r.dias) }, { label: `Investido por ${nm('A')}`, r: true, get: (r) => brl(r.invA) }, { label: `Investido por ${nm('B')}`, r: true, get: (r) => brl(r.invB) }, { label: 'Custo total', r: true, get: (r) => brl(r.custo) }];
  h += panel('Capital investido em cada carro do estoque', table(carCols, est.rows, { Carro: 'Total', [`Investido por ${nm('A')}`]: brl(est.total.A), [`Investido por ${nm('B')}`]: brl(est.total.B), 'Custo total': brl(est.total.custo) }),
    { name: 'capital-estoque', cols: [{ k: 'car', label: 'Carro' }, { k: 'dias', label: 'Dias' }, { k: 'invA', label: `Investido por ${nm('A')}` }, { k: 'invB', label: `Investido por ${nm('B')}` }, { k: 'custo', label: 'Custo total' }], rows: est.rows },
    'Vale antes mesmo de vender: é o que cada sócio já colocou em cada carro (entrada + gastos que pagou).');
  return { html: `<div class="stack">${h}</div>` };
};

R.lucro = (D) => {
  const p = per(), lm = Reports.lucroMensal(D, p.from, p.to, jurosDe(p));
  const cols = [
    { label: 'Mês', get: (r) => esc(mlabel(r.mes)) }, { label: 'Vendas', r: true, get: (r) => r.n }, { label: 'Faturamento', r: true, get: (r) => brl(r.fat) }, { label: 'Custo', r: true, get: (r) => brl(r.custo) },
    { label: 'Lucro dos carros', r: true, get: (r) => val(r.lucro) }, { label: 'Juros pagos', r: true, get: (r) => (r.juros ? val(-r.juros) : '—') }, { label: 'Lucro líquido', r: true, get: (r) => val(r.liq) },
    { label: `Líquido ${nm('A')}`, r: true, get: (r) => val(r.liqA) }, { label: `Líquido ${nm('B')}`, r: true, get: (r) => val(r.liqB) }, { label: 'Margem', r: true, get: (r) => pct(r.margem) }];
  const t = lm.total;
  const foot = { Mês: 'Total', Vendas: t.n, Faturamento: brl(t.fat), Custo: brl(t.custo), 'Lucro dos carros': brl(t.lucro), 'Juros pagos': brl(-t.juros), 'Lucro líquido': brl(t.liq), [`Líquido ${nm('A')}`]: brl(t.liqA), [`Líquido ${nm('B')}`]: brl(t.liqB), Margem: pct(t.margem) };
  const csvCols = [{ k: 'mes', label: 'Mês' }, { k: 'n', label: 'Vendas' }, { k: 'fat', label: 'Faturamento' }, { k: 'custo', label: 'Custo' }, { k: 'lucro', label: 'Lucro dos carros' }, { k: 'juros', label: 'Juros pagos' }, { k: 'liq', label: 'Lucro líquido' }, { k: 'liqA', label: `Líquido ${nm('A')}` }, { k: 'liqB', label: `Líquido ${nm('B')}` }, { k: 'margem', label: 'Margem' }];
  let h = `<p class="mut small" style="margin:0">Lucro de cada carro vendido, no mês da data da venda (regime de competência) e dividido entre os sócios conforme a divisão de cada carro. O que de fato entrou no caixa está em "Caixa e recebíveis". Juros de empréstimos entram no mês em que foram pagos e saem do lucro, metade de cada sócio.</p>`;
  h += panel('Lucro líquido por mês e por sócio', legend([['sw-a', nm('A')], ['sw-b', nm('B')]]) + groupedChart(lm.rows, [{ k: 'liqA', cls: 'ba', label: nm('A') }, { k: 'liqB', cls: 'bb', label: nm('B') }], 'Lucro líquido por mês e por sócio'));
  h += panel('Tabela mensal', table(cols, lm.rows, foot), { name: 'lucro-mensal', cols: csvCols, rows: lm.rows.concat([lm.total]) });
  return { html: `<div class="stack">${h}</div>` };
};

R.caixa = (D) => {
  const p = per(), rec = Reports.recebiveis(D, today()), cx = Reports.caixaMensal(D, today(), p.from, p.to);
  let h = `<p class="mut small" style="margin:0">Caixa: dinheiro que entrou por mês (recebido) e o que deve entrar (previsto, pela data de vencimento) em ${esc(perText())}. Os recebíveis em aberto são a situação de hoje, qualquer que seja o período.</p>`;
  h += kpis([K('A receber de clientes', brl(rec.total + rec.semProgramar), '', true), K('Atrasado', brl(rec.atrasado), rec.atrasado > 0 ? 'neg' : ''), K(`A receber — ${nm('A')}`, brl(rec.A)), K(`A receber — ${nm('B')}`, brl(rec.B)),
    K('Sem programar', brl(rec.semProgramar), rec.semProgramar > 0 ? 'neg' : ''), K('Recebido no período', brl(cx.total.recebido))]);
  h += panel('Recebido x previsto por mês', legend([['sw-r', 'Recebido'], ['sw-p', 'Previsto (a receber)']]) + groupedChart(cx.rows, [{ k: 'recebido', cls: 'ba', label: 'Recebido' }, { k: 'previsto', cls: 'bd', label: 'Previsto' }], 'Recebido e previsto por mês'));
  const cols = [{ label: 'Mês', get: (r) => esc(mlabel(r.mes)) }, { label: 'Recebido', r: true, get: (r) => brl(r.recebido) }, { label: nm('A'), r: true, get: (r) => brl(r.recA) }, { label: nm('B'), r: true, get: (r) => brl(r.recB) },
    { label: 'Previsto', r: true, get: (r) => brl(r.previsto) }, { label: `Prev. ${nm('A')}`, r: true, get: (r) => brl(r.prevA) }, { label: `Prev. ${nm('B')}`, r: true, get: (r) => brl(r.prevB) }, { label: 'Atrasado', r: true, get: (r) => (r.atrasado > 0 ? val(-r.atrasado, 'neg').replace('-', '') : '—') }];
  const t = cx.total;
  h += panel('Caixa por mês e por sócio', table(cols, cx.rows, { Mês: 'Total', Recebido: brl(t.recebido), [nm('A')]: brl(t.recA), [nm('B')]: brl(t.recB), Previsto: brl(t.previsto), [`Prev. ${nm('A')}`]: brl(t.prevA), [`Prev. ${nm('B')}`]: brl(t.prevB), Atrasado: brl(t.atrasado) }),
    { name: 'caixa-mensal', cols: [{ k: 'mes', label: 'Mês' }, { k: 'recebido', label: 'Recebido' }, { k: 'recA', label: nm('A') }, { k: 'recB', label: nm('B') }, { k: 'previsto', label: 'Previsto' }, { k: 'prevA', label: `Prev. ${nm('A')}` }, { k: 'prevB', label: `Prev. ${nm('B')}` }, { k: 'atrasado', label: 'Atrasado' }], rows: cx.rows });
  const fc = [{ label: 'Vencimento', get: (r) => esc(r.nome) }, { label: 'Parcelas', r: true, get: (r) => r.n }, { label: 'Valor', r: true, get: (r) => brl(r.valor) }, { label: nm('A'), r: true, get: (r) => brl(r.A) }, { label: nm('B'), r: true, get: (r) => brl(r.B) }];
  h += panel('A receber por faixa de vencimento', table(fc, rec.faixas, { Vencimento: 'Total', Parcelas: rec.items.length, Valor: brl(rec.total), [nm('A')]: brl(rec.A), [nm('B')]: brl(rec.B) }),
    { name: 'recebiveis-faixas', cols: [{ k: 'nome', label: 'Vencimento' }, { k: 'n', label: 'Parcelas' }, { k: 'valor', label: 'Valor' }, { k: 'A', label: nm('A') }, { k: 'B', label: nm('B') }], rows: rec.faixas });
  const cc = [{ label: 'Carro', get: (r) => `<b>${esc(r.car)}</b><div class="mut small">${esc(r.comprador)}</div>` }, { label: 'Forma', get: (r) => esc(r.forma || '') }, { label: 'Dinheiro da venda', r: true, get: (r) => brl(r.cash) },
    { label: 'Recebido', r: true, get: (r) => brl(r.recebido) }, { label: 'A receber', r: true, get: (r) => brl(r.aReceber) }, { label: 'Atrasado', r: true, get: (r) => (r.atrasado > 0 ? `<span class="neg">${brl(r.atrasado)}</span>` : '—') },
    { label: 'Próx. venc.', get: (r) => (r.prox ? dmy(r.prox) : '—') }, { label: 'Parcelas', r: true, get: (r) => r.nParc || '—' }];
  h += panel('Vendas com valor em aberto', table(cc, rec.porCarro, null, 'Nenhuma venda com valor a receber.'), { name: 'vendas-em-aberto', cols: [{ k: 'car', label: 'Carro' }, { k: 'comprador', label: 'Comprador' }, { k: 'forma', label: 'Forma' }, { k: 'cash', label: 'Dinheiro da venda' }, { k: 'recebido', label: 'Recebido' }, { k: 'aReceber', label: 'A receber' }, { k: 'atrasado', label: 'Atrasado' }, { k: 'prox', label: 'Próx. venc.', date: true }], rows: rec.porCarro });
  const pc = [{ label: 'Vencimento', get: (r) => dmy(r.due) }, { label: 'Carro', get: (r) => esc(r.car) }, { label: 'Comprador', get: (r) => esc(r.comprador) }, { label: 'Parcela', get: (r) => esc(r.label) }, { label: 'Valor', r: true, get: (r) => brl(r.valor) },
    { label: nm('A'), r: true, get: (r) => brl(r.A) }, { label: nm('B'), r: true, get: (r) => brl(r.B) }, { label: 'Situação', get: (r) => (r.atraso ? `<span class="pill late">${r.atraso} dia${r.atraso === 1 ? '' : 's'} de atraso</span>` : r.dias === 0 ? '<span class="pill soon">Vence hoje</span>' : `em ${r.dias} dias`) }];
  h += panel('Agenda de recebimentos (parcelas em aberto)', table(pc, rec.items, null, 'Nenhuma parcela em aberto.'), { name: 'agenda-recebimentos', cols: [{ k: 'due', label: 'Vencimento', date: true }, { k: 'car', label: 'Carro' }, { k: 'comprador', label: 'Comprador' }, { k: 'label', label: 'Parcela' }, { k: 'valor', label: 'Valor' }, { k: 'A', label: nm('A') }, { k: 'B', label: nm('B') }, { k: 'atraso', label: 'Dias de atraso' }], rows: rec.items });
  return { html: `<div class="stack">${h}</div>` };
};

R.vendas = (D) => {
  const p = per(), v = Reports.vendasPorForma(D, p.from, p.to);
  const cols = [{ label: 'Forma de pagamento', get: (r) => `<b>${esc(r.forma)}</b>` }, { label: 'Vendas', r: true, get: (r) => r.n }, { label: 'Participação', r: true, get: (r) => pct(r.share) }, { label: 'Faturamento', r: true, get: (r) => brl(r.fat) },
    { label: 'Ticket médio', r: true, get: (r) => brl(r.ticket) }, { label: 'Lucro', r: true, get: (r) => val(r.lucro) }, { label: 'Margem', r: true, get: (r) => pct(r.margem) }, { label: 'Prazo médio', r: true, get: (r) => (r.prazoMedio > 0 ? Math.round(r.prazoMedio) + ' dias' : 'na hora') }, { label: 'Parcelas (média)', r: true, get: (r) => (r.parcelasMedia > 0 ? r.parcelasMedia.toFixed(1).replace('.', ',') : '—') }];
  let h = `<p class="mut small" style="margin:0">Vendas de ${esc(perText())}. "Troca" = recebeu carro de cliente como parte do pagamento; o restante em dinheiro aparece como à vista, a prazo ou parcelado.</p>`;
  h += kpis([K('Vendas', String(v.total.n), '', true), K('Faturamento', brl(v.total.fat)), K('Vendas com carro na troca', `${v.trocas.n} (${pct(v.trocas.share)})`), K('Valor recebido em carros de troca', brl(v.trocas.valor))]);
  h += panel('Vendas por forma de pagamento', table(cols, v.rows, { 'Forma de pagamento': 'Total', Vendas: v.total.n, Faturamento: brl(v.total.fat), Lucro: brl(v.total.lucro) }),
    { name: 'vendas-por-forma', cols: [{ k: 'forma', label: 'Forma de pagamento' }, { k: 'n', label: 'Vendas' }, { k: 'share', label: 'Participação' }, { k: 'fat', label: 'Faturamento' }, { k: 'ticket', label: 'Ticket médio' }, { k: 'lucro', label: 'Lucro' }, { k: 'margem', label: 'Margem' }, { k: 'prazoMedio', label: 'Prazo médio (dias)' }, { k: 'parcelasMedia', label: 'Parcelas (média)' }], rows: v.rows });
  return { html: `<div class="stack">${h}</div>` };
};

R.estoque = (D) => {
  const e = Reports.estoque(D, S.settings);
  const fc = [{ label: 'Tempo em estoque', get: (r) => esc(r.nome) }, { label: 'Carros', r: true, get: (r) => r.n }, { label: nm('A'), r: true, get: (r) => brl(r.A) }, { label: nm('B'), r: true, get: (r) => brl(r.B) }, { label: 'Capital parado', r: true, get: (r) => brl(r.custo) }];
  let h = kpis([K('Carros em estoque', String(e.total.n), '', true), K('Capital parado', brl(e.total.custo)), K(`Investido por ${nm('A')}`, brl(e.total.A)), K(`Investido por ${nm('B')}`, brl(e.total.B)), K('Gastos previstos pendentes', brl(e.total.prev)), K('Lucro projetado', brl(e.total.proj), sign(e.total.proj))]);
  h += panel('Envelhecimento do estoque', table(fc, e.faixas, { 'Tempo em estoque': 'Total', Carros: e.total.n, [nm('A')]: brl(e.total.A), [nm('B')]: brl(e.total.B), 'Capital parado': brl(e.total.custo) }),
    { name: 'estoque-idade', cols: [{ k: 'nome', label: 'Tempo em estoque' }, { k: 'n', label: 'Carros' }, { k: 'A', label: nm('A') }, { k: 'B', label: nm('B') }, { k: 'custo', label: 'Capital parado' }], rows: e.faixas });
  const cc = [{ label: 'Carro', get: (r) => `<b>${esc(r.car)}</b>${r.parado ? ' <span class="pill late">Parado</span>' : ''}<div class="mut small">${esc(r.placa)}</div>` }, { label: 'Status', get: (r) => esc(r.status) }, { label: 'Onde está', get: (r) => esc(r.loc || '—') }, { label: 'Dias', r: true, get: (r) => (r.dias == null ? '—' : r.dias) },
    { label: `Invest. ${nm('A')}`, r: true, get: (r) => brl(r.invA) }, { label: `Invest. ${nm('B')}`, r: true, get: (r) => brl(r.invB) }, { label: 'Custo', r: true, get: (r) => brl(r.custo) }, { label: 'Previstos', r: true, get: (r) => brl(r.prev) },
    { label: 'Preço mínimo', r: true, get: (r) => brl(r.pmin) }, { label: 'Anúncio', r: true, get: (r) => (r.anun ? brl(r.anun) : '—') }, { label: 'Lucro projetado', r: true, get: (r) => val(r.proj) }];
  h += panel('Carros em estoque', table(cc, e.rows), { name: 'estoque', cols: [{ k: 'car', label: 'Carro' }, { k: 'placa', label: 'Placa' }, { k: 'status', label: 'Status' }, { k: 'loc', label: 'Onde está' }, { k: 'dias', label: 'Dias' }, { k: 'invA', label: `Investido ${nm('A')}` }, { k: 'invB', label: `Investido ${nm('B')}` }, { k: 'custo', label: 'Custo' }, { k: 'prev', label: 'Previstos' }, { k: 'pmin', label: 'Preço mínimo' }, { k: 'anun', label: 'Anúncio' }, { k: 'proj', label: 'Lucro projetado' }], rows: e.rows });
  return { html: `<div class="stack">${h}</div>` };
};

R.consig = (D) => {
  const c = Reports.consignados(D, today()), t = c.total;
  let h = `<p class="mut small" style="margin:0">Carros de terceiros que a gente vende. O dono recebe o repasse combinado; os gastos do carro saem do valor da venda e o que sobra é a comissão, dividida entre os sócios conforme a divisão do carro.</p>`;
  h += kpis([K('Carros consignados', String(t.n), '', true), K('Comissão (vendidos)', brl(t.comissao), sign(t.comissao)), K(`Comissão de ${nm('A')}`, brl(t.comA), sign(t.comA)), K(`Comissão de ${nm('B')}`, brl(t.comB), sign(t.comB)),
    K('Repasse combinado (vendidos)', brl(t.repasse)), K('Ainda a repassar', brl(t.falta), t.falta > 0.004 ? 'neg' : '')]);
  const cols = [
    { label: 'Carro', get: (r) => `<b>${esc(r.car)}</b><div class="mut small">${esc(r.placa)} · dono: ${esc(r.dono)}</div>` },
    { label: 'Status', get: (r) => esc(r.status) },
    { label: 'Repasse', r: true, get: (r) => brl(r.repasse) },
    { label: 'Repassado', r: true, get: (r) => brl(r.repassado) },
    { label: 'Falta', r: true, get: (r) => (r.vendido ? (r.falta > 0.004 ? `<span class="neg">${brl(r.falta)}</span>` : '—') : '<span class="mut">após vender</span>') },
    { label: 'Venda', r: true, get: (r) => (r.vendido ? brl(r.vvenda) : (r.anun ? `<span class="mut">anúncio ${brl(r.anun)}</span>` : '—')) },
    { label: 'Gastos', r: true, get: (r) => brl(r.gastos) },
    { label: 'Comissão', r: true, get: (r) => (r.vendido ? val(r.comissao) : (r.proj != null ? `<span class="mut">proj. ${brl(r.proj)}</span>` : '—')) },
  ];
  const foot = { Carro: 'Total (vendidos)', Repasse: brl(t.repasse), Repassado: brl(t.repassado), Falta: brl(t.falta), Gastos: brl(t.gastos), Comissão: brl(t.comissao) };
  h += panel('Carros consignados', table(cols, c.rows, c.rows.length ? foot : null, 'Nenhum carro consignado. Ao cadastrar um carro, preencha "Dono do carro" para marcá-lo como consignado.'),
    { name: 'consignados', cols: [{ k: 'car', label: 'Carro' }, { k: 'placa', label: 'Placa' }, { k: 'dono', label: 'Dono' }, { k: 'status', label: 'Status' }, { k: 'repasse', label: 'Repasse' }, { k: 'repassado', label: 'Repassado' }, { k: 'falta', label: 'Falta repassar' }, { k: 'vvenda', label: 'Venda' }, { k: 'gastos', label: 'Gastos' }, { k: 'comissao', label: 'Comissão' }, { k: 'comA', label: `Comissão ${nm('A')}` }, { k: 'comB', label: `Comissão ${nm('B')}` }], rows: c.rows });
  return { html: `<div class="stack">${h}</div>` };
};

R.gastos = (D) => {
  const p = per(), g = Reports.gastos(D, S.expenses, p.from, p.to);
  let h = `<p class="mut small" style="margin:0">Gastos lançados em ${esc(perText())}.</p>`;
  h += kpis([K('Total gasto', brl(g.total), '', true), K(`Pago por ${nm('A')}`, brl(g.A)), K(`Pago por ${nm('B')}`, brl(g.B)), K('Lançamentos', String(g.n)), K('Média por carro', brl(g.porCarro))]);
  const cc = [{ label: 'Categoria', get: (r) => esc(r.cat) }, { label: 'Lançamentos', r: true, get: (r) => r.n }, { label: 'Total', r: true, get: (r) => brl(r.total) }, { label: '%', r: true, get: (r) => pct(r.share) }, { label: nm('A'), r: true, get: (r) => brl(r.A) }, { label: nm('B'), r: true, get: (r) => brl(r.B) }];
  h += panel('Por categoria', table(cc, g.cats, { Categoria: 'Total', Lançamentos: g.n, Total: brl(g.total), [nm('A')]: brl(g.A), [nm('B')]: brl(g.B) }), { name: 'gastos-categoria', cols: [{ k: 'cat', label: 'Categoria' }, { k: 'n', label: 'Lançamentos' }, { k: 'total', label: 'Total' }, { k: 'share', label: '%' }, { k: 'A', label: nm('A') }, { k: 'B', label: nm('B') }], rows: g.cats });
  const mc = [{ label: 'Mês', get: (r) => esc(mlabel(r.mes)) }, { label: 'Total', r: true, get: (r) => brl(r.total) }, { label: nm('A'), r: true, get: (r) => brl(r.A) }, { label: nm('B'), r: true, get: (r) => brl(r.B) }];
  h += panel('Por mês', legend([['sw-a', nm('A')], ['sw-b', nm('B')]]) + groupedChart(g.meses, [{ k: 'A', cls: 'ba', label: nm('A') }, { k: 'B', cls: 'bb', label: nm('B') }], 'Gastos por mês e por sócio') + table(mc, g.meses),
    { name: 'gastos-mes', cols: [{ k: 'mes', label: 'Mês' }, { k: 'total', label: 'Total' }, { k: 'A', label: nm('A') }, { k: 'B', label: nm('B') }], rows: g.meses });
  const vc = [{ label: 'Carro', get: (r) => esc(r.car) }, { label: 'Lançamentos', r: true, get: (r) => r.n }, { label: 'Total gasto', r: true, get: (r) => brl(r.total) }];
  h += panel('Carros que mais gastaram', table(vc, g.cars.slice(0, 15)), { name: 'gastos-carros', cols: [{ k: 'car', label: 'Carro' }, { k: 'n', label: 'Lançamentos' }, { k: 'total', label: 'Total gasto' }], rows: g.cars });
  return { html: `<div class="stack">${h}</div>` };
};

R.ranking = (D) => {
  const p = per(), r = Reports.ranking(D, p.from, p.to);
  const cols = [{ label: 'Carro', get: (x) => `<b>${esc(x.car)}</b><div class="mut small">${esc(x.placa)}${x.comprador ? ' · ' + esc(x.comprador) : ''}</div>` }, { label: 'Venda em', get: (x) => dmy(x.dvenda) }, { label: 'Forma', get: (x) => esc(x.forma || '') },
    { label: 'Dias', r: true, get: (x) => (x.dias == null ? '—' : x.dias) }, { label: 'Custo', r: true, get: (x) => brl(x.custo) }, { label: 'Venda', r: true, get: (x) => brl(x.vvenda) }, { label: 'Lucro', r: true, get: (x) => val(x.lucro) },
    { label: 'Margem', r: true, get: (x) => pct(x.margem) }, { label: `Lucro ${nm('A')}`, r: true, get: (x) => val(x.lucA) }, { label: `Lucro ${nm('B')}`, r: true, get: (x) => val(x.lucB) }, { label: 'Lucro/dia', r: true, get: (x) => (x.lucroDia == null ? '—' : brl(x.lucroDia)) }, { label: 'Deixou de ganhar', r: true, get: (x) => brl(x.perdeu) }];
  let h = `<p class="mut small" style="margin:0">Carros vendidos em ${esc(perText())}, do mais lucrativo para o menos.</p>`;
  if (r.melhor) h += kpis([K('Melhor venda', `${esc(r.melhor.car)}<div class="small">${brl(r.melhor.lucro)}</div>`, 'pos'), K('Pior venda', `${esc(r.pior.car)}<div class="small">${brl(r.pior.lucro)}</div>`, sign(r.pior.lucro)), K('Carros vendidos', String(r.rows.length))]);
  h += panel('Desempenho por carro', table(cols, r.rows), { name: 'carros-vendidos', cols: [{ k: 'car', label: 'Carro' }, { k: 'placa', label: 'Placa' }, { k: 'comprador', label: 'Comprador' }, { k: 'dvenda', label: 'Venda em', date: true }, { k: 'forma', label: 'Forma' }, { k: 'dias', label: 'Dias' }, { k: 'custo', label: 'Custo' }, { k: 'vvenda', label: 'Venda' }, { k: 'lucro', label: 'Lucro' }, { k: 'margem', label: 'Margem' }, { k: 'lucA', label: `Lucro ${nm('A')}` }, { k: 'lucB', label: `Lucro ${nm('B')}` }, { k: 'lucroDia', label: 'Lucro por dia' }, { k: 'perdeu', label: 'Deixou de ganhar' }], rows: r.rows });
  return { html: `<div class="stack">${h}</div>` };
};

/* ---------- tela ---------- */
views.gerencial = {
  mount(el) {
    el.innerHTML = `<div class="stack"><div class="rep-h no-print"><div class="chips" id="repchips"></div><div class="per"><label class="mut small" for="per">Período</label><select id="per">${PERIODOS.map(([k, l]) => `<option value="${k}"${S.ui.per === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <span id="custom" ${S.ui.per === 'custom' ? '' : 'hidden'}><input type="date" id="pfrom" value="${esc(S.ui.from)}" aria-label="De"> <input type="date" id="pto" value="${esc(S.ui.to)}" aria-label="Até"></span>
      <button class="btn sm" data-act="print">Imprimir / PDF</button></div></div><div id="rep"></div></div>`;
    $('#per').onchange = function () { S.ui.per = this.value; $('#custom').hidden = this.value !== 'custom'; views.gerencial.paint(); };
    $('#pfrom').onchange = function () { S.ui.from = this.value; views.gerencial.paint(); };
    $('#pto').onchange = function () { S.ui.to = this.value; views.gerencial.paint(); };
    this.paint();
  },
  paint() {
    const box = $('#rep');
    if (!box) return;
    $('#repchips').innerHTML = REPORTS.map(([k, l]) => `<button class="chip" data-rep="${k}" aria-pressed="${S.ui.rep === k}">${l}</button>`).join('');
    if (!Object.keys(S.D).length) { box.innerHTML = '<div class="empty"><h3>Sem dados ainda</h3><p class="mut" style="margin:0">Cadastre carros, gastos e vendas para ver os relatórios.</p></div>'; return; }
    for (const k of Object.keys(csvReg)) delete csvReg[k];
    csvSeq = 0;
    const out = (R[S.ui.rep] || R.geral)(S.D);
    box.innerHTML = out.html;
  },
};

export function exportCsv(id) {
  const c = csvReg[id];
  if (!c) return;
  const stamp = today();
  downloadFile(`${c.name}-${stamp}.csv`, Reports.toCsv(c.cols, c.rows));
}
