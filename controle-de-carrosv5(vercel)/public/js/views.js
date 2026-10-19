// Telas. Cada uma tem mount(el) (monta o esqueleto) e paint() (redesenha com os dados atuais).
import { $, esc, brl, pct, dmy, today, stamp, sign, initials } from './util.js';
import { S, LISTS, names, itemOf, carName, liveCars, locClass } from './state.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const KIND_NAME = { car: 'carro', expense: 'gasto', planned: 'gasto previsto', receipt: 'recebimento', payment: 'pagamento', repasse: 'repasse', settings: '', user: 'usuário' };
const ROLE_NAME = { admin: 'Administrador', member: 'Membro', viewer: 'Só leitura' };
const nm = (code) => names()[code] || '—';
const derived = () => Object.values(S.D);

function plate(p) {
  return p ? `<span class="plate"><span class="t">BRASIL</span><span class="n">${esc(String(p).toUpperCase())}</span></span>`
    : '<span class="plate none"><span class="n">SEM PLACA</span></span>';
}
const locPill = (c) => (c.loc ? `<span class="pill loc ${locClass(c.loc)}">${esc(c.loc)}</span>` : '<span class="pill">Local não informado</span>');
const stPill = (s) => `<span class="pill st-${esc(String(s || 'Em').split(' ')[0])}">${esc(s || 'Em estoque')}</span>`;
function empty(title, text, btn, act) {
  return `<div class="empty"><h3>${esc(title)}</h3><p class="mut" style="margin:0;max-width:46ch">${esc(text)}</p>${btn && S.canWrite ? `<button class="btn pri" data-act="${act}">${esc(btn)}</button>` : ''}</div>`;
}
const carOptions = (sel) => '<option value="">Todos os carros</option>' + liveCars().map((c) => `<option value="${c.id}"${String(c.id) === String(sel) ? ' selected' : ''}>${esc(c.name)}</option>`).join('');

/** Compara compra e anúncio com a FIPE ("compra a 78% da FIPE"). */
function fipeNote(c) {
  const f = Calc.num(c.fipe);
  if (!f) return '';
  const bits = [];
  const ent = Calc.num(c.entT);
  if (ent) bits.push(`compra a ${Math.round(ent / f * 100)}% da FIPE`);
  const an = Calc.num(c.anun);
  if (an) bits.push(`anúncio ${an >= f ? Math.round((an / f - 1) * 100) + '% acima' : Math.round((1 - an / f) * 100) + '% abaixo'}`);
  return bits.length ? `<span class="mut">${esc(bits.join(' · '))}</span>` : '';
}

function carCard(d) {
  const c = d.c, open = S.ui.open[c.id];
  const locInfo = `<div class="locrow">${stPill(c.status)}${locPill(c)}${c.locdet ? `<span>${esc(c.locdet)}</span>` : ''}${d.diasLoc != null ? `<span class="mut">há ${d.diasLoc} dia${d.diasLoc === 1 ? '' : 's'}</span>` : ''}${d.atrasoLoc ? '<span class="pill late">Saída atrasada</span>' : d.saiLogo ? '<span class="pill soon">Sai em até 2 dias</span>' : ''}</div>`;
  const n2 = d.vendido
    ? `<div><dt>Venda</dt><dd>${brl(Calc.num(c.vvenda))}</dd></div><div><dt>${d.consig ? 'Comissão' : 'Lucro'}</dt><dd class="${sign(d.lucro)}">${brl(d.lucro)}</dd></div>`
    : `<div><dt>Anúncio</dt><dd>${brl(Calc.num(c.anun))}</dd></div><div><dt>${d.consig ? 'Comissão projetada' : 'Lucro projetado'}</dt><dd class="${sign(d.proj)}">${brl(d.proj)}</dd></div>`;
  const foot = d.vendido && d.lucro != null
    ? `${d.consig ? 'Comissão' : 'Lucro'}: ${nm('A')} ${brl(d.lucA)} · ${nm('B')} ${brl(d.lucB)}`
    : `Divisão: ${nm('A')} ${Math.round(d.pA * 100)}% · ${nm('B')} ${Math.round((1 - d.pA) * 100)}%`;
  let h = `<article class="card cs-${esc(String(c.status || 'Em').split(' ')[0])}" data-id="${c.id}"><div class="card-h">${plate(c.placa)}<div class="ct"><h3>${esc(c.name)}</h3><p class="mut">${[c.ano, c.cor, c.dcompra ? 'comprado em ' + dmy(c.dcompra) : null, d.dias != null ? d.dias + ' dias' : null].filter(Boolean).map(esc).join(' · ')}</p></div></div>${locInfo}` +
    `<dl class="nums"><div><dt>Custo total</dt><dd>${brl(d.custo)}</dd></div>${n2}</dl>` +
    (c.fipe ? `<div class="fipe"><span>FIPE <b class="num">${brl(Calc.num(c.fipe))}</b></span>${fipeNote(c)}</div>` : '') +
    (d.entregue ? `<div class="consig"><span class="pill dono">Carro de troca · fica com ${esc(c.dono)}</span><span class="mut">Não conta como nosso estoque; o valor abate o repasse.</span></div>` : d.consig ? `<div class="consig"><span class="pill dono">Consignado · ${esc(c.dono)}</span><span>Repasse <b class="num">${brl(d.repasse)}</b></span>${d.emEspecie > 0 ? `<span>Já em carro <b class="num">${brl(d.emEspecie)}</b></span>` : ''}${d.repFalta > 0.004 ? `<span class="pill soon">Falta repassar ${brl(d.repFalta)}</span>` : '<span class="pill ok">Repassado</span>'}<button class="btn sm" data-act="repasses" data-id="${c.id}">Repasses</button></div>` : '') +
    `<div class="mut small">Investido: ${esc(nm('A'))} <b class="num">${brl(d.invA)}</b> · ${esc(nm('B'))} <b class="num">${brl(d.invB)}</b></div>` +
    (d.vendido && d.cash != null ? `<div class="locrow"><span class="pill">${esc(d.forma || '')}</span>${d.aReceber > 0.004 ? `<span class="${d.atrasado > 0.004 ? 'pill late' : 'pill soon'}">A receber ${brl(d.aReceber)}</span>` : '<span class="pill ok">Quitado</span>'}</div>` : '') +
    `<div class="card-f"><span class="sp mut">${esc(foot)}</span><button class="btn sm" data-act="toggle" data-id="${c.id}">${open ? 'Fechar' : 'Detalhes'}</button>${d.vendido ? `<button class="btn sm" data-act="receipts" data-id="${c.id}">Recebimentos</button>` : ''}${S.canWrite ? `<button class="btn sm" data-act="edit-car" data-id="${c.id}">Editar</button>` : ''}</div>`;
  if (open) {
    const r = (k, v, cls) => `<span class="k">${esc(k)}</span><span class="v ${cls || ''}">${v}</span>`;
    h += `<div class="det"><h4>Investido por sócio</h4>${r(nm('A'), brl(d.invA))}${r(nm('B'), brl(d.invB))}<h4>Custos</h4>${d.consig ? r('Repasse ao dono (' + (c.dono || '') + ')', brl(d.repasse)) + r('Já repassado', brl(d.repPago)) + (d.emEspecie > 0 ? r('Pago em carro (troca)', brl(d.emEspecie)) : '') + r('Falta repassar', brl(d.repFalta)) : r('Entrada ' + nm('A'), brl(d.entA)) + r('Entrada ' + nm('B'), brl(d.entB))}${r('Gastos de ' + nm('A'), brl(d.gastA))}${r('Gastos de ' + nm('B'), brl(d.gastB))}${r('Previstos pendentes', brl(d.prev))}${r('Preço mínimo (zero a zero)', brl(d.pmin))}${r('Preço para a meta de lucro', brl(d.pmeta))}`;
    if (c.fipe) h += '<h4>FIPE</h4>' + r('Valor FIPE', brl(Calc.num(c.fipe))) + (c.fipeRef ? r('Referência', esc(c.fipeRef)) : '');
    if (c.origemId) h += '<h4>Origem</h4>' + r('Veio da troca do', esc(carName(c.origemId)));
    if (d.vendido) {
      h += '<h4>Venda</h4>' + r('Data', dmy(c.dvenda)) + r('Comprador', esc(c.comprador || '—'));
      if (d.troca > 0) h += r('Carro recebido na troca', esc(d.trocaCars.join(', ')) + ' · ' + brl(d.troca));
      h += r('Dinheiro recebido', brl(d.cash)) + r('Dinheiro de ' + nm('A'), brl(d.recA)) + r('Dinheiro de ' + nm('B'), brl(d.recB)) + r('Margem sobre o custo', pct(d.margem)) + r('Deixou de ganhar', brl(d.perdeu)) + r('Forma de pagamento', esc(d.forma || '—')) + r('Já recebido', brl(d.recebido)) + r('A receber', brl(d.aReceber));
    } else if (d.troca > 0) h += '<h4>Troca</h4>' + r('Carro(s) recebido(s)', esc(d.trocaCars.join(', ')));
    h += '</div>';
    if (S.canWrite) h += `<div class="card-f"><span class="sp"></span><button class="btn sm danger" data-act="del-car" data-id="${c.id}">Excluir</button></div>`;
  }
  return h + '</article>';
}

const compact = (v) => { const a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1000 ? (a / 1000).toFixed(1).replace('.', ',') + ' mil' : String(Math.round(a))); };
function chart(months) {
  const W = 640, H = 230, L = 58, T = 16, B = 28, w = W - L - 8, h = H - T - B;
  const vals = months.map((m) => m.luc);
  let hi = Math.max(0, ...vals);
  const lo = Math.min(0, ...vals);
  if (hi === lo) hi = 1;
  const y = (v) => T + (hi - v) / (hi - lo) * h, bw = w / 12;
  let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lucro por mês de venda">`;
  [hi, 0, lo].filter((v, i, a) => a.indexOf(v) === i).forEach((v) => { g += `<line x1="${L}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${compact(v)}</text>`; });
  months.forEach((m, i) => {
    const x = L + i * bw + bw * 0.18, bh = Math.abs(y(m.luc) - y(0));
    if (m.luc !== 0) g += `<rect class="bar${m.luc < 0 ? ' neg' : ''}" x="${x}" y="${Math.min(y(m.luc), y(0))}" width="${bw * 0.64}" height="${Math.max(bh, 1)}" rx="2"/><text x="${x + bw * 0.32}" y="${m.luc >= 0 ? y(m.luc) - 4 : y(m.luc) + 12}" text-anchor="middle">${compact(m.luc)}</text>`;
    g += `<text x="${x + bw * 0.32}" y="${H - 9}" text-anchor="middle">${MESES[i]}</text>`;
  });
  return g + '</svg>';
}

export const views = {};

views.resumo = {
  mount(el) { this.paint(el); },
  paint(el) {
    el = el || $('#view');
    const s = Calc.summary(S.D, S.expenses, S.planned, S.settings, today(), S.year);
    if (!s.total) {
      el.innerHTML = empty('Nenhum carro ainda', 'Cadastre o primeiro carro para ver lucro, dinheiro parado e o acerto entre vocês dois.', 'Cadastrar primeiro carro', 'new-car') +
        (S.canWrite ? '<div class="empty" style="border-style:solid"><p class="mut" style="margin:0">Quer testar antes? Carregue dados de exemplo e remova depois em Ajustes.</p><button class="btn" data-act="examples">Carregar exemplos</button></div>' : '');
      return;
    }
    const al = [];
    if (s.parados) al.push(['carros', `${s.parados} ${s.parados === 1 ? 'carro parado' : 'carros parados'} há mais de ${S.settings.alerta} dias`]);
    if (s.saidaVencida) al.push(['onde', `${s.saidaVencida} ${s.saidaVencida === 1 ? 'carro com saída do local atrasada' : 'carros com saída do local atrasada'}`]);
    if (s.parcAtras) al.push(['vendas', `${s.parcAtras} ${s.parcAtras === 1 ? 'parcela de venda atrasada' : 'parcelas de venda atrasadas'} (${brl(s.atrasado)})`]);
    if (s.repFalta > 0.004) al.push(['carros', `Falta repassar ${brl(s.repFalta)} a donos de carros consignados`]);
    if (s.prevAtrasados) al.push(['previstos', `${s.prevAtrasados} ${s.prevAtrasados === 1 ? 'gasto previsto atrasado' : 'gastos previstos atrasados'}`]);
    let h = `<div class="alerts">${al.length ? al.map((a) => `<button class="alert" data-go="${a[0]}">${esc(a[1])}</button>`).join('') : '<div class="alert ok">Nenhum alerta no momento.</div>'}</div>`;
    const K = (t, v, cls, hero) => `<div class="kpi${hero ? ' hero' : ''}"><dt>${esc(t)}</dt><dd class="${cls || ''}">${v}</dd></div>`;
    h += '<dl class="grid kpis" style="margin:0">' + K('Lucro realizado', brl(s.lucro), '', true) + K('Em estoque / reservados', `${s.estoque} / ${s.reservados}`) + K('Vendidos', String(s.vendidos)) +
      K('Dinheiro parado em estoque', brl(s.parado)) + K('Gastos previstos pendentes', brl(s.prevPend)) + K('Lucro projetado do estoque', brl(s.proj), sign(s.proj)) +
      K('Faturamento (inclui trocas)', brl(s.fatur)) + K('Margem média', pct(s.margem)) + K('Lucro médio por carro', brl(s.lucroMedio), sign(s.lucroMedio)) +
      K('Deixou de ganhar (descontos)', brl(s.perdeu)) + K('Dias médios para vender', s.diasMedio == null ? '—' : Math.round(s.diasMedio) + ' dias') + K('Recebido em carro de troca', brl(s.trocaTot)) +
      K('A receber de clientes', brl(s.aReceber)) + K('Parcelas atrasadas', brl(s.atrasado), s.atrasado > 0 ? 'neg' : '') + (s.consigEstoque || s.repFalta > 0.004 ? K('A repassar a donos', brl(s.repFalta), s.repFalta > 0.004 ? 'neg' : '') : '') + '</dl>';
    const soc = Reports.porSocio(S.D, S.expenses);
    h += `<section class="panel"><h2>Investido por sócio</h2><p class="mut small" style="margin:0 0 8px">Entrada + gastos que cada um pagou, mesmo antes de vender.</p><div class="tbl" style="border:0"><table class="compact" style="min-width:0"><thead><tr><th>Sócio</th><th class="r">Em estoque</th><th class="r">Em carros vendidos</th><th class="r">Total investido</th></tr></thead><tbody>${['A', 'B'].map((c) => `<tr><td>${esc(nm(c))}</td><td class="r num">${brl(soc[c].estoque.inv)}</td><td class="r num">${brl(soc[c].vendidos.inv)}</td><td class="r num"><b>${brl(soc[c].totalInvestido)}</b></td></tr>`).join('')}</tbody></table></div></section>`;
    const [a0] = s.acerto;
    h += '<div class="grid two"><section class="panel"><h2>Acerto entre sócios</h2><div class="tbl" style="border:0"><table class="compact" style="min-width:0"><thead><tr><th>Sócio</th><th class="r">Investiu</th><th class="r">Recebeu</th><th class="r">Lucro</th><th class="r">Saldo</th></tr></thead><tbody>' +
      s.acerto.map((a) => `<tr><td>${esc(nm(a.nome))}</td><td class="r num">${brl(a.inv)}</td><td class="r num">${brl(a.rec)}</td><td class="r num">${brl(a.luc)}</td><td class="r num ${sign(a.saldo)}">${brl(a.saldo)}</td></tr>`).join('') + '</tbody></table></div>';
    const msg = Math.abs(a0.saldo) < 0.005 ? 'Ninguém deve nada.' : a0.saldo > 0 ? `${nm('B')} paga ${brl(a0.saldo)} a ${nm('A')}.` : `${nm('A')} paga ${brl(-a0.saldo)} a ${nm('B')}.`;
    h += `<p style="margin:10px 0 0"><b>${esc(msg)}</b></p><p class="mut" style="margin:4px 0 0;font-size:12.5px">${s.aReceber > 0.004 ? `Ainda falta entrar ${brl(s.aReceber)} de clientes: o saldo acima já considera tudo recebido. ` : ''}Só carros vendidos. Cada um recebe o que investiu mais a parte do lucro; desconta o dinheiro e o carro de troca que já pegou.</p></section>`;
    h += `<section class="panel"><h2>Lucro por mês</h2><div class="yearnav"><button class="btn sm" data-act="yr" data-d="-1" aria-label="Ano anterior">‹</button><b class="num">${S.year}</b><button class="btn sm" data-act="yr" data-d="1" aria-label="Próximo ano">›</button></div>${chart(s.months)}</section></div>`;
    const catKeys = Object.keys(s.cat).sort((a, b) => s.cat[b] - s.cat[a]);
    const mx = catKeys.length ? s.cat[catKeys[0]] : 1;
    h += `<div class="grid two"><section class="panel"><h2>Gastos por pessoa</h2><div class="bars">${['A', 'B'].map((p) => `<div class="bar-row"><span>${esc(nm(p))}</span><span class="tr"><span class="fi" style="display:block;width:${s.gastoTotal ? Math.round(s.pessoas[p] / s.gastoTotal * 100) : 0}%"></span></span><span class="num">${brl(s.pessoas[p])}</span></div>`).join('')}</div><p class="mut" style="margin:10px 0 0">Total gasto: <b class="num">${brl(s.gastoTotal)}</b></p></section>`;
    h += `<section class="panel"><h2>Gastos por categoria</h2>${catKeys.length ? `<div class="bars">${catKeys.map((k) => `<div class="bar-row"><span>${esc(k)}</span><span class="tr"><span class="fi" style="display:block;width:${Math.round(s.cat[k] / mx * 100)}%"></span></span><span class="num">${brl(s.cat[k])}</span></div>`).join('')}</div>` : '<p class="mut" style="margin:0">Nenhum gasto lançado.</p>'}</section></div>`;
    el.innerHTML = h;
  },
};

views.carros = {
  mount(el) {
    el.innerHTML = `<div class="toolbar"><input type="text" id="q" class="grow" placeholder="Buscar por nome, placa ou comprador" value="${esc(S.ui.q)}" aria-label="Buscar carro"><div class="chips" id="stchips"></div>${S.canWrite ? '<button class="btn pri" data-act="new-car">Novo carro</button>' : ''}</div><div id="list"></div>`;
    $('#q').oninput = function () { S.ui.q = this.value; views.carros.paint(); };
    this.paint();
  },
  paint() {
    const box = $('#list');
    if (!box) return;
    $('#stchips').innerHTML = ['Todos', ...LISTS.status].map((s) => `<button class="chip" data-st="${s}" aria-pressed="${S.ui.st === s}">${s}</button>`).join('');
    if (!derived().length) { box.innerHTML = empty('Nenhum carro cadastrado', 'Cadastre o primeiro carro para acompanhar custo, local e lucro.', 'Cadastrar primeiro carro', 'new-car'); return; }
    const q = S.ui.q.trim().toLowerCase();
    const list = derived().filter((d) => {
      const c = d.c;
      if (S.ui.st !== 'Todos' && c.status !== S.ui.st) return false;
      return !q || [c.name, c.placa, c.comprador].join(' ').toLowerCase().includes(q);
    }).sort((a, b) => (a.vendido - b.vendido) || String(b.c.dcompra || '').localeCompare(String(a.c.dcompra || '')));
    box.innerHTML = list.length ? `<div class="cars">${list.map(carCard).join('')}</div>` : '<div class="empty"><p class="mut" style="margin:0">Nenhum carro encontrado com esse filtro.</p></div>';
  },
};

views.onde = {
  mount(el) { el.innerHTML = '<div id="list"></div>'; this.paint(); },
  paint() {
    const box = $('#list');
    if (!box) return;
    const stock = derived().filter((d) => !d.vendido);
    if (!stock.length) { box.innerHTML = empty('Nenhum carro em estoque', 'Quando houver carros em estoque, eles aparecem aqui agrupados por local.', 'Cadastrar carro', 'new-car'); return; }
    const groups = LISTS.locs.map((l) => ({ name: l, items: [] }));
    groups.push({ name: 'Local não informado', items: [] });
    stock.forEach((d) => { const i = LISTS.locs.indexOf(d.c.loc); groups[i < 0 ? LISTS.locs.length : i].items.push(d); });
    box.innerHTML = '<div class="board">' + groups.filter((g) => g.items.length).map((g) => {
      const i = LISTS.locs.indexOf(g.name), tot = g.items.reduce((a, d) => a + d.custo, 0);
      return `<section class="col ${i < 0 ? 'l5' : 'l' + i}"><div class="col-h"><h3>${esc(g.name)}</h3><span class="mut num">${g.items.length} · ${brl(tot)}</span></div>` + g.items.map((d) => {
        const c = d.c;
        return `<div class="mini"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${plate(c.placa)}<b>${esc(c.name)}</b></div>${c.locdet ? `<span>${esc(c.locdet)}</span>` : ''}` +
          `<span class="mut" style="font-size:12.5px">${d.diasLoc != null ? `há ${d.diasLoc} dia${d.diasLoc === 1 ? '' : 's'}` : 'sem data de entrada'}${c.locprev ? ' · saída prevista ' + dmy(c.locprev) : ''}</span>` +
          `<div class="card-f">${d.atrasoLoc ? '<span class="pill late">Atrasado</span>' : d.saiLogo ? '<span class="pill soon">Sai em até 2 dias</span>' : ''}${stPill(c.status)}<span class="sp"></span>${S.canWrite ? `<button class="btn sm" data-act="move" data-id="${c.id}">Mover</button>` : ''}</div></div>`;
      }).join('') + '</section>';
    }).join('') + '</div>';
  },
};

views.gastos = {
  mount(el) {
    el.innerHTML = `<div class="toolbar"><select id="gcar" class="grow" aria-label="Filtrar por carro"></select><select id="gquem" aria-label="Filtrar por sócio"><option value="">Todos os sócios</option>${['A', 'B'].map((p) => `<option value="${p}"${S.ui.gquem === p ? ' selected' : ''}>${esc(nm(p))}</option>`).join('')}</select>${S.canWrite ? '<button class="btn pri" data-act="new-exp">Novo gasto</button>' : ''}</div><div id="list"></div>`;
    $('#gcar').onchange = function () { S.ui.gcar = this.value; views.gastos.paint(); };
    $('#gquem').onchange = function () { S.ui.gquem = this.value; views.gastos.paint(); };
    this.paint();
  },
  paint() {
    const box = $('#list');
    if (!box) return;
    $('#gcar').innerHTML = carOptions(S.ui.gcar);
    const all = S.expenses.filter((x) => !x.deleted);
    if (!all.length) { box.innerHTML = empty('Nenhum gasto lançado', 'Lance cada gasto com o carro, a categoria e quem pagou. Ele entra no custo do carro na hora.', 'Lançar primeiro gasto', 'new-exp'); return; }
    const rows = all.filter((x) => (!S.ui.gcar || String(x.carId) === S.ui.gcar) && (!S.ui.gquem || x.quem === S.ui.gquem)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const sum = (arr) => arr.reduce((a, x) => a + (Calc.num(x.valor) || 0), 0);
    let h = `<dl class="grid kpis" style="margin:0 0 12px"><div class="kpi"><dt>Total</dt><dd>${brl(sum(rows))}</dd></div>${['A', 'B'].map((p) => `<div class="kpi"><dt>${esc(nm(p))}</dt><dd>${brl(sum(rows.filter((x) => x.quem === p)))}</dd></div>`).join('')}</dl>`;
    h += '<div class="tbl"><table><thead><tr><th>Data</th><th>Carro</th><th>Categoria</th><th>Descrição</th><th class="r">Valor</th><th>Quem</th><th></th></tr></thead><tbody>' + rows.map((x) =>
      `<tr><td class="num">${dmy(x.date)}</td><td>${esc(carName(x.carId))}</td><td>${esc(x.cat || '')}</td><td>${esc(x.desc || '')}${x.obs ? `<div class="mut" style="font-size:12px">${esc(x.obs)}</div>` : ''}</td><td class="r num">${brl(Calc.num(x.valor))}</td><td>${esc(nm(x.quem))}</td><td style="white-space:nowrap">${S.canWrite ? `<button class="btn sm" data-act="edit-exp" data-id="${x.id}">Editar</button> <button class="btn sm danger" data-act="del-exp" data-id="${x.id}">Excluir</button>` : ''}</td></tr>`).join('') + '</tbody></table></div>';
    box.innerHTML = rows.length ? h : '<div class="empty"><p class="mut" style="margin:0">Nenhum gasto com esse filtro.</p></div>';
  },
};

views.previstos = {
  mount(el) {
    el.innerHTML = `<div class="toolbar"><select id="pcar" class="grow" aria-label="Filtrar por carro"></select>${S.canWrite ? '<button class="btn pri" data-act="new-pl">Novo gasto previsto</button>' : ''}</div><div id="list"></div>`;
    $('#pcar').onchange = function () { S.ui.pcar = this.value; views.previstos.paint(); };
    this.paint();
  },
  paint() {
    const box = $('#list');
    if (!box) return;
    $('#pcar').innerHTML = carOptions(S.ui.pcar);
    const all = S.planned.filter((x) => !x.deleted);
    if (!all.length) { box.innerHTML = empty('Nenhum gasto previsto', 'Anote o que ainda vai gastar no carro. Os pendentes entram no preço mínimo de venda.', 'Anotar gasto previsto', 'new-pl'); return; }
    const t = today();
    const isOpen = (x) => x.status !== 'Realizado' && x.status !== 'Cancelado';
    const rows = all.filter((x) => !S.ui.pcar || String(x.carId) === S.ui.pcar).sort((a, b) =>
      (isOpen(a) ? 0 : 1) - (isOpen(b) ? 0 : 1) || String(a.prazo || '9999').localeCompare(String(b.prazo || '9999')));
    const pend = rows.filter(isOpen).reduce((a, x) => a + (Calc.num(x.valor) || 0), 0);
    let h = `<dl class="grid kpis" style="margin:0 0 12px"><div class="kpi"><dt>Previsto pendente</dt><dd>${brl(pend)}</dd></div></dl><div class="tbl"><table><thead><tr><th>Carro</th><th>Categoria</th><th>Descrição</th><th class="r">Valor</th><th>Quem</th><th>Prazo</th><th>Status</th><th></th></tr></thead><tbody>`;
    h += rows.map((x) => {
      const open = isOpen(x), late = open && x.prazo && x.prazo < t, soon = open && x.prazo && !late && Calc.diff(x.prazo, t) <= 7;
      return `<tr class="${open ? '' : 'gone'}"><td>${esc(carName(x.carId))}</td><td>${esc(x.cat || '')}</td><td>${esc(x.desc || '')}</td><td class="r num">${brl(Calc.num(x.valor))}</td><td>${x.quem ? esc(nm(x.quem)) : '—'}</td><td class="num">${dmy(x.prazo)}${late ? ' <span class="pill late">Atrasado</span>' : soon ? ' <span class="pill soon">Em até 7 dias</span>' : ''}</td><td>${esc(x.status || 'Pendente')}</td><td style="white-space:nowrap">` +
        (S.canWrite ? `${open ? `<button class="btn sm" data-act="done-pl" data-id="${x.id}">Realizado</button> ` : ''}<button class="btn sm" data-act="edit-pl" data-id="${x.id}">Editar</button> <button class="btn sm danger" data-act="del-pl" data-id="${x.id}">Excluir</button>` : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    box.innerHTML = rows.length ? h : '<div class="empty"><p class="mut" style="margin:0">Nada previsto para esse carro.</p></div>';
  },
};

views.historico = {
  mount(el) {
    el.innerHTML = `<p class="mut" style="margin:0">Registro automático de quem criou, editou, moveu ou excluiu cada coisa. O histórico não pode ser editado nem apagado, nem pelo app.</p><div class="toolbar"><select id="hu" aria-label="Filtrar por pessoa"></select><select id="he" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option>${[['car', 'Carros'], ['expense', 'Gastos'], ['planned', 'Previstos'], ['receipt', 'Recebimentos'], ['settings', 'Ajustes'], ['user', 'Usuários']].map((e) => `<option value="${e[0]}"${S.ui.he === e[0] ? ' selected' : ''}>${e[1]}</option>`).join('')}</select></div><div id="list" class="log"></div>`;
    $('#hu').onchange = function () { S.ui.hu = this.value; views.historico.paint(); };
    $('#he').onchange = function () { S.ui.he = this.value; views.historico.paint(); };
    this.paint();
  },
  paint() {
    const box = $('#list');
    if (!box) return;
    if (!S.auditLoaded) { box.innerHTML = '<div class="empty"><p class="mut">Carregando…</p></div>'; return; }
    const who = new Map();
    S.audit.forEach((a) => who.set(a.userId ?? 0, a.userName || 'Terminal / sistema'));
    $('#hu').innerHTML = '<option value="">Todas as pessoas</option>' + [...who].map(([id, n]) => `<option value="${id}"${String(S.ui.hu) === String(id) ? ' selected' : ''}>${esc(n)}</option>`).join('');
    const rows = S.audit.filter((a) => (!S.ui.hu || String(a.userId ?? 0) === String(S.ui.hu)) && (!S.ui.he || a.entity === S.ui.he));
    if (!S.audit.length) { box.innerHTML = empty('Sem registros ainda', 'Cada criação, edição, mudança de local ou exclusão aparece aqui, com quem fez e quando.'); return; }
    if (!rows.length) { box.innerHTML = '<div class="empty"><p class="mut" style="margin:0">Nada com esse filtro.</p></div>'; return; }
    box.innerHTML = rows.map((a) => {
      const who = a.userName || 'Terminal / sistema';
      const it = ['car', 'expense', 'planned'].includes(a.entity) && a.entityId ? itemOf(a.entity, a.entityId) : null;
      const canRestore = a.action === 'excluiu' && it && it.deleted && S.canWrite;
      return `<div class="entry"><div class="h"><span class="avatar">${esc(initials(who))}</span><b>${esc(who)}</b><span>${esc(a.action)} ${esc(KIND_NAME[a.entity] || '')}</span><b>${esc(a.label || '')}</b><span class="when">${stamp(a.ts)}</span></div>` +
        (a.changes && a.changes.length ? `<ul>${a.changes.map((c) => `<li>${esc(c.f)}: ${c.de != null ? `<span class="old">${esc(c.de)}</span> → ` : ''}<b>${esc(c.para)}</b></li>`).join('')}</ul>` : '') +
        (canRestore ? `<div><button class="btn sm" data-act="restore" data-e="${esc(a.entity)}" data-id="${a.entityId}">Restaurar</button></div>` : '') + '</div>';
    }).join('');
  },
};

views.ajustes = {
  mount(el) {
    const admin = S.me.role === 'admin';
    const ex = S.cars.some((c) => c.example);
    const p = names();
    let h = '<div class="grid two">';
    h += `<section class="panel"><h2>Parâmetros</h2><div class="fgrid"><div class="field"><label for="a_meta">Meta de margem de lucro (%)</label><input type="text" id="a_meta" inputmode="decimal" value="${esc(String(Math.round(S.settings.meta * 1000) / 10).replace('.', ','))}"><span class="hint">Usada no preço sugerido para a meta de lucro.</span></div>` +
      `<div class="field"><label for="a_alerta">Alerta de carro parado (dias)</label><input type="text" id="a_alerta" inputmode="numeric" value="${esc(String(S.settings.alerta))}"></div></div><div class="err" id="aerr"></div>` +
      (S.canWrite ? '<div class="acts" style="margin-top:8px"><button class="btn pri" data-act="save-set">Salvar ajustes</button></div>' : '<p class="mut">Seu perfil é só de leitura.</p>') + '</section>';
    h += `<section class="panel"><h2>Minha conta</h2><p style="margin:0 0 8px">Você entrou como <b>${esc(S.me.name)}</b> (${esc(S.me.username)}) · ${esc(ROLE_NAME[S.me.role])}. Tudo que você criar ou alterar fica registrado no Histórico com o seu nome.</p><div class="acts" style="justify-content:flex-start"><button class="btn" data-act="pwd">Trocar minha senha</button><a class="btn" href="/api/export" download>Baixar cópia dos dados (JSON)</a></div></section></div>`;
    if (admin) {
      h += `<section class="panel"><h2>Sócios</h2><p class="mut" style="margin:0 0 8px">Os nomes que aparecem nas telas e nas contas de cada sócio.</p><div class="fgrid"><div class="field"><label for="p_a">Sócio 1</label><input type="text" id="p_a" value="${esc(p.A)}"></div><div class="field"><label for="p_b">Sócio 2</label><input type="text" id="p_b" value="${esc(p.B)}"></div></div><div class="err" id="perr"></div><div class="acts" style="margin-top:8px"><button class="btn pri" data-act="save-partners">Salvar nomes</button></div></section>`;
      h += '<section class="panel"><h2>Usuários</h2><div id="users"><p class="mut">Carregando…</p></div><div class="acts" style="justify-content:flex-start;margin-top:10px"><button class="btn pri" data-act="new-user">Novo usuário</button></div></section>';
    }
    if (S.canWrite) {
      h += `<section class="panel"><h2>Dados de exemplo</h2><p class="mut" style="margin:0 0 8px">Para testar o app sem mexer nos dados reais. Os exemplos têm "(exemplo)" no nome.</p><div class="acts" style="justify-content:flex-start"><button class="btn" data-act="examples">Carregar exemplos</button>${ex ? '<button class="btn danger" data-act="rm-examples">Remover exemplos</button>' : ''}</div></section>`;
    }
    el.innerHTML = h;
  },
  paint() { this.paintUsers(); },
  paintUsers() {
    const box = $('#users');
    if (!box || !S.users.length) return;
    box.innerHTML = '<div class="tbl"><table style="min-width:520px"><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Último acesso</th><th></th></tr></thead><tbody>' + S.users.map((u) =>
      `<tr class="${u.active ? '' : 'off'}"><td>${esc(u.name)}${u.active ? '' : ' <span class="pill">desativado</span>'}</td><td class="num">${esc(u.username)}</td><td>${esc(ROLE_NAME[u.role])}</td><td class="num">${u.last_login ? stamp(u.last_login) : '—'}</td><td><button class="btn sm" data-act="edit-user" data-id="${u.id}">Editar</button></td></tr>`).join('') + '</tbody></table></div>';
  },
};

export { ROLE_NAME };
