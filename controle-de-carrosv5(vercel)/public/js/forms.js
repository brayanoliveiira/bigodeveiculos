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
/** Nome do local e previsão de saída só fazem sentido fora do pátio (oficina, funilaria, despachante...). */
const temLocal = (v) => !!v.loc && v.loc !== 'Pátio / Loja';
/** "Quem pagou o carro" está em "Outra divisão" (mostra quanto cada sócio pagou). */
const splitCustom = () => { const e = document.getElementById('cp_split'); return !!e && e.value === 'custom'; };
const temHist = (v) => !!(v.leilao || v.sinistro);
const isJurosMes = (v) => v.modo === 'Juros mensais';
const isParcelado = (v) => v.modo === 'Parcelado';
const isLivre = (v) => v.modo === 'Personalizado';
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
    { k: 'dcompra', label: 'Data da compra', t: 'date', hint: 'Ou de quando o carro chegou.' },
    { k: 'entT', label: 'Valor da compra', t: 'money', hint: 'Quanto o carro custou. Carro de troca que fica com o dono do consignado: o valor em que entrou na troca.', showIf: (v) => notConsig(v) || !!v.origemId },
    { k: 'dono', label: 'Carro de terceiro? Dono do carro', t: 'text', full: true, hint: 'Deixe vazio se o carro é nosso. Preenchido = consignado: ninguém paga pelo carro, ele só fica aqui para vender.' },
    { k: 'repasse', label: 'Repasse ao dono (valor mínimo)', t: 'money', full: true, showIf: isConsig, hint: 'Quanto precisa ir para o dono. Os gastos do carro saem do valor da venda e o que sobrar é a comissão.' },
    { split: true },
    { k: 'ovrA', label: `Quanto ${names().A} pagou`, t: 'money', showIf: (v) => notConsig(v) && splitCustom() },
    { k: 'ovrB', label: `Quanto ${names().B} pagou`, t: 'money', showIf: (v) => notConsig(v) && splitCustom() },
    { compra: true },
    { k: 'origemId', label: 'Veio de troca em qual carro nosso?', t: 'car', blank: 'Não veio de troca', full: true, hint: 'Se este carro entrou como pagamento de uma venda, escolha o carro vendido. Para o carro de troca que fica com o dono de um consignado: preencha o mesmo Dono acima, deixe o repasse em branco e escolha aqui o carro consignado vendido.' },
    { k: 'anun', label: 'Preço de anúncio', t: 'money' },
    { g: 'Onde está' },
    { k: 'loc', label: 'Onde está agora', t: 'sel', opts: locOpts, blank: 'Não informado', showIf: notSold },
    { k: 'locdet', label: 'Local', t: 'text', showIf: (v) => notSold(v) && temLocal(v), hint: 'Ex.: Oficina do Zé, Funilaria Central.' },
    { k: 'locdesde', label: 'No local desde', t: 'date', showIf: notSold, hint: 'No Pátio / Loja, vazio = data da compra.' }, { k: 'locprev', label: 'Previsão de saída', t: 'date', showIf: (v) => notSold(v) && temLocal(v) },
    { k: 'status', label: 'Status', t: 'sel', opts: listOpts('status'), req: true },
    { g: 'Venda', showIf: isSold },
    { k: 'dvenda', label: 'Data da venda', t: 'date', showIf: isSold },
    { k: 'vvenda', label: 'Valor total da venda', t: 'money', showIf: isSold, hint: 'Dinheiro + carro de troca.' },
    { k: 'quemrec', label: 'Quem ficou com o dinheiro', t: 'sel', opts: () => [...partnerOpts(), ['X', 'Outra divisão']], blank: 'Metade cada (padrão)', showIf: isSold },
    { k: 'recValA', label: `Quanto do dinheiro ficou com ${names().A}`, t: 'money', showIf: (v) => isSold(v) && v.quemrec === 'X', hint: 'O resto do dinheiro fica com o outro sócio.' },
    { k: 'comprador', label: 'Comprador', t: 'text', showIf: isSold },
    { venda: true },
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
    { k: 'modo', label: 'Como vamos pagar', t: 'sel', opts: listOpts('loanModes'), req: true, full: true, hint: 'Juros mensais: paga só os juros todo mês e devolve o valor inteiro no vencimento. Parcelado: parcelas iguais com juros (ex.: Nubank em 2x). Personalizado: você escolhe cada data e valor (já com os juros).' },
    { k: 'jurosMes', label: 'Juros por mês em R$', t: 'money', showIf: isJurosMes, hint: 'Ex.: R$ 2.000,00. A % ao lado é calculada sozinha.' },
    { k: 'taxaMes', label: 'Juros por mês em %', t: 'pct', showIf: (v) => !isLivre(v), hint: 'Ex.: 5,8. Digitou a %? O valor em R$ é calculado sozinho. No parcelado, calcula as parcelas (tabela Price).' },
    { k: 'nParc', label: 'Número de parcelas', t: 'int', showIf: isParcelado },
    { k: 'venc1', label: '1º vencimento dos juros', t: 'date', showIf: isJurosMes, hint: 'Os outros meses vencem no mesmo dia. Vazio = 1 mês depois do empréstimo.' },
    { crono: 'lo_crono', showIf: isLivre },
    { k: 'venc', label: 'Vencimento', t: 'date', showIf: (v) => !isLivre(v), hint: 'Juros mensais: dia da devolução (valor + juros do mês). Parcelado: 1º vencimento (vazio = 1 mês depois).' },
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
    { k: 'locdet', label: 'Local', t: 'text', full: true, showIf: temLocal, hint: 'Ex.: Oficina do Zé, Funilaria Central.' },
    { k: 'locdesde', label: 'No local desde', t: 'date' }, { k: 'locprev', label: 'Previsão de saída', t: 'date', showIf: temLocal },
  ] },
};

const valued = (mode) => F[mode].fields().filter((f) => f.k);

function inputValue(f, v) {
  if (v == null) return '';
  if (f.t === 'money') return moneyField(v);
  if (f.t === 'pct') return String(Math.round(v * 10000) / 100).replace('.', ',');
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
    if (def.col === 'cars' && mode === 'car' && !init.quemrec && Calc.num(init.recValA) != null) init.quemrec = 'X'; // outra divisão do dinheiro
    if (opts.vender) { init.status = 'Vendido'; init.dvenda = init.dvenda || today(); } // botão Vender: abre já na venda
    if (mode === 'move') { init.locdesde = today(); init.locdet = ''; init.locprev = ''; }
  } else init = { ...(def.defaults ? def.defaults() : {}), ...(opts.prefill || {}) };
  const selfId = existing && def.col === 'cars' ? existing.id : -1;

  let h = `<form class="sheet" id="form" novalidate><h2>${esc(opts.heading || def.heading || (existing ? (mode === 'move' ? 'Mover carro' : 'Editar ' + def.title) : 'Novo ' + def.title))}</h2><div class="fgrid">`;
  for (const f of def.fields()) {
    if (f.g) { h += `<div class="grp" data-g="${esc(f.g)}">${esc(f.g)}</div>`; continue; }
    if (f.split) { h += splitHtml(init); continue; }
    if (f.crono) { h += cronoHtml(f.crono, `data-k="_${f.crono}" data-pago="${Number(opts.cronoPago) || 0}"`, opts.cronoRows); continue; }
    if (f.venda) { h += vendaHtml(existing); continue; }
    if (f.compra) { h += compraHtml(existing); continue; }
    if (f.lookup) {
      h += `<div class="field full plk"><div class="plk-row">${S.placa ? '<button type="button" class="btn" id="plbtn">Consultar placa e FIPE</button>' : ''}<button type="button" class="btn" id="fpbtn">Buscar valor na tabela FIPE (grátis)</button></div>` +
        `<div id="plres" aria-live="polite"></div>` +
        `<div id="fpbox" class="plres" hidden><div class="fgrid"><div class="field"><label for="fp_marca">Marca</label><select id="fp_marca"></select></div>` +
        `<div class="field"><label for="fp_busca">Modelo (digite para filtrar)</label><input type="text" id="fp_busca" placeholder="ex.: onix 1.0" autocomplete="off"></div>` +
        `<div class="field full"><select id="fp_modelo" size="6" aria-label="Modelo"></select></div>` +
        `<div class="field full"><label for="fp_ano">Ano e combustível</label><select id="fp_ano"></select></div></div><div id="fp_res" aria-live="polite"></div></div></div>`;
      continue;
    }
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
      const node = f.g ? $(`.grp[data-g="${f.g}"]`) : $(`.field[data-k="${f.k || '_' + (f.note || f.crono)}"]`);
      if (node) node.hidden = !show;
    }
    if (mode === 'car') { compraRefresh(cur); vendaRefresh(cur); }
    if (mode === 'loan') emprestimoSoma(cur);
  };
  m.oninput = (ev) => {
    const el = ev.target;
    if (el && el.id === 'f_placa') { const p = el.selectionStart; el.value = el.value.toUpperCase(); try { el.setSelectionRange(p, p); } catch { /* campo sem seleção */ } }
    if (mode === 'loan' && el) syncJuros(el.id);
    refresh();
  };
  // Empréstimo: juros em R$ e em % andam juntos. O último digitado manda; o outro é calculado sobre o valor emprestado.
  let jurosSrc = existing && Calc.num(existing.jurosMes) == null && Calc.num(existing.taxaMes) != null ? 'pct' : 'brl';
  function syncJuros(id) {
    if (id === 'f_jurosMes') jurosSrc = 'brl'; else if (id === 'f_taxaMes') jurosSrc = 'pct'; else if (id !== 'f_valor') return;
    const v = parseMoney($('#f_valor').value), j = parseMoney($('#f_jurosMes').value), t = parseMoney($('#f_taxaMes').value);
    const ok = (x) => x != null && !Number.isNaN(x);
    if (jurosSrc === 'brl') {
      if (!ok(j)) { if (id === 'f_jurosMes') $('#f_taxaMes').value = ''; return; }
      if (ok(v) && v > 0) $('#f_taxaMes').value = String(Math.round(j / v * 1000) / 10).replace('.', ','); // uma casa: 3,5
    } else {
      if (!ok(t)) { if (id === 'f_taxaMes') $('#f_jurosMes').value = ''; return; }
      if (ok(v) && v > 0) $('#f_jurosMes').value = moneyField(Calc.jurosDaTaxa(v, t / 100)); // reais inteiros, arredondado para cima
    }
  }
  m.onchange = refresh; refresh();
  const first = $('#form input[type=text], #form select');
  if (first) first.focus();
  wireClose(m);
  wireLookups(refresh);
  if (mode === 'car') { wireTrocaPlaca(refresh); if (existing) $('#form').dataset.carId = existing.id; cronoWire($('#cp_crono'), refresh); cronoWire($('#vd_crono'), refresh); }
  if (mode === 'loan') cronoWire($('#lo_crono'), refresh);
  if (opts.vender) { const g = $('.grp[data-g="Venda"]'); if (g) g.scrollIntoView({ block: 'start' }); const vv = $('#f_vvenda'); if (vv) vv.focus({ preventScroll: true }); }

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
    if (mode === 'car' && 'quemrec' in send) { if (send.quemrec === 'X') { send.quemrec = null; if (send.recValA == null) send.recValA = 0; } else send.recValA = null; }
    if (mode === 'receipt') { if (send.status === 'Pendente') send.paidAt = null; else if (!send.paidAt) send.paidAt = today(); }
    if (mode === 'payable') { if (send.status === 'Pendente') send.paidAt = null; else if (!send.paidAt) send.paidAt = today(); }
    if (mode === 'loan' && send.modo === 'Juros mensais' && send.jurosMes == null && send.taxaMes == null) { $('#ferr').textContent = 'Informe os juros por mês, em R$ ou em %.'; return; }
    if (mode === 'car' && !isConsig(r.vals)) {
      if (!splitCustom()) { send.ovrA = null; send.ovrB = null; } // metade cada
      else {
        // vazio vale zero; com prazo, cada um fica com o que pagou na hora + a parte dele no restante
        const d = divisaoCompra(), total = numDe('f_entT') || 0, modo = $('#cp_modo') ? $('#cp_modo').value : '';
        if (!modo && Math.abs(d.pagoA + d.pagoB - total) > 0.004) { $('#ferr').textContent = `A soma do que ${names().A} e ${names().B} pagaram (${brl(d.pagoA + d.pagoB)}) precisa ser igual ao valor da compra (${brl(total)}).`; return; }
        send.ovrA = d.A; send.ovrB = d.B;
      }
    }
    const compra = mode === 'car' && !isConsig(r.vals) ? compraParts() : null;
    if (compra && compra.err) { $('#ferr').textContent = compra.err; return; }
    const venda = mode === 'car' && send.status === 'Vendido' ? vendaDados() : null;
    if (venda && venda.err) { $('#ferr').textContent = venda.err; return; }
    if (venda && venda.troca) send.vvenda = venda.total;
    if (opts.beforeSave) { const e = opts.beforeSave(send); if (e) { $('#ferr').textContent = e; return; } } // lê o que não é campo do item (ex.: pagamentos personalizados)
    if (opts.extra) Object.assign(send, opts.extra);
    saving = true; $('#fsave').disabled = true;
    try {
      if (!existing) {
        const res = await api('POST', '/api/' + def.col, send);
        if (compra) await api('POST', '/api/payables/plan', { carId: res.item.id, parts: compra.parts });
        if (venda) await salvarVenda(res.item.id, venda, send);
        toast(venda && (venda.troca || venda.parts) ? 'Salvo. Venda registrada com troca e recebimentos.' : compra ? 'Salvo. O pagamento do carro foi para Veículos a pagar.' : 'Salvo.');
        await hooks.reload();
        if (opts.afterSave) opts.afterSave(res.item);
      } else {
        const body = mode === 'move' ? { _action: 'move', ...send } : send;
        const res = await api('PATCH', `/api/${def.col}/${existing.id}`, body);
        if (compra) await api('POST', '/api/payables/plan', { carId: existing.id, parts: compra.parts });
        if (venda) await salvarVenda(existing.id, venda, send);
        toast(venda && (venda.troca || venda.parts) ? 'Salvo. Venda registrada com troca e recebimentos.' : compra ? 'Salvo. O pagamento do carro foi para Veículos a pagar.' : res.changed ? 'Alteração salva.' : 'Nada mudou.');
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

/* ---------- pagamentos personalizados (lista livre de data + valor) ---------- */
// Usado onde existe à vista / a prazo / parcelado: compra e venda no cadastro, Programar recebimento e Conta de veículo.
// Ex.: 30 mil numa data, depois 6 parcelas de 4 mil e mais 1 de mil.
const linhaCrono = (due, valor) => `<div class="crono-row"><input type="date" class="cr-due" value="${esc(due || '')}" aria-label="Vencimento"><input type="text" class="cr-val" inputmode="decimal" data-money placeholder="R$ 0,00" value="${esc(valor ? moneyField(valor) : '')}" aria-label="Valor"><button type="button" class="btn sm" data-crono-del>Remover</button></div>`;
/** HTML do editor. `attr` vai no contêiner (ex.: data-cp="livre") para a tela mostrar só no modo Personalizado. */
export function cronoHtml(id, attr, rows) {
  const ini = rows && rows.length ? rows.map((r) => linhaCrono(r.due, r.valor)).join('') : linhaCrono('', '');
  return `<div class="field full crono" id="${id}" ${attr || ''}><label>Pagamentos</label><div class="crono-rows">${ini}</div>
    <div class="crono-acts"><button type="button" class="btn sm" data-crono-add>Adicionar pagamento</button>
    <span class="crono-lote">ou várias de uma vez: <input type="text" class="cr-n" inputmode="numeric" placeholder="6" aria-label="Quantas parcelas"> de <input type="text" class="cr-v" inputmode="decimal" data-money placeholder="R$ 0,00" aria-label="Valor de cada"> a partir de <input type="date" class="cr-d" aria-label="Primeiro vencimento"> <button type="button" class="btn sm" data-crono-lote>Adicionar</button></span></div>
    <div class="hint crono-sum"></div></div>`;
}
/** Liga os botões do editor. onChange redesenha o resumo de quem usa. */
export function cronoWire(box, onChange) {
  if (!box) return;
  box.addEventListener('click', (ev) => {
    const t = ev.target;
    const rows = box.querySelector('.crono-rows');
    if (t.matches('[data-crono-del]')) { t.closest('.crono-row').remove(); if (!rows.children.length) rows.insertAdjacentHTML('beforeend', linhaCrono('', '')); }
    else if (t.matches('[data-crono-add]')) {
      // próxima linha: um mês depois da última, com o mesmo valor
      const last = [...rows.querySelectorAll('.crono-row')].pop();
      const d = last && last.querySelector('.cr-due').value, v = last && parseMoney(last.querySelector('.cr-val').value);
      rows.insertAdjacentHTML('beforeend', linhaCrono(d ? Calc.addMonths(d, 1) : '', v > 0 ? v : ''));
    } else if (t.matches('[data-crono-lote]')) {
      const n = parseInt(box.querySelector('.cr-n').value, 10), v = parseMoney(box.querySelector('.cr-v').value), d = box.querySelector('.cr-d').value;
      if (!(n > 0 && n <= 60) || !(v > 0) || !d) { box.querySelector('.crono-sum').textContent = 'Para adicionar várias: informe quantas, o valor de cada e a data da primeira.'; return; }
      // tira a linha vazia do começo, se houver
      [...rows.querySelectorAll('.crono-row')].forEach((r) => { if (!r.querySelector('.cr-due').value && !parseMoney(r.querySelector('.cr-val').value)) r.remove(); });
      for (let i = 0; i < n; i++) rows.insertAdjacentHTML('beforeend', linhaCrono(Calc.addMonths(d, i), v));
      box.querySelector('.cr-n').value = ''; box.querySelector('.cr-v').value = ''; box.querySelector('.cr-d').value = '';
    } else return;
    onChange();
  });
}
/** Empréstimo personalizado: mostra a soma dos pagamentos e quanto disso é juros. */
function emprestimoSoma(cur) {
  const box = $('#lo_crono');
  if (!box || box.hidden) return;
  // na edição, as parcelas já pagas não aparecem no editor, mas entram na conta
  const pago = Number(box.dataset.pago) || 0, ls = cronoRows(box), soma = round2(pago + ls.reduce((a, r) => a + r.valor, 0)), v = parseMoney(cur.valor) || 0;
  const jaPago = pago > 0 ? ` (${brl(pago)} já pagos)` : '';
  box.querySelector('.crono-sum').innerHTML = !ls.length ? 'Coloque cada pagamento já com os juros.'
    : soma < v ? `Soma ${brl(soma)}${jaPago}: <span class="neg">menos que o valor emprestado (${brl(v)})</span>.`
      : `Soma ${brl(soma)}${jaPago}: ${brl(round2(soma - v))} de juros sobre ${brl(v)}.`;
}
/** Linhas preenchidas (data e valor), em ordem de data. */
export function cronoRows(box) {
  if (!box) return [];
  return [...box.querySelectorAll('.crono-row')].map((r) => ({ due: r.querySelector('.cr-due').value, valor: parseMoney(r.querySelector('.cr-val').value) }))
    .filter((r) => r.due && r.valor > 0).sort((a, b) => a.due.localeCompare(b.due));
}
/**
 * Plano no mesmo formato de Calc.plan (entrada como 'Recebido'), a partir das linhas do editor.
 * Devolve { rows } ou { err } quando a soma não fecha com o que falta programar.
 */
export function planoLivre(box, { total, base, entrada }) {
  const ls = cronoRows(box), ent = Math.max(0, entrada || 0), falta = round2(total - ent);
  const soma = round2(ls.reduce((a, r) => a + r.valor, 0));
  const sumEl = box && box.querySelector('.crono-sum');
  if (sumEl) sumEl.innerHTML = ls.length ? `Soma ${brl(soma)} de ${brl(falta)}${Math.abs(soma - falta) > 0.004 ? (soma < falta ? `: faltam ${brl(round2(falta - soma))}` : `: passou ${brl(round2(soma - falta))}`) : ', fechou.'}` : '';
  if (!ls.length) return { err: 'Adicione os pagamentos (data e valor).' };
  if (Math.abs(soma - falta) > 0.004) return { err: `Os pagamentos somam ${brl(soma)}, mas o valor a programar é ${brl(falta)}.` };
  const rows = [];
  if (ent > 0) rows.push({ label: 'Entrada', due: base, valor: round2(ent), status: 'Recebido', paidAt: base });
  ls.forEach((r, i) => rows.push({ label: `${i + 1}/${ls.length}`, due: r.due, valor: round2(r.valor), status: 'Pendente', paidAt: null }));
  return { rows };
}

/* ---------- compra a prazo (dentro do cadastro do carro) ---------- */
const CP_PRAZOS = [30, 45, 60, 90];
const CP_PARCELAS = [2, 3, 4, 5, 6, 8, 10, 12];
/** "Quem pagou o carro": metade cada (padrão) ou outra divisão, que mostra quanto cada sócio pagou. */
function splitHtml(init) {
  const custom = Calc.num(init.ovrA) != null || Calc.num(init.ovrB) != null;
  return `<div class="field" id="cp_splitf"><label for="cp_split">Quem pagou o carro</label><select id="cp_split"><option value="">Metade cada</option><option value="custom"${custom ? ' selected' : ''}>Outra divisão</option></select></div>`;
}
/** "Como vamos pagar": à vista, a prazo ou parcelado, no mesmo fluxo da compra. Carro que já tem pagamento programado só mostra o atalho. */
function compraHtml(existing) {
  const tem = existing && (S.payables || []).some((p) => !p.deleted && p.carId === existing.id && p.origem === 'Carro');
  const resumo = '<div class="field full cp-prev" id="cp_prev"></div>';
  if (tem) return `<div class="field" data-cpbox><label>Como vamos pagar</label><span class="hint">Já tem pagamento programado. <button type="button" class="linkbtn" data-act="dv-parc-car" data-id="${existing.id}">Ver os pagamentos</button></span></div>${resumo}`;
  const opt = (arr, fmt, sel) => arr.map((x) => `<option value="${esc(x)}"${String(x) === String(sel) ? ' selected' : ''}>${esc(fmt(x))}</option>`).join('');
  return `<div class="field" data-cpbox><label for="cp_modo">Como vamos pagar</label><select id="cp_modo"><option value="">À vista</option><option value="prazo">A prazo</option><option value="parcelado">Parcelado</option><option value="livre">Personalizado</option></select></div>
    <div class="field" data-cp="prazo parcelado livre"><label for="cp_ent">Pago na hora</label><input type="text" id="cp_ent" inputmode="decimal" data-money placeholder="R$ 0,00"><span class="hint">Vazio se não pagamos nada na compra.</span></div>
    <div class="field" data-cp="prazo"><label for="cp_prazo">Prazo do restante</label><select id="cp_prazo">${opt(CP_PRAZOS, (x) => x + ' dias', 30)}<option value="data">Data específica</option></select></div>
    <div class="field" data-cp="prazo-data"><label for="cp_data">Data do pagamento</label><input type="date" id="cp_data"></div>
    <div class="field" data-cp="parcelado"><label for="cp_n">Parcelas do restante</label><select id="cp_n">${opt(CP_PARCELAS, (x) => x + 'x', 2)}</select></div>
    <div class="field" data-cp="parcelado"><label for="cp_first">1º vencimento</label><input type="date" id="cp_first"><span class="hint">Vazio: 1 mês depois da compra.</span></div>
    ${cronoHtml('cp_crono', 'data-cp="livre"')}
    <div class="field" data-cp="prazo parcelado livre"><label for="cp_credor">A quem vamos pagar</label><input type="text" id="cp_credor" placeholder="Ex.: João, antigo dono" autocomplete="off"></div>
    <div class="field" data-cp="prazo parcelado livre custom"><label for="cp_quemrest">Quem paga o restante</label><select id="cp_quemrest"><option value="">Os dois (metade cada)</option><option value="A">Só ${esc(names().A)}</option><option value="B">Só ${esc(names().B)}</option><option value="custom">Outra divisão</option></select></div>
    <div class="field row-start" data-cp="prazo parcelado livre custom restcustom"><label for="cp_restA">Quanto ${esc(names().A)} paga do restante</label><input type="text" id="cp_restA" inputmode="decimal" data-money placeholder="R$ 0,00"></div>
    <div class="field" data-cp="prazo parcelado livre custom restcustom"><label for="cp_restB">Quanto ${esc(names().B)} paga do restante</label><input type="text" id="cp_restB" inputmode="decimal" data-money placeholder="R$ 0,00"></div>
    <div class="field row-start" data-cp="prazo parcelado livre"><label for="cp_forma">Forma de pagamento</label><select id="cp_forma"><option value="">Não informada</option>${opt(LISTS.formasPag || [], (x) => x, 'Pix')}</select></div>
    ${resumo}`;
}
/** Divisão do carro entre os sócios, como o cálculo usa (metade cada ou os valores informados). */
const numDe = (id) => { const v = parseMoney(($('#' + id) || {}).value); return v == null || Number.isNaN(v) ? null : v; };
/**
 * Divisão do carro entre os sócios. Metade cada: cálculo padrão. Outra divisão: vazio vale zero e os valores são o que cada um
 * pagou na hora; com prazo, o restante entra na conta de quem vai pagá-lo ("Quem paga o restante"), e a soma fecha com o valor da compra.
 */
function divisaoCompra() {
  const total = numDe('f_entT') || 0;
  if (!splitCustom()) return { ...Calc.entry({ entT: total }), pagoA: null, pagoB: null, rest: 0 };
  const pagoA = numDe('f_ovrA') || 0, pagoB = numDe('f_ovrB') || 0;
  const modo = $('#cp_modo') ? $('#cp_modo').value : '';
  const rest = modo ? round2(Math.max(0, total - pagoA - pagoB)) : 0;
  const q = $('#cp_quemrest') ? $('#cp_quemrest').value : '';
  const rA = q === 'A' ? rest : q === 'B' ? 0 : q === 'custom' ? (numDe('cp_restA') || 0) : round2(rest / 2);
  const rB = q === 'custom' ? (numDe('cp_restB') || 0) : round2(rest - rA);
  return { A: round2(pagoA + rA), B: round2(pagoB + rB), pagoA, pagoB, rest, restA: rA, restB: rB };
}
/** Pagamentos da compra: null = à vista; { err } = falta informação; { parts, ent } = o que vai para Veículos a pagar. */
function compraParts() {
  const modo = $('#cp_modo') ? $('#cp_modo').value : '';
  if (!modo) return null;
  const total = numDe('f_entT'), base = $('#f_dcompra').value || today();
  if (!(total > 0)) return { err: 'Informe o valor da compra para programar o pagamento.' };
  const custom = splitCustom(), e = divisaoCompra();
  const ent = custom ? round2(e.pagoA + e.pagoB) : (numDe('cp_ent') || 0);
  if (ent >= total) return { err: custom ? 'O que os dois pagaram na hora já cobre o valor da compra. Escolha "À vista".' : 'O pago na hora já cobre o valor da compra. Escolha "À vista".' };
  let dias = 0;
  const dataFixa = modo === 'prazo' && $('#cp_prazo').value === 'data';
  if (modo === 'prazo') {
    if (dataFixa) {
      const d = $('#cp_data').value;
      if (!d) return { err: 'Informe a data do pagamento.' };
      dias = Calc.diff(d, base);
      if (dias < 0) return { err: 'A data do pagamento é antes da data da compra.' };
    } else dias = Number($('#cp_prazo').value);
  }
  const quemRest = custom ? ($('#cp_quemrest').value || null) : null;
  if (quemRest === 'custom' && Math.abs(e.restA + e.restB - e.rest) > 0.004) return { err: `O restante é ${brl(e.rest)}, mas ${names().A} e ${names().B} somam ${brl(e.restA + e.restB)}.` };
  const extra = { credor: $('#cp_credor').value.trim() || null, forma: $('#cp_forma').value || null };
  let rows;
  if (modo === 'livre') { const pl = planoLivre($('#cp_crono'), { total, base, entrada: ent }); if (pl.err) return { err: pl.err }; rows = pl.rows; }
  else rows = Calc.plan({ total, base, mode: modo, entrada: ent, prazoDias: dias, n: Number($('#cp_n').value), primeiro: $('#cp_first').value || null });
  const parts = [];
  for (const p of rows) {
    if (p.label === 'Entrada') {
      // O que foi pago na compra, separado por sócio quando a divisão não é metade cada.
      const pagos = custom ? [['A', e.pagoA], ['B', e.pagoB]].filter(([, v]) => v > 0) : [[null, p.valor]];
      for (const [q, v] of pagos) parts.push({ label: q ? `Pago na compra (${names()[q]})` : 'Pago na compra', tipo: 'Entrada', due: p.due, valor: round2(v), status: 'Pago', paidAt: p.paidAt, quem: q, ...extra });
    } else if (quemRest === 'custom') {
      // cada parcela do restante vira uma conta por sócio, na proporção que cada um assumiu
      const vA = e.rest > 0 ? round2(p.valor * e.restA / e.rest) : 0, base0 = dataFixa ? 'Pagamento' : p.label;
      for (const [q, v] of [['A', vA], ['B', round2(p.valor - vA)]]) if (v > 0) parts.push({ label: `${base0} (${names()[q]})`, tipo: 'Parcela', due: p.due, valor: v, status: 'Pendente', paidAt: null, quem: q, ...extra });
    } else parts.push({ label: dataFixa ? 'Pagamento' : p.label, tipo: 'Parcela', due: p.due, valor: p.valor, status: 'Pendente', paidAt: null, quem: quemRest, ...extra });
  }
  return { ent, parts };
}
/** Mostra só os campos da forma escolhida e escreve o resumo da compra numa frase. */
function compraRefresh(cur) {
  const consig = isConsig(cur), custom = splitCustom();
  const sf = $('#cp_splitf');
  if (sf) sf.hidden = consig;
  document.querySelectorAll('[data-cpbox]').forEach((el) => { el.hidden = consig; el.classList.toggle('row-start', custom); });
  const oa = document.querySelector('.field[data-k="ovrA"]');
  if (oa) oa.classList.add('row-start'); // os valores dos dois sócios ficam lado a lado
  const sel = $('#cp_modo'), modo = sel ? sel.value : '';
  const dataFixa = modo === 'prazo' && $('#cp_prazo') && $('#cp_prazo').value === 'data';
  document.querySelectorAll('[data-cp]').forEach((el) => {
    const t = el.dataset.cp.split(' ');
    const restCustom = $('#cp_quemrest') && $('#cp_quemrest').value === 'custom';
    el.hidden = consig || !(t.includes(modo) || (dataFixa && t.includes('prazo-data'))) || (t.includes('custom') && !custom) || (t.includes('restcustom') && !restCustom);
  });
  // Outra divisão: "Pago na hora" é a soma do que cada sócio pagou (só leitura).
  const ent = $('#cp_ent');
  if (ent) {
    ent.readOnly = custom;
    const hint = ent.parentElement.querySelector('.hint');
    if (custom) { const d = divisaoCompra(); ent.value = moneyField(round2(d.pagoA + d.pagoB)); if (hint) hint.textContent = `Soma do que ${names().A} e ${names().B} pagaram.`; }
    else if (hint) hint.textContent = 'Vazio se não pagamos nada na compra.';
  }
  const lA = $('label[for="f_ovrA"]'), lB = $('label[for="f_ovrB"]');
  if (lA) lA.textContent = modo ? `Quanto ${names().A} pagou na hora` : `Quanto ${names().A} pagou`;
  if (lB) lB.textContent = modo ? `Quanto ${names().B} pagou na hora` : `Quanto ${names().B} pagou`;
  const prev = $('#cp_prev');
  if (!prev) return;
  prev.hidden = consig;
  const total = numDe('f_entT');
  if (consig || !(total > 0)) { prev.textContent = ''; return; }
  const e = divisaoCompra();
  let t = `${esc(names().A)} entra com <b>${brl(e.A)}</b> e ${esc(names().B)} com <b>${brl(e.B)}</b>.`;
  if (custom && !modo && Math.abs(e.pagoA + e.pagoB - total) > 0.004) t += ` <span class="neg">A soma (${brl(e.pagoA + e.pagoB)}) não bate com o valor da compra (${brl(total)}).</span>`;
  const c = modo ? compraParts() : null;
  if (c && c.err) t += ` <span class="mut">${esc(c.err)}</span>`;
  else if (c) {
    const porData = {};
    c.parts.filter((p) => p.status !== 'Pago').forEach((p) => { porData[p.due] = round2((porData[p.due] || 0) + p.valor); }); // uma data, um valor (mesmo dividido entre os sócios)
    const falta = Object.keys(porData).sort().map((d) => ({ due: d, valor: porData[d] }));
    t += ` ${c.ent > 0 ? `Na compra pagamos <b>${brl(c.ent)}</b> e fica a pagar` : 'Fica a pagar'} ${datasTexto(falta)}.`;
  }
  prev.innerHTML = t;
}

/* ---------- venda: carro na troca e como recebemos (dentro do cadastro do carro) ---------- */
const PLACA_OK = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
let trocaInfo = {}; // marca e cor do carro da troca, vindos da consulta de placa
/** Campos da venda além dos do schema. Venda que já tem carro de troca ou parcelas mostra só o atalho. */
function vendaHtml(existing) {
  trocaInfo = {};
  const opt = (arr, fmt, sel) => arr.map((x) => `<option value="${esc(x)}"${String(x) === String(sel) ? ' selected' : ''}>${esc(fmt(x))}</option>`).join('');
  const filhos = existing ? (S.cars || []).filter((c) => !c.deleted && c.origemId === existing.id) : [];
  const temRec = existing && (S.receipts || []).some((r) => !r.deleted && r.carId === existing.id);
  let h = '';
  if (filhos.length) h += `<div class="field full" data-vdbox><label>Carro na troca</label><span>${filhos.map((c) => `${esc(c.name)}${c.placa ? ' (' + esc(c.placa) + ')' : ''}, entrou por ${brl(Calc.num(c.entT))}`).join('; ')}</span></div>`;
  else h += `<div class="field" data-vdbox><label for="vd_troca">Entrou carro na troca?</label><select id="vd_troca"><option value="">Não</option><option value="sim">Sim</option></select></div>
    <div class="field" data-vd="troca"><label for="vd_cash">Recebido em dinheiro / Pix</label><input type="text" id="vd_cash" inputmode="decimal" data-money placeholder="R$ 0,00"></div>
    <div class="field row-start" data-vd="troca"><label for="vd_placa">Placa do carro da troca</label><input type="text" id="vd_placa" style="text-transform:uppercase" autocapitalize="characters" spellcheck="false" autocomplete="off"><span class="hint" id="vd_plres">Com a placa completa, modelo e ano vêm sozinhos.</span></div>
    <div class="field" data-vd="troca"><label for="vd_nome">Carro da troca</label><input type="text" id="vd_nome" autocomplete="off" placeholder="Ex.: VW Gol 1.0"></div>
    <div class="field" data-vd="troca"><label for="vd_ano">Ano</label><input type="text" id="vd_ano" inputmode="numeric"></div>
    <div class="field" data-vd="troca"><label for="vd_km">KM</label><input type="text" id="vd_km" inputmode="numeric" placeholder="Ex.: 85.000"></div>
    <div class="field" data-vd="troca"><label for="vd_valor">Valor em que pegamos o carro</label><input type="text" id="vd_valor" inputmode="decimal" data-money placeholder="R$ 0,00"></div>`;
  if (temRec) h += `<div class="field full" data-vdbox><label>Como recebemos</label><span class="hint">Recebimento já programado. <button type="button" class="linkbtn" data-act="receipts" data-id="${existing.id}">Ver recebimentos</button></span></div>`;
  else h += `<div class="field row-start" data-vdbox><label for="vd_modo">Como recebemos o dinheiro</label><select id="vd_modo"><option value="">À vista</option><option value="prazo">A prazo</option><option value="parcelado">Parcelado</option><option value="livre">Personalizado</option></select></div>
    <div class="field" data-vd2="prazo parcelado livre"><label for="vd_ent">Entrada recebida na hora</label><input type="text" id="vd_ent" inputmode="decimal" data-money placeholder="R$ 0,00"></div>
    <div class="field" data-vd2="prazo"><label for="vd_prazo">Prazo do restante</label><select id="vd_prazo">${opt(CP_PRAZOS, (x) => x + ' dias', 30)}<option value="data">Data específica</option></select></div>
    <div class="field" data-vd2="prazo-data"><label for="vd_data">Data do pagamento</label><input type="date" id="vd_data"></div>
    <div class="field" data-vd2="parcelado"><label for="vd_n">Parcelas do restante</label><select id="vd_n">${opt(CP_PARCELAS, (x) => x + 'x', 2)}</select></div>
    <div class="field" data-vd2="parcelado"><label for="vd_first">1º vencimento</label><input type="date" id="vd_first"><span class="hint">Vazio: 1 mês depois da venda.</span></div>
    ${cronoHtml('vd_crono', 'data-vd2="livre"')}`;
  return h + '<div class="field full cp-prev" id="vd_prev"></div>';
}
/** Dados da venda lidos da tela: troca (carro novo), dinheiro e parcelas do recebimento. { err } quando falta algo. */
function vendaDados() {
  const vt = $('#vd_troca'), troca = !!vt && vt.value === 'sim';
  let total = numDe('f_vvenda') || 0, trocaValor = 0;
  const out = { troca: null, parts: null, total };
  if (troca) {
    const nome = $('#vd_nome').value.trim(), cash = numDe('vd_cash') || 0;
    trocaValor = numDe('vd_valor') || 0;
    if (!nome) return { err: 'Informe o carro que entrou na troca.' };
    if (!(trocaValor > 0)) return { err: 'Informe o valor em que pegamos o carro da troca.' };
    const placa = $('#vd_placa').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const ano = parseInt($('#vd_ano').value, 10), km = parseInt(String($('#vd_km').value).replace(/\D/g, ''), 10);
    out.troca = { name: nome, placa: placa || null, ano: Number.isNaN(ano) ? null : ano, km: Number.isNaN(km) ? null : km, entT: trocaValor, marca: trocaInfo.marca || null, cor: trocaInfo.cor || null };
    total = round2(cash + trocaValor); out.total = total;
  } else {
    // venda sem troca agora, mas com carro de troca já cadastrado: o dinheiro é o total menos esses carros
    const box = document.querySelector('[data-vdbox] span');
    if (box && !$('#vd_troca')) trocaValor = (S.cars || []).filter((c) => !c.deleted && c.origemId === Number(($('#form').dataset.carId || 0))).reduce((a, c) => a + (Calc.num(c.entT) || 0), 0);
  }
  const sel = $('#vd_modo'), modo = sel ? sel.value : '';
  if (modo) {
    const cash = round2(total - trocaValor), base = $('#f_dvenda').value || today();
    if (!(cash > 0)) return { err: 'Não sobra dinheiro a receber: a venda foi só com troca. Escolha "À vista".' };
    const ent = numDe('vd_ent') || 0;
    if (ent >= cash) return { err: 'A entrada já cobre o dinheiro da venda. Escolha "À vista".' };
    let dias = 0;
    const dataFixa = modo === 'prazo' && $('#vd_prazo').value === 'data';
    if (modo === 'prazo') {
      if (dataFixa) { const d = $('#vd_data').value; if (!d) return { err: 'Informe a data do pagamento.' }; dias = Calc.diff(d, base); if (dias < 0) return { err: 'A data do pagamento é antes da data da venda.' }; }
      else dias = Number($('#vd_prazo').value);
    }
    const q0 = $('#f_quemrec') ? $('#f_quemrec').value : '', quem = q0 === 'A' || q0 === 'B' ? q0 : null; // outra divisão: as parcelas seguem a divisão do carro
    out.cash = cash; out.ent = ent;
    let rows;
    if (modo === 'livre') { const pl = planoLivre($('#vd_crono'), { total: cash, base, entrada: ent }); if (pl.err) return { err: pl.err }; rows = pl.rows; }
    else rows = Calc.plan({ total: cash, base, mode: modo, entrada: ent, prazoDias: dias, n: Number($('#vd_n').value), primeiro: $('#vd_first').value || null });
    out.parts = rows.map((p) => ({ ...p, label: dataFixa && p.label !== 'Entrada' ? 'Pagamento' : p.label, quem }));
  }
  return out;
}
/** Depois de salvar a venda: cadastra o carro da troca (ligado a esta venda) e programa os recebimentos. */
async function salvarVenda(carId, v, send) {
  if (v.troca) await api('POST', '/api/cars', { ...v.troca, origemId: carId, dcompra: send.dvenda || today(), status: 'Em estoque', loc: 'Pátio / Loja' });
  if (v.parts && v.parts.length) await api('POST', `/api/cars/${carId}/plan`, { parts: v.parts });
}
function vendaRefresh(cur) {
  const sold = isSold(cur);
  document.querySelectorAll('[data-vdbox]').forEach((el) => { el.hidden = !sold; });
  const troca = !!$('#vd_troca') && $('#vd_troca').value === 'sim';
  document.querySelectorAll('[data-vd]').forEach((el) => { el.hidden = !sold || !troca; });
  const modo = $('#vd_modo') ? $('#vd_modo').value : '', dataFixa = modo === 'prazo' && $('#vd_prazo') && $('#vd_prazo').value === 'data';
  document.querySelectorAll('[data-vd2]').forEach((el) => { const t = el.dataset.vd2.split(' '); el.hidden = !sold || !(t.includes(modo) || (dataFixa && t.includes('prazo-data'))); });
  // com troca, o total da venda é a soma do dinheiro com o valor do carro (só leitura)
  const vv = $('#f_vvenda');
  if (vv) { vv.readOnly = troca; if (troca) vv.value = moneyField(round2((numDe('vd_cash') || 0) + (numDe('vd_valor') || 0))); }
  const prev = $('#vd_prev');
  if (!prev) return;
  prev.hidden = !sold;
  const total = numDe('f_vvenda');
  if (!sold || !(total > 0)) { prev.textContent = ''; return; }
  const v = vendaDados();
  if (v.err) { prev.innerHTML = `<span class="mut">${esc(v.err)}</span>`; return; }
  let t = troca ? `Venda de <b>${brl(v.total)}</b>: <b>${brl(round2(v.total - v.troca.entT))}</b> em dinheiro e <b>${brl(v.troca.entT)}</b> no ${esc(v.troca.name)}.` : `Venda de <b>${brl(total)}</b>.`;
  if (v.parts) {
    const fut = v.parts.filter((p) => p.status !== 'Recebido').sort((a, b) => a.due.localeCompare(b.due));
    t += ` ${v.ent > 0 ? `Recebemos <b>${brl(v.ent)}</b> na hora e falta receber` : 'Falta receber'} ${datasTexto(fut)}.`;
  }
  prev.innerHTML = t;
}
/** Placa do carro da troca: consulta sozinha quando completa. */
function wireTrocaPlaca(refresh) {
  const el = $('#vd_placa');
  if (!el || !S.placa) return;
  let last = '';
  el.addEventListener('input', async () => {
    const p = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!PLACA_OK.test(p) || p === last) return;
    last = p;
    const out = $('#vd_plres');
    out.textContent = 'Consultando…';
    try {
      const d = await api('GET', `/api/placa/${encodeURIComponent(p)}`);
      if (last !== p) return;
      $('#vd_nome').value = d.nome || ''; $('#vd_ano').value = d.ano || '';
      trocaInfo = { marca: marcaNome(d.marca), cor: d.cor || null };
      const f = d.fipe && d.fipe[0];
      out.textContent = f ? `FIPE de ${brl(f.valor)}${d.fipe.length > 1 ? ' (versão mais provável)' : ''}.` : 'Placa encontrada.';
    } catch (e) { out.textContent = e.message; }
    refresh();
  });
}

/** "R$ 30.000,00 em 05/11/2026, ..." até 3 datas; mais que isso, "R$ 55.000,00 em 8 pagamentos, de 05/11/2026 a 05/06/2027". */
function datasTexto(lista) {
  if (lista.length <= 3) return lista.map((p) => `<b>${brl(p.valor)}</b> em ${dmy(p.due)}`).join(', ');
  const tot = round2(lista.reduce((a, p) => a + p.valor, 0));
  return `<b>${brl(tot)}</b> em ${lista.length} pagamentos, de ${dmy(lista[0].due)} a ${dmy(lista[lista.length - 1].due)}`;
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
      (d.fipe.length ? `<label class="small" for="plfipe">${d.fipeFonte === 'modelo' ? 'A placa não trouxe a FIPE. Valores da tabela FIPE para esse modelo e ano' : 'Valor FIPE'}${d.fipe.length > 1 ? ' (escolha a versão certa)' : ''}</label><select id="plfipe">${opts}</select>`
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
      <div class="field"><label for="pl_mode">Forma de recebimento</label><select id="pl_mode"><option value="vista">À vista</option><option value="prazo">A prazo (um pagamento depois)</option><option value="parcelado" selected>Parcelado</option><option value="livre">Personalizado</option></select></div>
      <div class="field"><label for="pl_total">Valor a programar</label><input type="text" id="pl_total" inputmode="decimal" data-money value="${esc(moneyField(falta))}"></div>
      <div class="field"><label for="pl_base">Data da venda</label><input type="date" id="pl_base" value="${esc(d.c.dvenda || today())}"></div>
      <div class="field" data-for="prazo parcelado livre"><label for="pl_ent">Entrada recebida na hora (pix)</label><input type="text" id="pl_ent" inputmode="decimal" data-money placeholder="R$ 0,00"></div>
      <div class="field" data-for="prazo"><label for="pl_dias">Prazo</label><select id="pl_dias">${opt(PRAZOS, (x) => x + ' dias')}<option value="outro">Outro…</option></select></div>
      <div class="field" data-for="prazo"><label for="pl_dias2">Prazo em dias (se "Outro")</label><input type="text" id="pl_dias2" inputmode="numeric"></div>
      <div class="field" data-for="parcelado"><label for="pl_n">Número de parcelas</label><select id="pl_n">${opt(PARCELAS, (x) => x + 'x')}</select></div>
      <div class="field" data-for="parcelado"><label for="pl_first">Primeiro vencimento</label><input type="date" id="pl_first"><span class="hint">Em branco: 1 mês depois da venda. As demais, mês a mês.</span></div>
      ${cronoHtml('pl_crono', 'data-for="livre"')}
      <div class="field full"><label for="pl_quem">Quem ficou com o dinheiro</label><select id="pl_quem"><option value="">Regra do carro (padrão)</option>${partnerOpts().map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
    </div>
    <div id="pl_prev"></div><div class="err" id="ferr" role="alert"></div>
    <div class="acts"><button type="button" class="btn" data-x="cancel">Cancelar</button><button class="btn pri" type="submit" id="fsave">Programar</button></div></form>`;
  $('#pl_n').value = '3';

  let planErr = '';
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
    if (r.mode === 'livre') { const pl = planoLivre($('#pl_crono'), { total: r.total, base: r.base, entrada: r.ent }); planErr = pl.err || ''; return pl.rows || []; }
    planErr = '';
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
      : `<p class="mut small" style="margin:0">${esc(planErr || 'Preencha o valor e a data para ver as parcelas.')}</p>`;
  };
  m.oninput = refresh; m.onchange = refresh; refresh();
  cronoWire($('#pl_crono'), refresh);
  m.onclick = (ev) => { if (ev.target === m || ev.target.getAttribute?.('data-x') === 'cancel') closeModal(); };
  $('#pl_total').focus();

  let saving = false;
  $('#plan').onsubmit = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    const ps = parts();
    const r = read();
    if (!ps.length) { $('#ferr').textContent = planErr || 'Informe o valor a programar e a data da venda.'; return; }
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
