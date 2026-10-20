// Formulários (carro, gasto, previsto, mover) e janelas de confirmação.
// O servidor valida tudo de novo; aqui só se evita ida e volta desnecessária.
import { $, esc, brl, dmy, today, parseMoney, toast, moneyField, installMoneyMask, stamp, marcaNome } from './util.js';
import { S, LISTS, names, liveCars } from './state.js';
import { api } from './api.js';

installMoneyMask();
export const hooks = { reload: async () => {} };
export const setHooks = (h) => Object.assign(hooks, h);

const partnerOpts = () => [['A', names().A], ['B', names().B]];
const listOpts = (key) => () => LISTS[key].map((o) => [o, o]);
const isSold = (v) => v.status === 'Vendido';
const isConsig = (v) => !!String(v.dono || '').trim();
const notConsig = (v) => !isConsig(v);
const notSold = (v) => !isSold(v);
const temHist = (v) => !!(v.leilao || v.sinistro);
const isJurosMes = (v) => v.modo === 'Juros mensais';
const isParcelado = (v) => v.modo === 'Parcelado';
// 'Entregue' é posto pelo servidor quando o carro é vendido: não aparece para escolher.
const locOpts = () => LISTS.locs.filter((l) => l !== 'Entregue').map((o) => [o, o]);

// t: text | int | money | pct | date | sel | car. `opts` é função (as listas chegam do servidor depois do login).
const F = {
  car: { col: 'cars', title: 'carro', fields: () => [
    { g: 'Identificação' },
    { k: 'placa', label: 'Placa', t: 'text', upper: true, hint: 'Ao digitar a placa completa, modelo, ano, cor e FIPE são preenchidos sozinhos.' }, { k: 'ano', label: 'Ano', t: 'int' },
    { lookup: true },
    { k: 'name', label: 'Carro (modelo e versão)', t: 'text', req: true, full: true },
    { k: 'marca', label: 'Montadora', t: 'text', hint: 'Vem da placa ou da tabela FIPE.' }, { k: 'cor', label: 'Cor', t: 'text' },
    { k: 'km', label: 'KM (quilometragem)', t: 'int', hint: 'Ex.: 85.000' },
    { k: 'fipe', label: 'Valor FIPE', t: 'money', hint: 'Vem da busca na tabela FIPE ou da placa. Também dá para digitar.' },
    { k: 'fipeRef', label: 'Referência da FIPE', t: 'text', hint: 'Mês da tabela e código FIPE.' },
    { k: 'leilao', label: 'Veio de leilão', t: 'chk' }, { k: 'sinistro', label: 'Tem sinistro', t: 'chk' },
    { k: 'histObs', label: 'Observação de leilão / sinistro', t: 'text', full: true, showIf: temHist, hint: 'Ex.: leilão de financeira, batida leve na traseira, sem dano estrutural.' },
    { g: 'Compra' },
    { k: 'dcompra', label: 'Data da compra (ou de quando o carro chegou)', t: 'date' },
    { k: 'dono', label: 'Carro de terceiro? Dono do carro', t: 'text', full: true, hint: 'Deixe vazio se o carro é nosso. Preenchido = consignado: ninguém paga pelo carro, ele só fica aqui para vender.' },
    { k: 'repasse', label: 'Repasse ao dono (valor mínimo)', t: 'money', full: true, showIf: isConsig, hint: 'Quanto precisa ir para o dono. Os gastos do carro saem do valor da venda e o que sobrar é a comissão.' },
    { k: 'entT', label: 'Valor de entrada (total)', t: 'money', hint: 'Digite só o total. Por padrão cada sócio pagou metade. Se o carro é de troca e fica com o dono do consignado: o valor em que ele entrou na troca.', showIf: (v) => notConsig(v) || !!v.origemId },
    { k: 'origemId', label: 'Veio de troca em qual carro nosso?', t: 'car', blank: 'Não veio de troca', full: true, hint: 'Se este carro entrou como pagamento de uma venda, escolha o carro vendido. Para o carro de troca que fica com o dono de um consignado: preencha o mesmo Dono acima, deixe o repasse em branco e escolha aqui o carro consignado vendido.' },
    { k: 'ovrA', label: `Pago por ${names().A} (só se NÃO foi metade)`, t: 'money', showIf: notConsig },
    { k: 'ovrB', label: `Pago por ${names().B} (só se NÃO foi metade)`, t: 'money', showIf: notConsig },
    { note: 'entnote' },
    { k: 'anun', label: 'Preço de anúncio', t: 'money' },
    { g: 'Onde está' },
    { k: 'loc', label: 'Onde está agora', t: 'sel', opts: locOpts, blank: 'Não informado', showIf: notSold },
    { k: 'locdet', label: 'Qual oficina / funilaria', t: 'text', showIf: notSold },
    { k: 'locdesde', label: 'No local desde', t: 'date', showIf: notSold, hint: 'No Pátio / Loja, vazio = data da compra.' }, { k: 'locprev', label: 'Previsão de saída', t: 'date', showIf: notSold },
    { note: 'entregue', showIf: isSold },
    { k: 'status', label: 'Status', t: 'sel', opts: listOpts('status'), req: true },
    { g: 'Venda', showIf: isSold },
    { k: 'dvenda', label: 'Data da venda', t: 'date', showIf: isSold },
    { k: 'vvenda', label: 'Valor total da venda (dinheiro + carro de troca)', t: 'money', showIf: isSold },
    { k: 'quemrec', label: 'Quem ficou com o dinheiro', t: 'sel', opts: partnerOpts, blank: 'Metade cada (padrão)', showIf: isSold },
    { k: 'comprador', label: 'Comprador', t: 'text', showIf: isSold },
    { g: 'Divisão do lucro' },
    { k: 'divis', label: 'Como dividir o lucro deste carro', t: 'sel', opts: listOpts('divis'), blank: '50/50 (padrão)', full: true, hint: 'Em carro consignado, é a divisão da comissão. Para uma pessoa ficar com tudo, use Personalizado com 100% ou 0%.' },
    { k: 'pcust', label: `% do lucro de ${names().A}`, t: 'pct', showIf: (v) => v.divis === 'Personalizado' },
  ], defaults: () => ({ status: 'Em estoque', dcompra: today() }) },
  expense: { col: 'expenses', title: 'gasto', fields: () => [
    { k: 'carId', label: 'Carro', t: 'car', req: true, full: true },
    { k: 'date', label: 'Data', t: 'date', req: true }, { k: 'valor', label: 'Valor', t: 'money', req: true },
    { k: 'cat', label: 'Categoria', t: 'sel', opts: listOpts('cats'), req: true }, { k: 'quem', label: 'Quem gastou', t: 'sel', opts: partnerOpts, req: true },
    { k: 'desc', label: 'Descrição', t: 'text', full: true }, { k: 'obs', label: 'Observação', t: 'text', full: true },
  ], defaults: () => ({ date: today() }) },
  planned: { col: 'planned', title: 'gasto previsto', fields: () => [
    { k: 'carId', label: 'Carro', t: 'car', req: true, full: true },
    { k: 'valor', label: 'Valor previsto', t: 'money', req: true }, { k: 'prazo', label: 'Prazo', t: 'date' },
    { k: 'cat', label: 'Categoria', t: 'sel', opts: listOpts('cats'), req: true }, { k: 'quem', label: 'Quem vai pagar', t: 'sel', opts: partnerOpts, blank: 'Ainda não definido' },
    { k: 'status', label: 'Status', t: 'sel', opts: listOpts('pstatus'), req: true },
    { k: 'desc', label: 'Descrição', t: 'text', full: true },
  ], defaults: () => ({ status: 'Pendente' }) },
  receipt: { col: 'receipts', title: 'recebimento', fields: () => [
    { k: 'carId', label: 'Carro', t: 'car', req: true, full: true },
    { k: 'label', label: 'Parcela (ex.: Entrada, 1/5)', t: 'text' }, { k: 'due', label: 'Vencimento', t: 'date', req: true },
    { k: 'valor', label: 'Valor', t: 'money', req: true }, { k: 'status', label: 'Situação', t: 'sel', opts: listOpts('rstatus'), req: true },
    { k: 'paidAt', label: 'Recebido em', t: 'date', showIf: (v) => v.status === 'Recebido' },
    { k: 'quem', label: 'Quem ficou com o dinheiro', t: 'sel', opts: partnerOpts, blank: 'Regra do carro (padrão)' },
    { k: 'obs', label: 'Observação', t: 'text', full: true },
  ], defaults: () => ({ status: 'Pendente', due: today() }) },
  pay: { col: 'payments', title: 'pagamento', fields: () => [
    { k: 'date', label: 'Data em que pagou', t: 'date', req: true }, { k: 'valor', label: 'Valor que pagou', t: 'money', req: true, hint: 'Pagou só uma parte? Digite o que entrou. O que faltar continua em aberto.' },
    { k: 'quem', label: 'Quem ficou com o dinheiro', t: 'sel', opts: partnerOpts, blank: 'Regra da parcela / do carro (padrão)', full: true },
    { k: 'obs', label: 'Observação', t: 'text', full: true },
  ], defaults: () => ({ date: today() }) },
  repasse: { col: 'repasses', title: 'repasse ao dono', fields: () => [
    { k: 'date', label: 'Data do repasse', t: 'date', req: true }, { k: 'valor', label: 'Valor repassado', t: 'money', req: true },
    { k: 'quem', label: 'Quem pagou o dono', t: 'sel', opts: partnerOpts, blank: 'Quem ficou com o dinheiro da venda (padrão)', full: true },
    { k: 'obs', label: 'Observação', t: 'text', full: true },
  ], defaults: () => ({ date: today() }) },
  loan: { col: 'loans', title: 'empréstimo', fields: () => [
    { k: 'credor', label: 'De quem pegamos', t: 'text', req: true, hint: 'Ex.: Mãe, Nubank, Banco Inter.' }, { k: 'valor', label: 'Valor emprestado', t: 'money', req: true },
    { k: 'data', label: 'Data em que o dinheiro entrou', t: 'date', req: true }, { k: 'carId', label: 'Carro comprado com esse dinheiro', t: 'car', blank: 'Nenhum / vários' },
    { k: 'modo', label: 'Como vamos pagar', t: 'sel', opts: listOpts('loanModes'), req: true, full: true, hint: 'Juros mensais: paga só os juros todo mês e devolve o valor inteiro no vencimento. Parcelado: parcelas iguais com juros (ex.: Nubank em 2x).' },
    { k: 'jurosMes', label: 'Juros por mês em R$', t: 'money', showIf: isJurosMes, hint: 'Ex.: R$ 2.000,00. Ou preencha a % ao lado.' },
    { k: 'taxaMes', label: 'Juros por mês em %', t: 'pct', hint: 'Ex.: 5,8. No parcelado, calcula as parcelas (tabela Price).' },
    { k: 'nParc', label: 'Número de parcelas', t: 'int', showIf: isParcelado },
    { k: 'venc', label: 'Vencimento', t: 'date', hint: 'Juros mensais: quando devolvemos o valor. Parcelado: 1º vencimento (vazio = 1 mês depois).' },
    { k: 'quem', label: 'Quem paga', t: 'sel', opts: partnerOpts, blank: 'Metade cada (padrão)' },
    { k: 'obs', label: 'Finalidade (para que foi o dinheiro)', t: 'text', full: true, hint: 'Ex.: comprar a Kombi. Com o carro escolhido acima, o app acompanha as trocas: se a Kombi for vendida e entrar um Celta, o dinheiro passa a estar no Celta.' },
  ], defaults: () => ({ data: today(), modo: 'Juros mensais' }) },
  payable: { col: 'payables', title: 'conta a pagar', fields: () => [
    { k: 'label', label: 'Parcela', t: 'text' }, { k: 'due', label: 'Vencimento', t: 'date', req: true },
    { k: 'valor', label: 'Valor', t: 'money', req: true }, { k: 'forma', label: 'Forma de pagamento', t: 'sel', opts: listOpts('formasPag'), blank: 'Não informada' },
    { k: 'quem', label: 'Quem paga', t: 'sel', opts: partnerOpts, blank: 'Metade cada (padrão)' }, { k: 'credor', label: 'A quem pagamos', t: 'text' },
    { k: 'status', label: 'Situação', t: 'sel', opts: listOpts('paystatus'), req: true },
    { k: 'paidAt', label: 'Pago em', t: 'date', showIf: (v) => v.status === 'Pago' },
    { k: 'obs', label: 'Observação', t: 'text', full: true },
  ] },
  move: { col: 'cars', title: 'Mover carro', fields: () => [
    { k: 'loc', label: 'Onde está agora', t: 'sel', opts: locOpts, req: true, full: true },
    { k: 'locdet', label: 'Qual oficina / funilaria', t: 'text', full: true },
    { k: 'locdesde', label: 'No local desde', t: 'date' }, { k: 'locprev', label: 'Previsão de saída', t: 'date' },
  ] },
};

const valued = (mode) => F[mode].fields().filter((f) => f.k);

function inputValue(f, v) {
  if (v == null) return '';
  if (f.t === 'money') return moneyField(v);
  if (f.t === 'pct') return String(Math.round(v * 1000) / 10).replace('.', ',');
  return String(v);
}

function control(f, v, selfId) {
  const id = 'f_' + f.k, val = inputValue(f, v);
  if (f.t === 'sel' || f.t === 'car') {
    const opts = f.t === 'car' ? liveCars().filter((c) => c.id !== selfId).map((c) => [String(c.id), c.name]) : f.opts().map(([a, b]) => [a, b]);
    let h = `<select id="${id}">`;
    if (!f.req) h += `<option value="">${esc(f.blank || '—')}</option>`;
    else if (!val) h += '<option value="">Escolha…</option>';
    for (const [k, label] of opts) h += `<option value="${esc(k)}"${k === val ? ' selected' : ''}>${esc(label)}</option>`;
    return h + '</select>';
  }
  if (f.t === 'date') return `<input type="date" id="${id}" value="${esc(val)}">`;
  const im = f.t === 'money' ? ' inputmode="decimal" data-money placeholder="R$ 0,00"' : f.t === 'pct' ? ' inputmode="decimal"' : f.t === 'int' ? ' inputmode="numeric"' : '';
  const up = f.upper ? ' style="text-transform:uppercase" autocapitalize="characters" spellcheck="false"' : '';
  return `<input type="text" id="${id}" value="${esc(val)}"${im}${up} autocomplete="off">`;
}

function readForm(mode) {
  const vals = {};
  let bad = null;
  for (const f of valued(mode)) {
    const el = $('#f_' + f.k);
    if (!el) continue;
    if (f.t === 'chk') { vals[f.k] = el.checked ? 1 : 0; continue; }
    const raw = el.value.trim();
    let v;
    if (raw === '') v = null;
    else if (f.t === 'money') { v = parseMoney(raw); if (isNaN(v)) bad = bad || `Valor inválido em "${f.label}".`; }
    else if (f.t === 'pct') { v = parseMoney(raw); if (isNaN(v) || v < 0 || v > 100) bad = bad || `Use um percentual entre 0 e 100 em "${f.label}".`; else v = v / 100; }
    else if (f.t === 'int') { v = /^\d{1,3}([.\s]\d{3})+$/.test(raw) ? parseInt(raw.replace(/[.\s]/g, ''), 10) : Number(raw); // "85.000" = 85000
      if (!Number.isInteger(v)) v = NaN; if (isNaN(v)) bad = bad || `Número inválido em "${f.label}".`; }
    else if (f.t === 'car') v = Number(raw);
    else v = f.upper ? raw.toUpperCase() : raw;
    vals[f.k] = v;
  }
  return { vals, bad };
}

export function closeModal() {
  const m = $('#modal');
  m.hidden = true; m.innerHTML = ''; m.onclick = null; m.oninput = null; m.onchange = null;
}

function wireClose(m) {
  m.onclick = (ev) => { if (ev.target === m || ev.target.getAttribute?.('data-x') === 'cancel') closeModal(); };
}

export function openForm(mode, existing, opts = {}) {
  if (!S.canWrite) { toast('Seu perfil é só de leitura.'); return; }
  if ((mode === 'expense' || mode === 'planned') && !liveCars().length) { toast('Cadastre um carro primeiro.'); return; }
  const def = F[mode];
  let init;
  if (existing) {
    init = { ...existing };
    if (mode === 'move') { init.locdesde = today(); init.locdet = ''; init.locprev = ''; }
  } else init = { ...(def.defaults ? def.defaults() : {}), ...(opts.prefill || {}) };
  const selfId = existing && def.col === 'cars' ? existing.id : -1;

  let h = `<form class="sheet" id="form" novalidate><h2>${esc(opts.heading || def.heading || (existing ? (mode === 'move' ? 'Mover carro' : 'Editar ' + def.title) : 'Novo ' + def.title))}</h2><div class="fgrid">`;
  for (const f of def.fields()) {
    if (f.g) { h += `<div class="grp" data-g="${esc(f.g)}">${esc(f.g)}</div>`; continue; }
    if (f.lookup) {
      h += `<div class="field full plk"><div class="plk-row">${S.placa ? '<button type="button" class="btn" id="plbtn">Consultar placa e FIPE</button>' : ''}<button type="button" class="btn" id="fpbtn">Buscar valor na tabela FIPE (grátis)</button></div>` +
        `<div id="plres" aria-live="polite"></div>` +
        `<div id="fpbox" class="plres" hidden><div class="fgrid"><div class="field"><label for="fp_marca">Marca</label><select id="fp_marca"></select></div>` +
        `<div class="field"><label for="fp_busca">Modelo (digite para filtrar)</label><input type="text" id="fp_busca" placeholder="ex.: onix 1.0" autocomplete="off"></div>` +
        `<div class="field full"><select id="fp_modelo" size="6" aria-label="Modelo"></select></div>` +
        `<div class="field full"><label for="fp_ano">Ano e combustível</label><select id="fp_ano"></select></div></div><div id="fp_res" aria-live="polite"></div></div></div>`;
      continue;
    }
    if (f.note === 'entregue') { h += '<div class="field full hint" data-k="_entregue">Carro vendido: o local passa a ser <b>Entregue</b>.</div>'; continue; }
    if (f.note) { h += '<div class="field full hint" id="entnote"></div>'; continue; }
    if (f.t === 'chk') { h += `<div class="field chk" data-k="${f.k}"><label><input type="checkbox" id="f_${f.k}"${init[f.k] ? ' checked' : ''}> ${esc(f.label)}</label></div>`; continue; }
    h += `<div class="field${f.full ? ' full' : ''}" data-k="${f.k}"><label for="f_${f.k}">${esc(f.label)}${f.req ? ' *' : ''}</label>${control(f, init[f.k], selfId)}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
  }
  h += '</div><div class="err" id="ferr" role="alert"></div><div class="acts"><button type="button" class="btn" data-x="cancel">Cancelar</button><button type="submit" class="btn pri" id="fsave">Salvar</button></div></form>';
  const m = $('#modal');
  m.innerHTML = h; m.hidden = false;

  const refresh = () => {
    const cur = {};
    for (const f of valued(mode)) { const el = $('#f_' + f.k); if (el) cur[f.k] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value; }
    for (const f of def.fields()) {
      if (!f.showIf) continue;
      const show = !!f.showIf(cur);
      const node = f.g ? $(`.grp[data-g="${f.g}"]`) : $(`.field[data-k="${f.k || '_' + f.note}"]`);
      if (node) node.hidden = !show;
    }
    const en = $('#entnote');
    if (en) {
      let eT = parseMoney(cur.entT), oA = parseMoney(cur.ovrA), oB = parseMoney(cur.ovrB);
      [eT, oA, oB] = [eT, oA, oB].map((x) => (Number.isNaN(x) ? null : x));
      if (isConsig(cur)) en.textContent = '';
      else if (eT != null || oA != null || oB != null) {
        const e = Calc.entry({ entT: eT, ovrA: oA, ovrB: oB });
        en.textContent = `Entrada de ${names().A}: ${brl(e.A)} · Entrada de ${names().B}: ${brl(e.B)}`;
      } else en.textContent = '';
    }
  };
  m.oninput = (ev) => {
    const el = ev.target;
    if (el && el.id === 'f_placa') { const p = el.selectionStart; el.value = el.value.toUpperCase(); try { el.setSelectionRange(p, p); } catch { /* campo sem seleção */ } }
    refresh();
  };
  m.onchange = refresh; refresh();
  const first = $('#form input[type=text], #form select');
  if (first) first.focus();
  wireClose(m);
  wireLookups(refresh);

  let saving = false;
  $('#form').onsubmit = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    const r = readForm(mode);
    let err = r.bad;
    if (!err) {
      for (const f of valued(mode)) {
        const el = $('#f_' + f.k);
        const vis = el && !el.closest('[hidden]');
        if (f.req && vis && (r.vals[f.k] == null || r.vals[f.k] === '')) { err = `Preencha "${f.label}".`; break; }
      }
    }
    if (!err && mode === 'car' && r.vals.dono && r.vals.repasse == null && !r.vals.origemId) err = 'Informe o repasse ao dono (o valor mínimo que precisa ir para ele).';
    if (!err && mode === 'car' && r.vals.status === 'Vendido' && r.vals.vvenda == null) err = 'Para marcar como vendido, informe o valor total da venda.';
    if (err) { $('#ferr').textContent = err; return; }
    // Campos escondidos (ex.: dados da venda de um carro que voltou para o estoque) não são enviados.
    const send = {};
    for (const f of valued(mode)) {
      const el = $('#f_' + f.k);
      if (!el) continue;
      const hidden = el.closest('[hidden]');
      if (hidden && !existing) continue;
      send[f.k] = r.vals[f.k];
    }
    if (mode === 'car' && send.status === 'Vendido' && !send.dvenda) send.dvenda = today(); // sem data informada, vale hoje
    if (mode === 'receipt') { if (send.status === 'Pendente') send.paidAt = null; else if (!send.paidAt) send.paidAt = today(); }
    if (mode === 'payable') { if (send.status === 'Pendente') send.paidAt = null; else if (!send.paidAt) send.paidAt = today(); }
    if (mode === 'loan' && send.modo === 'Juros mensais' && send.jurosMes == null && send.taxaMes == null) { $('#ferr').textContent = 'Informe os juros por mês, em R$ ou em %.'; return; }
    if (opts.extra) Object.assign(send, opts.extra);
    saving = true; $('#fsave').disabled = true;
    try {
      if (!existing) {
        const res = await api('POST', '/api/' + def.col, send);
        toast('Salvo.');
        await hooks.reload();
        if (opts.afterSave) opts.afterSave(res.item);
      } else {
        const body = mode === 'move' ? { _action: 'move', ...send } : send;
        const res = await api('PATCH', `/api/${def.col}/${existing.id}`, body);
        toast(res.changed ? 'Alteração salva.' : 'Nada mudou.');
        await hooks.reload();
      }
      closeModal();
      if (opts.onDone) opts.onDone();
    } catch (e) {
      $('#ferr').textContent = e.message;
      saving = false; $('#fsave').disabled = false;
    }
  };
}

const putField = (k, v, onlyEmpty) => {
  const el = $('#f_' + k);
  if (!el || v == null || v === '' || (onlyEmpty && el.value.trim())) return;
  el.value = el.hasAttribute('data-money') ? moneyField(v) : String(v);
};
/** Como putField, mas sem valor limpa o campo (placa nova: o dado antigo era de outro carro). */
const setField = (k, v) => {
  const el = $('#f_' + k);
  if (!el) return;
  if (v == null || v === '') el.value = ''; else putField(k, v);
};
function applyFipe(o, refresh, clear) {
  const ref = o ? [o.referencia, o.codigo && 'cód. ' + o.codigo].filter(Boolean).join(' · ') : null;
  if (clear) { setField('fipe', o ? o.valor : null); setField('fipeRef', ref); } else { putField('fipe', o ? o.valor : null); putField('fipeRef', ref); }
  refresh();
}

/** Botões do cadastro do carro: consulta por placa (paga, se ativada) e tabela FIPE gratuita (marca > modelo > ano). */
function wireLookups(refresh) {
  wirePlateLookup(refresh);
  wireFipePicker(refresh);
}

function wirePlateLookup(refresh) {
  const btn = $('#plbtn'), out = $('#plres');
  if (!btn) return;
  const show = (d) => {
    const sub = [d.ano, d.cor, [d.municipio, d.uf].filter(Boolean).join('/'), d.situacao].filter(Boolean).map(esc).join(' · ');
    const opts = d.fipe.map((o, i) => `<option value="${i}">${esc(brl(o.valor))} — ${esc(o.modelo || '')}${o.anoModelo ? ' ' + o.anoModelo : ''}</option>`).join('');
    out.innerHTML = `<div class="plres"><b>${esc(d.nome)}</b><span class="mut small">${sub}</span>` +
      (d.fipe.length ? `<label class="small" for="plfipe">Valor FIPE${d.fipe.length > 1 ? ' (há mais de uma versão parecida, escolha a certa)' : ''}</label><select id="plfipe">${opts}</select>`
        : '<span class="small">A consulta não trouxe valor FIPE para esta placa. Use a busca na tabela FIPE ou digite à mão.</span>') +
      `<span class="mut small">${d.cache ? 'Consulta guardada de ' + esc(stamp(d.consultadoEm)) : 'Consulta feita agora'} · <button type="button" class="linkbtn" id="plagain">consultar de novo</button></span></div>`;
    const sel = $('#plfipe');
    if (sel) sel.onchange = () => applyFipe(d.fipe[Number(sel.value)], refresh);
    $('#plagain').onclick = () => go(true);
  };
  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const PLACA_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
  let last = norm($('#f_placa').value); // placa já cadastrada: abrir a edição não consulta de novo
  let seq = 0;
  async function go(fresh) {
    const placa = $('#f_placa').value.trim();
    if (!placa) { out.innerHTML = '<span class="err">Digite a placa primeiro.</span>'; return; }
    const my = ++seq;
    last = norm(placa);
    btn.disabled = true; out.innerHTML = '<span class="mut small">Consultando…</span>';
    try {
      const d = await api('GET', `/api/placa/${encodeURIComponent(placa)}${fresh ? '?fresh=1' : ''}`);
      if (my !== seq || norm($('#f_placa').value) !== d.placa) return; // a placa mudou enquanto consultava
      // Placa consultada manda: modelo, ano, cor e FIPE são trocados pelos dela.
      putField('placa', d.placa); putField('name', d.nome); setField('marca', marcaNome(d.marca)); setField('ano', d.ano); setField('cor', d.cor);
      applyFipe(d.fipe[0], refresh, true);
      show(d);
    } catch (e) {
      if (my !== seq) return;
      // A FIPE antiga era de outra placa: não deixa ela ir junto.
      applyFipe(null, refresh, true);
      out.innerHTML = `<span class="err">${esc(e.message)}</span><span class="mut small"> Confira modelo e ano à mão.</span>`;
    } finally {
      if (my === seq) btn.disabled = false;
    }
  }
  btn.onclick = () => go(false);
  // Digitou a placa completa (ou colou): consulta sozinho, sem precisar do botão.
  $('#f_placa').addEventListener('input', () => {
    const p = norm($('#f_placa').value);
    if (PLACA_RE.test(p) && p !== last) go(false);
  });
}

function wireFipePicker(refresh) {
  const toggle = $('#fpbtn'), box = $('#fpbox');
  if (!toggle) return;
  let marcas = [], modelos = [], anos = [];
  const res = $('#fp_res');
  const say = (t, bad) => { res.innerHTML = t ? `<span class="${bad ? 'err' : 'mut small'}">${esc(t)}</span>` : ''; };
  const opts = (arr, ph) => `<option value="">${esc(ph)}</option>` + arr.map((x) => `<option value="${esc(x.code)}">${esc(x.name)}</option>`).join('');
  const list = async (path) => (await api('GET', '/api/fipe' + path)).items;
  const renderModelos = () => {
    const words = $('#fp_busca').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const found = modelos.filter((m) => words.every((w) => m.name.toLowerCase().includes(w)));
    $('#fp_modelo').innerHTML = found.slice(0, 300).map((m) => `<option value="${esc(m.code)}">${esc(m.name)}</option>`).join('');
    say(found.length ? (found.length > 300 ? 'Mostrando 300 de ' + found.length + ' modelos: digite mais para filtrar.' : found.length + ' modelo(s).') : 'Nenhum modelo com esse nome.');
  };
  const guard = async (fn) => { try { await fn(); } catch (e) { say(e.message, true); } };

  toggle.onclick = () => guard(async () => {
    box.hidden = !box.hidden;
    if (box.hidden || marcas.length) return;
    say('Carregando marcas…');
    marcas = await list('/marcas');
    $('#fp_marca').innerHTML = opts(marcas, 'Escolha a marca');
    say('');
  });
  $('#fp_marca').onchange = () => guard(async () => {
    modelos = []; anos = []; $('#fp_modelo').innerHTML = ''; $('#fp_ano').innerHTML = '';
    const b = $('#fp_marca').value;
    if (!b) return;
    say('Carregando modelos…');
    modelos = await list(`/marcas/${b}/modelos`);
    renderModelos();
  });
  $('#fp_busca').oninput = renderModelos;
  $('#fp_busca').onkeydown = (ev) => { if (ev.key === 'Enter') ev.preventDefault(); };
  $('#fp_modelo').onchange = () => guard(async () => {
    $('#fp_ano').innerHTML = '';
    const b = $('#fp_marca').value, m = $('#fp_modelo').value;
    if (!b || !m) return;
    say('Carregando anos…');
    anos = await list(`/marcas/${b}/modelos/${m}/anos`);
    $('#fp_ano').innerHTML = opts(anos, 'Escolha o ano');
    say(anos.length ? '' : 'Esse modelo não tem anos na tabela.');
  });
  $('#fp_ano').onchange = () => guard(async () => {
    const b = $('#fp_marca').value, m = $('#fp_modelo').value, y = $('#fp_ano').value;
    if (!b || !m || !y) return;
    say('Consultando valor…');
    const o = await api('GET', `/api/fipe/marcas/${b}/modelos/${m}/anos/${encodeURIComponent(y)}`);
    const marca = String(o.marca || '').split(' - ').pop();
    putField('name', [marca, o.modelo].filter(Boolean).join(' '), true);
    putField('marca', marcaNome(marca));
    putField('ano', o.anoModelo, true);
    applyFipe(o, refresh);
    res.innerHTML = `<span class="small"><b>${esc(brl(o.valor))}</b> — ${esc(o.modelo || '')} ${o.anoModelo || ''} ${esc(o.combustivel || '')}<br><span class="mut">Tabela FIPE de ${esc(o.referencia || '—')} · cód. ${esc(o.codigo || '—')}. Já preenchido no cadastro.</span></span>`;
  });
}

export function confirmBox(text, onYes, yesLabel) {
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<div class="sheet"><h2>Confirmar</h2><p style="margin:0">${esc(text)}</p><div class="err" id="cerr" role="alert"></div><div class="acts"><button class="btn" data-x="cancel">Cancelar</button><button class="btn pri" id="cyes">${esc(yesLabel || 'Confirmar')}</button></div></div>`;
  wireClose(m);
  $('#cyes').onclick = async () => {
    $('#cyes').disabled = true;
    try { await onYes(); closeModal(); } catch (e) { $('#cerr').textContent = e.message; $('#cyes').disabled = false; }
  };
}

/* ---------- programar recebimento (à vista, a prazo, parcelado) ---------- */
const round2 = (v) => Math.round(v * 100) / 100;
const PRAZOS = [30, 45, 60, 90, 120];
const PARCELAS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 24, 36];

export function openPlanForm(carId, onDone) {
  const d = S.D[carId];
  if (!d || !d.vendido || d.cash == null) { toast('Marque o carro como vendido, com o valor da venda, antes de programar o recebimento.'); return; }
  // Parcelas que já receberam algo (inteiras ou em parte) ficam como estão; só as sem pagamento são refeitas.
  const mantidas = d.parcelas.filter((p) => p.pago > 0.004).reduce((a, p) => a + Calc.num(p.r.valor), 0);
  const falta = round2(Math.max(0, d.cash - mantidas));
  const opt = (arr, fmt) => arr.map((x) => `<option value="${x}">${fmt(x)}</option>`).join('');
  const m = $('#modal');
  m.hidden = false;
  m.innerHTML = `<form class="sheet wide" id="plan" novalidate><h2>Programar recebimento — ${esc(d.c.name)}</h2>
    <p class="mut small" style="margin:0">Venda de ${brl(Calc.num(d.c.vvenda))}${d.troca > 0 ? `, com ${brl(d.troca)} em carro de troca` : ''}. Aqui você define como o <b>dinheiro</b> (${brl(d.cash)}) entra.${d.nParc > 0 ? ' As parcelas ainda sem pagamento serão substituídas; as que já receberam algo (mesmo em parte) ficam.' : ''}</p>
    <div class="fgrid">
      <div class="field"><label for="pl_mode">Forma de recebimento</label><select id="pl_mode"><option value="vista">À vista</option><option value="prazo">A prazo (um pagamento depois)</option><option value="parcelado" selected>Parcelado</option></select></div>
      <div class="field"><label for="pl_total">Valor a programar</label><input type="text" id="pl_total" inputmode="decimal" data-money value="${esc(moneyField(falta))}"></div>
      <div class="field"><label for="pl_base">Data da venda</label><input type="date" id="pl_base" value="${esc(d.c.dvenda || today())}"></div>
      <div class="field" data-for="prazo parcelado"><label for="pl_ent">Entrada recebida na hora (pix)</label><input type="text" id="pl_ent" inputmode="decimal" data-money placeholder="R$ 0,00"></div>
      <div class="field" data-for="prazo"><label for="pl_dias">Prazo</label><select id="pl_dias">${opt(PRAZOS, (x) => x + ' dias')}<option value="outro">Outro…</option></select></div>
      <div class="field" data-for="prazo"><label for="pl_dias2">Prazo em dias (se "Outro")</label><input type="text" id="pl_dias2" inputmode="numeric"></div>
      <div class="field" data-for="parcelado"><label for="pl_n">Número de parcelas</label><select id="pl_n">${opt(PARCELAS, (x) => x + 'x')}</select></div>
      <div class="field" data-for="parcelado"><label for="pl_first">Primeiro vencimento</label><input type="date" id="pl_first"><span class="hint">Em branco: 1 mês depois da venda. As demais, mês a mês.</span></div>
      <div class="field full"><label for="pl_quem">Quem ficou com o dinheiro</label><select id="pl_quem"><option value="">Regra do carro (padrão)</option>${partnerOpts().map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
    </div>
    <div id="pl_prev"></div><div class="err" id="ferr" role="alert"></div>
    <div class="acts"><button type="button" class="btn" data-x="cancel">Cancelar</button><button class="btn pri" type="submit" id="fsave">Programar</button></div></form>`;
  $('#pl_n').value = '3';

  const read = () => {
    const mode = $('#pl_mode').value;
    const total = parseMoney($('#pl_total').value), ent = parseMoney($('#pl_ent').value);
    const diasSel = $('#pl_dias').value;
    const dias = diasSel === 'outro' ? parseInt($('#pl_dias2').value, 10) : parseInt(diasSel, 10);
    return { mode, total, ent: ent == null || Number.isNaN(ent) ? 0 : ent, dias, n: parseInt($('#pl_n').value, 10), base: $('#pl_base').value, first: $('#pl_first').value };
  };
  const parts = () => {
    const r = read();
    if (!r.base || r.total == null || Number.isNaN(r.total) || r.total <= 0) return [];
    return Calc.plan({ total: r.total, base: r.base, mode: r.mode, entrada: r.ent, prazoDias: Number.isNaN(r.dias) ? 0 : r.dias, n: r.n, primeiro: r.first || null });
  };
  const refresh = () => {
    const mode = $('#pl_mode').value;
    m.querySelectorAll('[data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(mode); });
    const outro = $('#pl_dias').value === 'outro';
    const f2 = $('#pl_dias2').closest('.field'); if (mode === 'prazo') f2.hidden = !outro;
    const ps = parts();
    const sum = round2(ps.reduce((a, p) => a + p.valor, 0));
    $('#pl_prev').innerHTML = ps.length
      ? `<div class="tbl"><table class="compact" style="min-width:0"><thead><tr><th>Parcela</th><th>Vencimento</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>${ps.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${dmy(p.due)}</td><td class="r num">${brl(p.valor)}</td><td>${p.status === 'Recebido' ? 'Recebido' : 'A receber'}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2"><b>Total</b></td><td class="r num"><b>${brl(sum)}</b></td><td></td></tr></tfoot></table></div>`
      : '<p class="mut small" style="margin:0">Preencha o valor e a data para ver as parcelas.</p>';
  };
  m.oninput = refresh; m.onchange = refresh; refresh();
  m.onclick = (ev) => { if (ev.target === m || ev.target.getAttribute?.('data-x') === 'cancel') closeModal(); };
  $('#pl_total').focus();

  let saving = false;
  $('#plan').onsubmit = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    const ps = parts();
    const r = read();
    if (!ps.length) { $('#ferr').textContent = 'Informe o valor a programar e a data da venda.'; return; }
    if (r.mode === 'prazo' && (Number.isNaN(r.dias) || r.dias < 0)) { $('#ferr').textContent = 'Informe o prazo em dias.'; return; }
    const quem = $('#pl_quem').value || null;
    saving = true; $('#fsave').disabled = true;
    try {
      await api('POST', `/api/cars/${carId}/plan`, { parts: ps.map((p) => ({ ...p, quem })) });
      toast('Recebimento programado.');
      await hooks.reload();
      closeModal();
      if (onDone) onDone();
    } catch (e) {
      $('#ferr').textContent = e.message; saving = false; $('#fsave').disabled = false;
    }
  };
}
