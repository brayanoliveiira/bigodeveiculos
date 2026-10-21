// Aba Vendas: como cada venda está sendo paga (carro de troca, à vista, a prazo, parcelado) e o que falta receber.
import { $, esc, brl, dmy, today, sign, table } from './util.js';
import { S, names } from './state.js';
import { views } from './views.js';

const FILTROS = ['Todas', 'A receber', 'Atrasadas', 'Quitadas'];
const nm = (c) => names()[c] || '—';

export function situacao(d) {
  if (d.cash == null) return { k: 'none', txt: '—' };
  if (d.atrasado > 0.004) return { k: 'late', txt: 'Atrasado' };
  if ((d.parcelas || []).some((p) => p.st === 'Parcial')) return { k: 'soon', txt: 'Pagou em parte' };
  if (d.semProg > 0.004 || d.excesso > 0.004) return { k: 'soon', txt: d.semProg > 0.004 ? 'Falta programar' : 'Parcelas passam do valor' };
  if (d.aReceber > 0.004) return { k: 'soon', txt: 'A receber' };
  return { k: 'ok', txt: d.cash > 0 ? 'Quitado' : 'Só troca' };
}
const pill = (s) => `<span class="pill ${s.k === 'ok' ? 'ok' : s.k === 'late' ? 'late' : s.k === 'soon' ? 'soon' : ''}">${esc(s.txt)}</span>`;

views.vendas = {
  mount(el) {
    el.innerHTML = '<div class="toolbar"><div class="chips" id="vchips"></div></div><div id="list" class="stack"></div>';
    this.paint();
  },
  paint() {
    const box = $('#list');
    if (!box) return;
    $('#vchips').innerHTML = FILTROS.map((f) => `<button class="chip" data-vf="${f}" aria-pressed="${S.ui.vf === f}">${f}</button>`).join('');
    const sold = Object.values(S.D).filter((d) => d.vendido);
    if (!sold.length) { box.innerHTML = '<div class="empty"><h3>Nenhuma venda ainda</h3><p class="mut" style="margin:0;max-width:46ch">Quando um carro for marcado como vendido, ele aparece aqui com a forma de pagamento e o que falta receber.</p></div>'; return; }
    const sit = (d) => situacao(d).k;
    const rows = sold.filter((d) => S.ui.vf === 'Todas' || (S.ui.vf === 'A receber' && d.aReceber > 0.004) || (S.ui.vf === 'Atrasadas' && d.atrasado > 0.004) || (S.ui.vf === 'Quitadas' && sit(d) === 'ok'))
      .sort((a, b) => String(b.c.dvenda || '').localeCompare(String(a.c.dvenda || '')));
    const sum = (f) => sold.reduce((a, d) => a + (f(d) || 0), 0);
    const K = (t, v, cls) => `<div class="kpi"><dt>${esc(t)}</dt><dd class="${cls || ''}">${v}</dd></div>`;
    let h = '<dl class="grid kpis" style="margin:0">' + K('Vendas', String(sold.length)) + K('Dinheiro já recebido', brl(sum((d) => d.recebido))) +
      K('A receber de clientes', brl(sum((d) => d.aReceber))) + K('Atrasado', brl(sum((d) => d.atrasado)), sum((d) => d.atrasado) > 0 ? 'neg' : '') + '</dl>';
    h += table([
      { label: 'Carro', get: (d) => `<b>${esc(d.c.name)}</b><div class="mut small">${esc(d.c.comprador || '')}${d.c.dvenda ? ' · ' + dmy(d.c.dvenda) : ''}</div>` },
      { label: 'Forma', get: (d) => esc(d.forma || '—') + (d.nParc > 1 ? `<div class="mut small">${d.nParc} parcelas</div>` : '') },
      { label: 'Venda', r: true, get: (d) => brl(Calc.num(d.c.vvenda)) },
      { label: 'Troca', r: true, get: (d) => (d.troca > 0 ? brl(d.troca) : '—') },
      { label: 'Dinheiro', r: true, get: (d) => brl(d.cash) },
      { label: 'Cada um recebe', r: true, get: (d) => (d.retA == null ? '—' : `${esc(nm('A'))} ${brl(d.retA)}<div>${esc(nm('B'))} ${brl(d.retB)}</div>`) },
      { label: 'Recebido', r: true, get: (d) => brl(d.recebido) },
      { label: 'A receber', r: true, get: (d) => (d.aReceber > 0.004 ? brl(d.aReceber) + (d.atrasado > 0.004 ? `<div class="neg small">${brl(d.atrasado)} atrasado</div>` : '') : '—') },
      { label: 'Próx. venc.', get: (d) => (d.prox ? dmy(d.prox) : '—') },
      { label: 'Situação', get: (d) => pill(situacao(d)) },
      { label: '', get: (d) => `<button class="btn sm" data-act="receipts" data-id="${d.c.id}">Recebimentos</button>` },
    ], rows, null, 'Nenhuma venda com esse filtro.');
    box.innerHTML = h;
  },
};

/* Janela de recebimentos de um carro: parcelas, pagamentos (inteiros ou em parte), editar, programar. */
export function renderReceipts(carId) {
  const d = S.D[carId];
  const m = $('#modal');
  if (!d) { m.hidden = true; m.innerHTML = ''; S.ui.rcCar = null; return; }
  S.ui.rcCar = carId; S.ui.repCar = null;
  const t = today();
  const s = situacao(d);
  const who = (r) => esc(r.quem ? nm(r.quem) : (d.c.quemrec ? nm(d.c.quemrec) : 'Metade cada'));
  const stPill = (p) => (p.st === 'Recebido' ? `<span class="pill ok">Recebido${p.ultimo ? ' ' + dmy(p.ultimo) : ''}</span>`
    : p.st === 'Parcial' ? `<span class="pill ${p.atrasada ? 'late' : 'soon'}">Pagou em parte</span>` : `<span class="pill ${p.atrasada ? 'late' : 'soon'}">${p.atrasada ? 'Atrasado' : 'A receber'}</span>`);
  const rowsHtml = d.parcelas.map((p) => {
    const r = p.r;
    let h = `<tr><td>${esc(r.label || '—')}</td><td class="num">${dmy(r.due)}</td><td class="r num">${brl(Calc.num(r.valor))}</td><td class="r num">${p.pago > 0.004 ? brl(p.pago) : '—'}</td>` +
      `<td class="r num">${p.falta > 0.004 ? `<b class="${p.atrasada ? 'neg' : ''}">${brl(p.falta)}</b>` : '—'}</td><td>${stPill(p)}</td><td>${who(r)}</td>` +
      `<td style="min-width:150px">${S.canWrite ? `${p.falta > 0.004 ? `<button class="btn sm" data-act="rc-pay" data-id="${r.id}">Receber</button> ` : ''}<button class="btn sm" data-act="rc-edit" data-id="${r.id}">Editar</button> <button class="btn sm danger" data-act="rc-del" data-id="${r.id}">Excluir</button>` : ''}</td></tr>`;
    if (p.pagamentos.length) {
      h += `<tr class="sub"><td></td><td colspan="7"><div class="pays">${p.pagamentos.map((x) =>
        `<span class="pay"><b class="num">${brl(Calc.num(x.valor))}</b> em ${dmy(x.date)}${x.quem ? ' · ' + esc(nm(x.quem)) : ''}${x.obs ? ' · ' + esc(x.obs) : ''}` +
        `${S.canWrite ? ` <button class="linkbtn" data-act="pay-edit" data-id="${x.id}">editar</button> <button class="linkbtn" data-act="pay-del" data-id="${x.id}">excluir</button>` : ''}</span>`).join('')}</div></td></tr>`;
    }
    return h;
  }).join('');
  m.hidden = false;
  m.innerHTML = `<div class="sheet wide"><div class="rep-h"><h2>Recebimentos — ${esc(d.c.name)}</h2>${pill(s)}</div>
    <dl class="rc-sum"><div><dt>Venda</dt><dd>${brl(Calc.num(d.c.vvenda))}</dd></div><div><dt>Carro de troca</dt><dd>${brl(d.troca)}</dd></div><div><dt>Dinheiro</dt><dd>${brl(d.cash)}</dd></div>
      <div><dt>Recebido</dt><dd class="pos">${brl(d.recebido)}</dd></div><div><dt>A receber</dt><dd class="${d.aReceber > 0.004 ? 'neg' : ''}">${brl(d.aReceber)}</dd></div></dl>
    ${d.nParc === 0 && d.cash > 0 ? '<p class="mut small" style="margin:0">Nenhuma parcela cadastrada: a venda está sendo tratada como <b>recebida à vista</b>. Programe o recebimento se ela é a prazo ou parcelada.</p>' : ''}
    ${d.semProg > 0.004 ? `<p class="neg small" style="margin:0">Faltam ${brl(d.semProg)} para programar.</p>` : ''}${d.excesso > 0.004 ? `<p class="neg small" style="margin:0">As parcelas passam ${brl(d.excesso)} do valor em dinheiro da venda.</p>` : ''}
    ${d.parcelas.length ? `<div class="tbl"><table class="compact" style="min-width:0"><thead><tr><th>Parcela</th><th>Vencimento</th><th class="r">Valor</th><th class="r">Pago</th><th class="r">Falta</th><th>Situação</th><th>Com</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    <p class="mut small" style="margin:0">Cliente pagou só uma parte? Use <b>Receber</b> e digite o valor que entrou: o que faltar continua em aberto (e atrasa se passar do vencimento). Cada pagamento fica com data e valor.</p>` : ''}
    <div class="acts">${S.canWrite ? `<button class="btn" data-act="rc-new" data-id="${carId}">Adicionar parcela avulsa</button><button class="btn pri" data-act="rc-plan" data-id="${carId}">Programar recebimento</button>` : ''}<button class="btn" data-x="cancel">Fechar</button></div></div>`;
  m.onclick = (ev) => { if (ev.target === m || ev.target.getAttribute?.('data-x') === 'cancel') { m.hidden = true; m.innerHTML = ''; S.ui.rcCar = null; } };
  void t;
}

/* Janela de repasses de um carro consignado: quanto o dono tem a receber, o que já foi repassado e quando. */
export function renderRepasses(carId) {
  const d = S.D[carId];
  const m = $('#modal');
  if (!d || !d.consig) { m.hidden = true; m.innerHTML = ''; S.ui.repCar = null; return; }
  S.ui.repCar = carId; S.ui.rcCar = null;
  const rows = d.repasses.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const trs = rows.map((r) => `<tr><td class="num">${dmy(r.date)}</td><td class="r num">${brl(Calc.num(r.valor))}</td><td>${r.quem ? esc(nm(r.quem)) : esc(d.c.quemrec ? nm(d.c.quemrec) : 'Metade cada')}</td><td>${esc(r.obs || '')}</td>` +
    `<td style="white-space:nowrap">${S.canWrite ? `<button class="btn sm" data-act="rep-edit" data-id="${r.id}">Editar</button> <button class="btn sm danger" data-act="rep-del" data-id="${r.id}">Excluir</button>` : ''}</td></tr>`).join('');
  m.hidden = false;
  m.innerHTML = `<div class="sheet wide"><div class="rep-h"><h2>Repasses ao dono — ${esc(d.c.name)}</h2>${d.repFalta > 0.004 ? '<span class="pill soon">Falta repassar</span>' : '<span class="pill ok">Repassado</span>'}</div>
    <p class="mut small" style="margin:0">Carro de <b>${esc(d.c.dono)}</b>. O repasse sai do dinheiro da venda; os gastos do carro e a comissão saem do que sobrar.</p>
    <dl class="rc-sum rp-sum"><div><dt>Repasse combinado</dt><dd>${brl(d.repasse)}</dd></div><div><dt>Já repassado</dt><dd class="pos">${brl(d.repPago)}</dd></div>${d.emEspecie > 0 ? `<div><dt>Pago em carro (troca)</dt><dd class="pos">${brl(d.emEspecie)}</dd></div>` : ''}<div><dt>Falta repassar</dt><dd class="${d.repFalta > 0.004 ? 'neg' : ''}">${brl(d.repFalta)}</dd></div>
      <div><dt>Gastos no carro</dt><dd>${brl(d.gast)}</dd></div><div><dt>${d.vendido ? 'Comissão' : 'Comissão projetada'}</dt><dd class="${d.vendido ? sign(d.lucro) : sign(d.proj)}">${brl(d.vendido ? d.lucro : d.proj)}</dd></div></dl>
    ${d.vendido ? '' : '<p class="mut small" style="margin:0">O carro ainda não foi vendido. Quando for, a comissão = valor da venda − repasse − gastos.</p>'}
    ${rows.length ? `<div class="tbl"><table class="compact" style="min-width:0"><thead><tr><th>Data</th><th class="r">Valor</th><th>Quem pagou</th><th>Observação</th><th></th></tr></thead><tbody>${trs}</tbody></table></div>` : '<p class="mut small" style="margin:0">Nenhum repasse registrado ainda.</p>'}
    <div class="acts">${S.canWrite ? `<button class="btn pri" data-act="rep-new" data-id="${carId}">Registrar repasse</button>` : ''}<button class="btn" data-x="cancel">Fechar</button></div></div>`;
  m.onclick = (ev) => { if (ev.target === m || ev.target.getAttribute?.('data-x') === 'cancel') { m.hidden = true; m.innerHTML = ''; S.ui.repCar = null; } };
}
