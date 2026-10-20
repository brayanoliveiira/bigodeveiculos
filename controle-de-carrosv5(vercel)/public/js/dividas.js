// Abas Empréstimos e Veículos a pagar: dinheiro que pegamos emprestado e carros comprados a prazo.
// As parcelas das duas ficam na mesma tabela (payables); o resumo vem de Calc.debts.
import { $, esc, brl, dmy, today, parseMoney, toast, moneyField, table } from './util.js';
import { S, LISTS, names, liveCars, itemOf } from './state.js';
import { api } from './api.js';
import { views } from './views.js';
import { openForm, confirmBox, closeModal, hooks } from './forms.js';

const nm = (c) => names()[c] || '—';
const quemTxt = (q) => (q ? nm(q) : 'Metade cada');
const round2 = (v) => Math.round(v * 100) / 100;
const K = (t, v, cls, hero) => `<div class="kpi${hero ? ' hero' : ''}"><dt>${esc(t)}</dt><dd class="${cls || ''}">${v}</dd></div>`;
const loans = () => (S.loans || []).filter((l) => !l.deleted);
const carOf = (id) => (S.cars || []).find((c) => c.id === id);
const PRAZOS = [30, 45, 60, 90, 120];
const PARCELAS = [2, 3, 4, 5, 6, 8, 10, 12, 18, 24, 36, 48];

/** Texto curto de como o empréstimo é pago: "R$ 2.000,00/mês até 15/12/2026" ou "2x de R$ 10.878,17 (5,8% a.m.)". */
function condicao(l, g) {
  const tx = Calc.num(l.taxaMes);
  if (l.modo === 'Juros mensais') {
    const j = Calc.num(l.jurosMes) != null ? Calc.num(l.jurosMes) : round2(Calc.num(l.valor) * (tx || 0));
    return `Juros de ${brl(j)}/mês${tx != null && Calc.num(l.jurosMes) == null ? ` (${(tx * 100).toFixed(2).replace('.', ',')}%)` : ''} · devolve em ${dmy(l.venc)}`;
  }
  const parc = g && g.itens.length ? g.itens.find((x) => x.tipo === 'Parcela') : null;
  return `${l.nParc || 1}x${parc ? ' de ' + brl(Calc.num(parc.valor)) : ''}${tx ? ` · ${(tx * 100).toFixed(2).replace('.', ',')}% a.m.` : ' · sem juros'}`;
}

const carTxt = (c) => `${c.name}${c.placa ? ' · ' + c.placa : ''}`;
/** Onde está o dinheiro do empréstimo hoje (segue as trocas a partir do carro comprado). */
export function trailOf(l) {
  if (l.carId == null) return null;
  return Calc.loanTrail(l.carId, S.cars, (c) => !!(S.D[c.id] && S.D[c.id].entregue));
}
function trailHtml(l) {
  const t = trailOf(l);
  if (!t) return '<span class="mut">—</span>';
  const first = t.path[0];
  let h = `<b>${esc(carTxt(first))}</b>`;
  if (t.path.length > 1) h += `<div class="mut small">${t.path.map((c) => esc(c.name)).join(' → ')}</div>`;
  if (t.emDinheiro) h += `<div><span class="pill ok">Virou dinheiro${t.ultimaVenda ? ' em ' + dmy(t.ultimaVenda) : ''}</span></div>`;
  else if (t.holders.length && (t.holders.length > 1 || t.holders[0].id !== first.id)) h += `<div class="small">Agora em: <b>${t.holders.map((c) => esc(carTxt(c))).join(', ')}</b></div>`;
  return h;
}

function situacaoPill(g) {
  if (!g || !g.n) return '<span class="pill soon">Sem parcelas</span>';
  if (g.quitado || g.falta <= 0.004) return '<span class="pill ok">Quitado</span>';
  if (g.atrasado > 0.004) return `<span class="pill late">Atrasado ${brl(g.atrasado)}</span>`;
  return '<span class="pill soon">Em aberto</span>';
}

/* ---------- Empréstimos ---------- */
views.emprestimos = {
  mount(el) {
    el.innerHTML = `<div class="toolbar"><div class="chips" id="lchips"></div><span class="grow"></span>${S.canWrite ? '<button class="btn pri" data-act="dv-new-loan">Novo empréstimo</button>' : ''}</div><div id="list" class="stack"></div>`;
    this.paint();
  },
  paint() {
    const box = $('#list');
    if (!box) return;
    const f = S.ui.lf || 'Em aberto';
    $('#lchips').innerHTML = ['Em aberto', 'Quitados', 'Todos'].map((x) => `<button class="chip" data-act="dv-lf" data-id="${x}" aria-pressed="${f === x}">${x}</button>`).join('');
    const all = loans();
    if (!all.length) {
      box.innerHTML = '<div class="empty"><h3>Nenhum empréstimo</h3><p class="mut" style="margin:0;max-width:52ch">Cadastre o dinheiro que vocês pegaram para comprar carros: de quem, quanto, os juros por mês e quando devolver. O app monta as parcelas e avisa os vencimentos.</p>' +
        (S.canWrite ? '<button class="btn pri" data-act="dv-new-loan">Cadastrar empréstimo</button>' : '') + '</div>';
      return;
    }
    const DV = S.DV, G = (l) => DV.porLoan[l.id];
    const aberto = all.filter((l) => !(G(l) && G(l).quitado));
    const falta = aberto.reduce((a, l) => a + (G(l) ? G(l).falta : 0), 0);
    const fA = aberto.reduce((a, l) => a + (G(l) ? G(l).A : 0), 0), fB = aberto.reduce((a, l) => a + (G(l) ? G(l).B : 0), 0);
    const atras = aberto.reduce((a, l) => a + (G(l) ? G(l).atrasado : 0), 0);
    const prox = aberto.map((l) => G(l) && G(l).prox).filter(Boolean).sort()[0];
    let h = '<dl class="grid kpis" style="margin:0">' + K('Devemos em empréstimos', brl(falta), '', true) + K(`${nm('A')} paga`, brl(fA)) + K(`${nm('B')} paga`, brl(fB)) +
      K('Juros por mês (em aberto)', brl(DV.jurosMes)) + K('Juros já pagos', brl(aberto.concat(all.filter((l) => G(l) && G(l).quitado)).reduce((a, l) => a + (G(l) ? G(l).jurosPagos : 0), 0))) +
      K('Atrasado', brl(atras), atras > 0.004 ? 'neg' : '') + K('Próximo vencimento', prox ? dmy(prox) : '—') + '</dl>';
    const rows = all.filter((l) => f === 'Todos' || (f === 'Quitados') === !!(G(l) && G(l).quitado))
      .sort((a, b) => String((G(a) && G(a).prox) || '9').localeCompare(String((G(b) && G(b).prox) || '9')) || String(b.data).localeCompare(String(a.data)));
    h += table([
      { label: 'De quem', get: (l) => `<b>${esc(l.credor)}</b><div class="mut small">${dmy(l.data)}</div>${l.obs ? `<div class="small">${esc(l.obs)}</div>` : ''}` },
      { label: 'Valor', r: true, get: (l) => brl(Calc.num(l.valor)) },
      { label: 'Condição', get: (l) => `${esc(l.modo)}<div class="mut small">${esc(condicao(l, G(l)))}</div>` },
      { label: 'Quem paga', get: (l) => esc(quemTxt(l.quem)) },
      { label: 'Carro / onde está', get: (l) => trailHtml(l) },
      { label: 'Juros total', r: true, get: (l) => brl(G(l) ? G(l).juros : null) },
      { label: 'Pago', r: true, get: (l) => brl(G(l) ? G(l).pago : 0) },
      { label: 'Falta', r: true, get: (l) => `<b>${brl(G(l) ? G(l).falta : 0)}</b>` },
      { label: 'Próximo', get: (l) => (G(l) && G(l).prox ? `${dmy(G(l).prox)}<div class="mut small">${brl(G(l).proxValor)}</div>` : '—') },
      { label: 'Situação', get: (l) => situacaoPill(G(l)) },
      { label: '', get: (l) => `<div class="row-acts"><button class="btn sm" data-act="dv-parc-loan" data-id="${l.id}">Parcelas</button>${S.canWrite ? `<button class="btn sm" data-act="dv-edit-loan" data-id="${l.id}">Editar</button><button class="btn sm" data-act="dv-del-loan" data-id="${l.id}">Excluir</button>` : ''}</div>` },
    ], rows, null, 'Nenhum empréstimo neste filtro.');
    box.innerHTML = h;
  },
};

/* ---------- Veículos a pagar ---------- */
views.apagar = {
  mount(el) {
    el.innerHTML = `<div class="toolbar"><div class="chips" id="pchips"></div><span class="grow"></span>${S.canWrite ? '<button class="btn pri" data-act="dv-new-cardebt">Nova conta de veículo</button>' : ''}</div><div id="list" class="stack"></div>`;
    this.paint();
  },
  paint() {
    const box = $('#list');
    if (!box) return;
    const f = S.ui.af || 'Em aberto';
    $('#pchips').innerHTML = ['Em aberto', 'Atrasadas', 'Quitadas', 'Todas'].map((x) => `<button class="chip" data-act="dv-af" data-id="${x}" aria-pressed="${f === x}">${x}</button>`).join('');
    const DV = S.DV, ids = Object.keys(DV.porCar).map(Number).filter((id) => carOf(id));
    if (!ids.length) {
      box.innerHTML = '<div class="empty"><h3>Nenhum veículo a pagar</h3><p class="mut" style="margin:0;max-width:52ch">Comprou um carro para pagar depois (ex.: em 60 dias) ou parcelado? Cadastre aqui: valor, a quem pagar, quem paga (os dois ou só um) e a forma. A dívida continua aqui mesmo se o carro já foi vendido ou trocado.</p>' +
        (S.canWrite ? '<button class="btn pri" data-act="dv-new-cardebt">Cadastrar conta de veículo</button>' : '') + '</div>';
      return;
    }
    const gs = ids.map((id) => ({ id, c: carOf(id), g: DV.porCar[id] }));
    const sum = (k) => gs.reduce((a, x) => a + x.g[k], 0);
    const em30 = Calc.addDays(today(), 30);
    const prox30 = gs.reduce((a, x) => a + x.g.itens.filter((p) => p.status !== 'Pago' && p.due >= today() && p.due <= em30).reduce((b, p) => b + Calc.num(p.valor), 0), 0);
    let h = '<dl class="grid kpis" style="margin:0">' + K('Falta pagar em veículos', brl(sum('falta')), '', true) + K(`${nm('A')} paga`, brl(sum('A'))) + K(`${nm('B')} paga`, brl(sum('B'))) +
      K('Atrasado', brl(sum('atrasado')), sum('atrasado') > 0.004 ? 'neg' : '') + K('Vence em 30 dias', brl(prox30)) + K('Já pago', brl(sum('pago'))) + '</dl>';
    const rows = gs.filter((x) => f === 'Todas' || (f === 'Em aberto' && x.g.falta > 0.004) || (f === 'Atrasadas' && x.g.atrasado > 0.004) || (f === 'Quitadas' && x.g.falta <= 0.004))
      .sort((a, b) => String(a.g.prox || '9').localeCompare(String(b.g.prox || '9')));
    const credores = (g) => [...new Set(g.itens.map((p) => p.credor).filter(Boolean))].join(', ') || '—';
    const formas = (g) => [...new Set(g.itens.map((p) => p.forma).filter(Boolean))].join(', ') || '—';
    const stCar = (c) => (c.status === 'Vendido' ? '<span class="pill">Já vendido</span>' : c.status === 'Reservado' ? '<span class="pill soon">Reservado</span>' : '<span class="pill">Em estoque</span>');
    h += table([
      { label: 'Carro', get: (x) => `<b>${esc(x.c.name)}</b><div class="mut small">${esc(x.c.placa || '')} ${stCar(x.c)}</div>` },
      { label: 'A quem', get: (x) => esc(credores(x.g)) },
      { label: 'Forma', get: (x) => `${esc(formas(x.g))}<div class="mut small">${x.g.n} ${x.g.n === 1 ? 'pagamento' : 'pagamentos'}</div>` },
      { label: 'Total', r: true, get: (x) => brl(x.g.total) },
      { label: 'Pago', r: true, get: (x) => brl(x.g.pago) },
      { label: 'Falta', r: true, get: (x) => `<b>${brl(x.g.falta)}</b>` },
      { label: nm('A'), r: true, get: (x) => brl(x.g.A) },
      { label: nm('B'), r: true, get: (x) => brl(x.g.B) },
      { label: 'Próximo', get: (x) => (x.g.prox ? `${dmy(x.g.prox)}<div class="mut small">${brl(x.g.proxValor)}</div>` : '—') },
      { label: 'Situação', get: (x) => situacaoPill({ ...x.g, quitado: x.g.falta <= 0.004 }) },
      { label: '', get: (x) => `<div class="row-acts"><button class="btn sm" data-act="dv-parc-car" data-id="${x.id}">Parcelas</button>${S.canWrite ? `<button class="btn sm" data-act="dv-new-cardebt" data-id="${x.id}">Acrescentar</button>` : ''}</div>` },
    ], rows, null, 'Nenhum veículo neste filtro.');
    box.innerHTML = h;
  },
};

/* ---------- janela de parcelas (de um empréstimo ou de um carro) ---------- */
export function renderParcelas(owner) {
  S.ui.dvOwner = owner;
  const isLoan = owner.loanId != null;
  const l = isLoan ? itemOf('loan', owner.loanId) : null, c = isLoan ? null : carOf(owner.carId);
  if ((isLoan && !l) || (!isLoan && !c)) { closeModal(); return; }
  const g = isLoan ? S.DV.porLoan[l.id] : S.DV.porCar[c.id];
  const itens = g ? g.itens : [];
  const title = isLoan ? `Empréstimo — ${esc(l.credor)} (${brl(Calc.num(l.valor))})` : `A pagar — ${esc(c.name)}`;
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="sheet wide dv-sum"><h2>${title}</h2>` +
    (isLoan ? `<p class="mut small" style="margin:0">${esc(l.modo)} · ${esc(condicao(l, g))} · quem paga: ${esc(quemTxt(l.quem))}</p>${l.obs ? `<p class="small" style="margin:0"><b>Finalidade:</b> ${esc(l.obs)}</p>` : ''}${l.carId != null ? `<div class="small">${trailHtml(l)}</div>` : ''}` : '') +
    `<dl class="grid kpis" style="margin:0">${K('Total', brl(g ? g.total : 0))}${K('Pago', brl(g ? g.pago : 0))}${K('Falta', brl(g ? g.falta : 0), '', true)}${isLoan ? K('Juros total', brl(g ? g.juros : 0)) : ''}</dl>` +
    table([
      { label: 'Parcela', get: (p) => `<b>${esc(p.label || p.tipo || '—')}</b>${p.obs ? `<div class="mut small">${esc(p.obs)}</div>` : ''}` },
      { label: 'Vencimento', get: (p) => dmy(p.due) },
      { label: 'Valor', r: true, get: (p) => brl(Calc.num(p.valor)) },
      { label: 'Quem paga', get: (p) => esc(quemTxt(p.quem)) },
      { label: 'Forma', get: (p) => esc(p.forma || '—') },
      { label: 'Situação', get: (p) => (p.status === 'Pago' ? `<span class="pill ok">Pago ${dmy(p.paidAt)}</span>` : p.due < today() ? '<span class="pill late">Atrasado</span>' : '<span class="pill soon">A pagar</span>') },
      { label: '', get: (p) => (S.canWrite ? `<div class="row-acts">${p.status === 'Pago' ? `<button class="btn sm" data-act="dv-undo" data-id="${p.id}">Desfazer</button>` : `<button class="btn sm pri" data-act="dv-pay" data-id="${p.id}">Paguei</button>`}<button class="btn sm" data-act="dv-edit-pg" data-id="${p.id}">Editar</button><button class="btn sm" data-act="dv-del-pg" data-id="${p.id}">Excluir</button></div>` : '') },
    ], itens, null, 'Nenhuma parcela.') +
    `<div class="acts">${S.canWrite && isLoan ? `<button class="btn" data-act="dv-replan" data-id="${l.id}">Refazer parcelas pendentes</button>` : ''}${S.canWrite && !isLoan ? `<button class="btn" data-act="dv-new-cardebt" data-id="${c.id}">Acrescentar pagamento</button>` : ''}<button class="btn pri" data-x="cancel">Fechar</button></div></div>`;
  m.onclick = (ev) => { if (ev.target === m || ev.target.getAttribute?.('data-x') === 'cancel') { S.ui.dvOwner = null; closeModal(); } };
}

/** Parcelas que o empréstimo deveria ter, sem repetir as que já foram pagas (mesmo tipo e vencimento). */
function loanParts(l) {
  const pagos = (S.payables || []).filter((p) => !p.deleted && p.loanId === l.id && p.status === 'Pago');
  return Calc.loanPlan(l).filter((x) => !pagos.some((p) => p.tipo === x.tipo && p.due === x.due))
    .map((x) => ({ ...x, quem: l.quem || null, status: 'Pendente' }));
}
async function planLoan(l, replace) {
  const parts = loanParts(l);
  if (!parts.length) { toast('Nada a programar: confira valor, datas e juros.'); return; }
  await api('POST', '/api/payables/plan', { loanId: l.id, replace: !!replace, parts });
  await hooks.reload();
}
const PLAN_KEYS = ['valor', 'data', 'modo', 'jurosMes', 'taxaMes', 'nParc', 'venc', 'quem'];

function loanForm(existing) {
  const before = existing ? JSON.stringify(PLAN_KEYS.map((k) => existing[k] ?? null)) : null;
  openForm('loan', existing || null, {
    afterSave: async (item) => {
      try { await planLoan(item, false); toast('Empréstimo salvo e parcelas programadas.'); renderParcelas({ loanId: item.id }); } catch (e) { toast(e.message); }
    },
    onDone: existing ? async () => {
      const l = itemOf('loan', existing.id);
      if (!l || JSON.stringify(PLAN_KEYS.map((k) => l[k] ?? null)) === before) return;
      confirmBox('As condições do empréstimo mudaram. Refazer as parcelas que ainda não foram pagas? As pagas continuam como estão.', async () => {
        try { await planLoan(l, true); toast('Parcelas refeitas.'); setTimeout(() => renderParcelas({ loanId: l.id }), 0); } catch (e) { toast(e.message); }
      }, 'Refazer parcelas');
    } : undefined,
  });
}

/* ---------- conta de veículo (compra a prazo / parcelada) ---------- */
function carDebtForm(carId) {
  const cars = liveCars();
  if (!cars.length) { toast('Cadastre um carro primeiro.'); return; }
  const c0 = carId ? carOf(carId) : null;
  const opt = (arr, fmt, sel) => arr.map((x) => `<option value="${esc(x)}"${String(x) === String(sel) ? ' selected' : ''}>${esc(fmt(x))}</option>`).join('');
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<form class="sheet wide" id="cdebt" novalidate><h2>${c0 ? 'Acrescentar pagamento — ' + esc(c0.name) : 'Nova conta de veículo'}</h2>
    <p class="mut small" style="margin:0">Para carro comprado a prazo ou parcelado. A dívida fica aqui até ser paga, mesmo que o carro já tenha sido vendido ou trocado.</p>
    <div class="fgrid">
      <div class="field full"><label for="cd_car">Carro</label><select id="cd_car">${c0 ? '' : '<option value="">Escolha…</option>'}${cars.map((c) => `<option value="${c.id}"${c0 && c.id === c0.id ? ' selected' : ''}>${esc(c.name)}${c.placa ? ' · ' + esc(c.placa) : ''}</option>`).join('')}</select></div>
      <div class="field"><label for="cd_credor">A quem pagamos</label><input type="text" id="cd_credor" placeholder="Ex.: João (vendedor), loja X"></div>
      <div class="field"><label for="cd_total">Valor a pagar</label><input type="text" id="cd_total" inputmode="decimal" data-money value="${c0 && Calc.num(c0.entT) ? esc(moneyField(Calc.num(c0.entT))) : ''}"></div>
      <div class="field"><label for="cd_mode">Condição</label><select id="cd_mode"><option value="prazo" selected>A prazo (um pagamento depois)</option><option value="parcelado">Parcelado</option><option value="vista">À vista (já pago)</option></select></div>
      <div class="field"><label for="cd_base">Data da compra</label><input type="date" id="cd_base" value="${esc((c0 && c0.dcompra) || today())}"></div>
      <div class="field" data-for="prazo parcelado"><label for="cd_ent">Entrada já paga</label><input type="text" id="cd_ent" inputmode="decimal" data-money placeholder="R$ 0,00"></div>
      <div class="field" data-for="prazo"><label for="cd_dias">Prazo</label><select id="cd_dias">${opt(PRAZOS, (x) => x + ' dias', 60)}<option value="outro">Outro…</option></select></div>
      <div class="field" data-for="prazo"><label for="cd_dias2">Prazo em dias (se "Outro")</label><input type="text" id="cd_dias2" inputmode="numeric"></div>
      <div class="field" data-for="parcelado"><label for="cd_n">Número de parcelas</label><select id="cd_n">${opt(PARCELAS, (x) => x + 'x', 3)}</select></div>
      <div class="field" data-for="parcelado"><label for="cd_first">Primeiro vencimento</label><input type="date" id="cd_first"><span class="hint">Em branco: 1 mês depois da compra.</span></div>
      <div class="field"><label for="cd_forma">Forma de pagamento</label><select id="cd_forma"><option value="">Não informada</option>${opt(LISTS.formasPag, (x) => x, 'Pix')}</select></div>
      <div class="field"><label for="cd_quem">Quem paga</label><select id="cd_quem"><option value="">Os dois (metade cada)</option><option value="A">Só ${esc(nm('A'))}</option><option value="B">Só ${esc(nm('B'))}</option></select></div>
    </div>
    <div id="cd_prev"></div><div class="err" id="ferr" role="alert"></div>
    <div class="acts"><button type="button" class="btn" data-x="cancel">Cancelar</button><button class="btn pri" type="submit" id="fsave">Salvar</button></div></form>`;
  const read = () => {
    const mode = $('#cd_mode').value, sel = $('#cd_dias').value;
    const ent = parseMoney($('#cd_ent').value);
    return { mode, total: parseMoney($('#cd_total').value), ent: ent == null || Number.isNaN(ent) ? 0 : ent, dias: sel === 'outro' ? parseInt($('#cd_dias2').value, 10) : parseInt(sel, 10), n: parseInt($('#cd_n').value, 10), base: $('#cd_base').value, first: $('#cd_first').value };
  };
  const parts = () => {
    const r = read();
    if (!r.base || r.total == null || Number.isNaN(r.total) || r.total <= 0) return [];
    return Calc.plan({ total: r.total, base: r.base, mode: r.mode, entrada: r.ent, prazoDias: Number.isNaN(r.dias) ? 0 : r.dias, n: r.n, primeiro: r.first || null })
      .map((p) => ({ label: p.label, tipo: p.label === 'À vista' ? 'À vista' : p.label === 'Entrada' ? 'Entrada' : 'Parcela', due: p.due, valor: p.valor, status: p.status === 'Recebido' ? 'Pago' : 'Pendente', paidAt: p.status === 'Recebido' ? p.paidAt : null }));
  };
  const refresh = () => {
    const mode = $('#cd_mode').value;
    m.querySelectorAll('[data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(mode); });
    if (mode === 'prazo') $('#cd_dias2').closest('.field').hidden = $('#cd_dias').value !== 'outro';
    const ps = parts(), sum = round2(ps.reduce((a, p) => a + p.valor, 0));
    $('#cd_prev').innerHTML = ps.length
      ? `<div class="tbl"><table class="compact" style="min-width:0"><thead><tr><th>Pagamento</th><th>Vencimento</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>${ps.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${dmy(p.due)}</td><td class="r num">${brl(p.valor)}</td><td>${p.status === 'Pago' ? 'Pago' : 'A pagar'}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2"><b>Total</b></td><td class="r num"><b>${brl(sum)}</b></td><td></td></tr></tfoot></table></div>`
      : '<p class="mut small" style="margin:0">Preencha o valor e a data para ver os pagamentos.</p>';
  };
  m.oninput = refresh; m.onchange = (ev) => {
    if (ev.target.id === 'cd_car') { const c = carOf(Number(ev.target.value)); if (c) { if (!$('#cd_total').value && Calc.num(c.entT)) $('#cd_total').value = moneyField(Calc.num(c.entT)); if (c.dcompra) $('#cd_base').value = c.dcompra; } }
    refresh();
  };
  refresh();
  m.onclick = (ev) => { if (ev.target === m || ev.target.getAttribute?.('data-x') === 'cancel') closeModal(); };
  let saving = false;
  $('#cdebt').onsubmit = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    const carSel = Number($('#cd_car').value), r = read(), ps = parts();
    if (!carSel) { $('#ferr').textContent = 'Escolha o carro.'; return; }
    if (!ps.length) { $('#ferr').textContent = 'Informe o valor a pagar e a data da compra.'; return; }
    if (r.mode === 'prazo' && (Number.isNaN(r.dias) || r.dias < 0)) { $('#ferr').textContent = 'Informe o prazo em dias.'; return; }
    const extra = { credor: $('#cd_credor').value.trim() || null, forma: $('#cd_forma').value || null, quem: $('#cd_quem').value || null };
    saving = true; $('#fsave').disabled = true;
    try {
      await api('POST', '/api/payables/plan', { carId: carSel, parts: ps.map((p) => ({ ...p, ...extra })) });
      await hooks.reload();
      toast('Conta do veículo salva.');
      renderParcelas({ carId: carSel });
    } catch (e) { $('#ferr').textContent = e.message; saving = false; $('#fsave').disabled = false; }
  };
}

/* ---------- ações ---------- */
// Dentro de confirmBox, a janela de parcelas é reaberta com setTimeout: confirmBox fecha o modal ao terminar.
const reopen = () => { if (S.ui.dvOwner) renderParcelas(S.ui.dvOwner); };
async function patchPg(id, body, msg) {
  try { await api('PATCH', `/api/payables/${id}`, body); await hooks.reload(); toast(msg); reopen(); } catch (e) { toast(e.message); }
}

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-act^="dv-"]');
  if (!b || !S.me) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'dv-lf': S.ui.lf = id; views.emprestimos.paint(); break;
    case 'dv-af': S.ui.af = id; views.apagar.paint(); break;
    case 'dv-new-loan': loanForm(null); break;
    case 'dv-edit-loan': loanForm(itemOf('loan', id)); break;
    case 'dv-del-loan': {
      const l = itemOf('loan', id);
      confirmBox(`Excluir o empréstimo de ${brl(Calc.num(l.valor))} com ${l.credor}? As parcelas dele deixam de contar. Dá para restaurar pelo Histórico.`, async () => {
        try { await api('DELETE', `/api/loans/${l.id}`); await hooks.reload(); toast('Excluído. Dá para restaurar pelo Histórico.'); S.ui.dvOwner = null; } catch (e) { toast(e.message); }
      }, 'Excluir');
      break;
    }
    case 'dv-parc-loan': renderParcelas({ loanId: Number(id) }); break;
    case 'dv-parc-car': renderParcelas({ carId: Number(id) }); break;
    case 'dv-new-cardebt': carDebtForm(id ? Number(id) : null); break;
    case 'dv-replan': {
      const l = itemOf('loan', id);
      confirmBox('Refazer as parcelas que ainda não foram pagas, pelas condições atuais do empréstimo? Valores editados à mão nas pendentes se perdem.', async () => {
        try { await planLoan(l, true); toast('Parcelas refeitas.'); setTimeout(() => renderParcelas({ loanId: l.id }), 0); } catch (e) { toast(e.message); }
      }, 'Refazer');
      break;
    }
    case 'dv-pay': await patchPg(id, { status: 'Pago', paidAt: today() }, 'Marcado como pago hoje. Para outra data, use Editar.'); break;
    case 'dv-undo': await patchPg(id, { status: 'Pendente', paidAt: null }, 'Voltou para a pagar.'); break;
    case 'dv-edit-pg': { const p = itemOf('payable', id); const owner = S.ui.dvOwner; openForm('payable', p, { heading: 'Editar parcela', onDone: () => owner && renderParcelas(owner) }); break; }
    case 'dv-del-pg': {
      const p = itemOf('payable', id), owner = S.ui.dvOwner;
      confirmBox(`Excluir a parcela ${p.label || ''} de ${brl(Calc.num(p.valor))}? Dá para restaurar pelo Histórico.`, async () => {
        try { await api('DELETE', `/api/payables/${p.id}`); await hooks.reload(); toast('Excluído.'); if (owner) setTimeout(() => renderParcelas(owner), 0); } catch (e) { toast(e.message); }
      }, 'Excluir');
      break;
    }
    default: break;
  }
});
