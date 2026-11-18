// Telas. Cada uma tem mount(el) (monta o esqueleto) e paint() (redesenha com os dados atuais).
import { $, esc, brl, money, pct, dmy, today, stamp, sign, initials, marcaOf, table } from './util.js';
import { S, LISTS, names, itemOf, carName, liveCars, locClass } from './state.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const KIND_NAME = { car: 'carro', expense: 'gasto', planned: 'gasto previsto', receipt: 'recebimento', payment: 'pagamento', repasse: 'repasse', loan: 'empréstimo', payable: 'conta a pagar', pdebt: 'dívida entre sócios', settings: '', user: 'usuário' };
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

const pctBR = (f) => (Math.round(f * 1000) / 10).toLocaleString('pt-BR') + '%';
/** Carro vendido: quanto cada sócio recebe da venda (entrada + gastos + parte do lucro) e o acerto deste carro. */
/** Transferência para o comprador ainda não feita (carro vendido que não está no nome do comprador). */
export const transfPendente = (d) => d.vendido && !d.entregue && d.c.docNome !== 'Comprador';
/** Etiquetas de documento: em nome de quem está, transferência pendente (com botão) e documentação pendente. */
function docHtml(d) {
  const c = d.c, t = [];
  if (d.vendido && !d.entregue) {
    t.push(c.docNome === 'Comprador' ? `<span class="pill ok">Transferido${c.docTransf ? ' em ' + dmy(c.docTransf) : ''}</span>`
      : `<button class="pill late" data-act="doc-transf" data-id="${c.id}" title="Marcar como transferido">Transferência pendente</button>`);
  } else if (!d.vendido) {
    if (c.docNome === 'Nosso nome') t.push('<span class="pill">No nosso nome</span>');
    else if (c.docNome === 'Antigo dono') t.push('<span class="pill">No nome do antigo dono</span>');
  }
  if (c.docPend) t.push(`<button class="pill soon" data-act="doc-ok" data-id="${c.id}" title="Marcar como resolvida">Documentação pendente${c.docObs ? ': ' + esc(c.docObs) : ''}</button>`);
  return t.length ? `<div class="locrow">${t.join('')}</div>` : '';
}

function retornoHtml(d) {
  if (!d.vendido || d.retA == null) return '';
  // Uma linha por sócio, cabe em qualquer largura: "Brayan R$ 40.000,00 / R$ 27.500,00 de entrada + R$ 12.500,00 de lucro"
  const linha = (p) => {
    const e = p === 'A' ? d.entA : d.entB, g = p === 'A' ? d.gastA : d.gastB, l = p === 'A' ? d.lucA : d.lucB, t = p === 'A' ? d.retA : d.retB;
    const partes = [[e, 'de entrada'], [g, 'de gastos'], [l, d.consig && !d.socio ? 'de comissão' : 'de lucro']].filter(([v]) => Math.abs(v) > 0.004)
      .map(([v, txt], i) => `${i && v < 0 ? '− ' : i ? '+ ' : ''}<span class="${v < 0 ? 'neg' : ''}">${brl(i && v < 0 ? -v : v)}</span> ${txt}`);
    return `<div class="ret-p"><div class="ret-n"><span>${esc(nm(p))}</span><b class="num">${brl(t)}</b></div>${partes.length ? `<div class="ret-c">${partes.join(' ')}</div>` : ''}</div>`;
  };
  const a = d.acertoA, falta = d.aReceber > 0.004;
  const quem = a > 0 ? `${nm('B')} passa ${brl(a)} para ${nm('A')}` : `${nm('A')} passa ${brl(-a)} para ${nm('B')}`;
  const acerto = Math.abs(a) < 0.01 ? (falta ? 'Quando tudo entrar, cada um fica com a sua parte.' : 'Cada um já ficou com a sua parte.')
    : `Para fechar este carro: ${quem}${falta ? ', contando o que ainda vai entrar' : ''}.`;
  // consignado: o dono primeiro (repasse; no dono sócio, a parte dele + o lucro dele)
  let dono = '';
  if (d.consig) {
    const partes = d.socio ? [[d.repDono, 'da parte dele'], [d.lucDono, 'de lucro']].filter(([v]) => Math.abs(v) > 0.004)
      .map(([v, txt], i) => `${i ? (v < 0 ? '− ' : '+ ') : ''}<span class="${v < 0 ? 'neg' : ''}">${brl(Math.abs(v))}</span> ${txt}`) : ['repasse combinado'];
    const st = d.repFalta > 0.004 ? `, falta repassar ${brl(d.repFalta)}` : ', já repassado';
    dono = `<div class="ret-p"><div class="ret-n"><span>${esc(d.c.dono)} (dono)</span><b class="num">${brl(d.repasse)}</b></div><div class="ret-c">${partes.join(' ')}${esc(st)}</div></div>`;
  }
  return `<div class="ret"><div class="ret-h">Da venda, cada um recebe</div>${dono}${linha('A')}${linha('B')}<p class="ret-a">${esc(acerto)}</p></div>`;
}

function carCard(d) {
  const c = d.c, open = S.ui.open[c.id];
  const locInfo = `<div class="locrow">${stPill(c.status)}${d.vendido ? '' : locPill(c)}${c.locdet ? `<span>${esc(c.locdet)}</span>` : ''}${d.diasLoc != null ? `<span class="mut">há ${d.diasLoc} dia${d.diasLoc === 1 ? '' : 's'}</span>` : ''}${d.atrasoLoc ? '<span class="pill late">Saída atrasada</span>' : d.saiLogo ? '<span class="pill soon">Sai em até 2 dias</span>' : ''}</div>`;
  const dv = S.DV.porCar[c.id];
  const apagar = dv && dv.falta > 0.004 ? `<div class="locrow"><button class="pill ${dv.atrasado > 0.004 ? 'late' : 'soon'}" data-act="dv-parc-car" data-id="${c.id}">A pagar ${brl(dv.falta)}${dv.prox ? ' · vence ' + dmy(dv.prox) : ''}</button></div>` : '';
  const lh = (S.loanHold || {})[c.id];
  const emprest = lh && lh.length ? `<div class="locrow"><span class="pill soon" title="${esc(lh.map((l) => l.obs || '').filter(Boolean).join(' · '))}">Dinheiro de empréstimo: ${lh.map((l) => esc(l.credor)).join(', ')}</span></div>` : '';
  const hist = c.leilao || c.sinistro
    ? `<div class="locrow">${c.leilao ? '<span class="pill late">Leilão</span>' : ''}${c.sinistro ? '<span class="pill late">Sinistro</span>' : ''}${c.histObs ? `<span class="mut small">${esc(c.histObs)}</span>` : ''}</div>` : '';
  const n2 = d.vendido
    ? `<div><dt>Venda</dt><dd>${brl(Calc.num(c.vvenda))}</dd></div><div><dt>${d.socio ? 'Nosso lucro' : d.consig ? 'Comissão' : 'Lucro'}</dt><dd class="${sign(d.lucro)}">${brl(d.lucro)}</dd></div>`
    : `<div><dt>Anúncio</dt><dd>${brl(Calc.num(c.anun))}</dd></div><div><dt>${d.socio ? 'Nosso lucro projetado' : d.consig ? 'Comissão projetada' : 'Lucro projetado'}</dt><dd class="${sign(d.proj)}">${brl(d.proj)}</dd></div>`;
  const foot = d.vendido && d.lucro != null ? '' : `Divisão: ${nm('A')} ${Math.round(d.pA * 100)}% e ${nm('B')} ${Math.round((1 - d.pA) * 100)}%`;
  let h = `<article class="card cs-${esc(String(c.status || 'Em').split(' ')[0])}" data-id="${c.id}"><div class="card-h">${plate(c.placa)}<div class="ct"><h3>${esc(c.name)}</h3><p class="mut">${[c.ano, c.cor, c.km != null ? Number(c.km).toLocaleString('pt-BR') + ' km' : null, c.dcompra ? 'comprado em ' + dmy(c.dcompra) : null, d.dias != null ? d.dias + ' dias' : null].filter(Boolean).map(esc).join(' · ')}</p></div></div>${locInfo}${docHtml(d)}${hist}${apagar}${emprest}` +
    `<dl class="nums"><div><dt>Custo total</dt><dd>${brl(d.custo)}</dd></div>${n2}</dl>` +
    (c.fipe ? `<div class="fipe"><span>FIPE <b class="num">${brl(Calc.num(c.fipe))}</b></span>${fipeNote(c)}</div>` : '') +
    (d.entregue ? `<div class="consig"><span class="pill dono">Carro de troca · fica com ${esc(c.dono)}</span><span class="mut">Não conta como nosso estoque; o valor abate o repasse.</span></div>` : d.consig ? `<div class="consig"><span class="pill dono">Consignado · ${esc(c.dono)}</span><span>Repasse <b class="num">${brl(d.repasse)}</b></span>${d.socio ? `<span class="mut">${d.pctCombinado ? `sócio, ${pctBR(d.fDono)} do lucro` : `sócio com ${pctBR(d.fDono)} do carro`}${d.lucDono ? `, lucro ${d.vendido ? '' : 'previsto '}dele ${brl(d.lucDono)}` : ''}</span>` : ''}${d.emEspecie > 0 ? `<span>Já em carro <b class="num">${brl(d.emEspecie)}</b></span>` : ''}${d.repFalta > 0.004 ? `<span class="pill soon">Falta repassar ${brl(d.repFalta)}</span>` : '<span class="pill ok">Repassado</span>'}<button class="btn sm" data-act="repasses" data-id="${c.id}">Repasses</button></div>` : '') +
    `<div class="mut small">Investido: ${esc(nm('A'))} <b class="num">${brl(d.invA)}</b> · ${esc(nm('B'))} <b class="num">${brl(d.invB)}</b></div>` +
    retornoHtml(d) +
    (d.vendido && d.cash != null ? `<div class="locrow"><span class="pill">${esc(d.forma || '')}</span>${d.aReceber > 0.004 ? `<span class="${d.atrasado > 0.004 ? 'pill late' : 'pill soon'}">A receber ${brl(d.aReceber)}</span>` : '<span class="pill ok">Quitado</span>'}</div>` : '') +
    `<div class="card-f"><span class="sp mut">${esc(foot)}</span><button class="btn sm" data-act="toggle" data-id="${c.id}">${open ? 'Fechar' : 'Detalhes'}</button><button class="btn sm" data-act="car-gastos" data-id="${c.id}" title="Ver os gastos deste carro">Gastos${d.gast > 0 ? ' ' + brl(d.gast) : ''}</button>${d.vendido ? `<button class="btn sm" data-act="receipts" data-id="${c.id}">Recebimentos</button>` : ''}${S.canWrite ? `<button class="btn sm" data-act="edit-car" data-id="${c.id}">Editar</button>` : ''}${S.canWrite && !d.vendido && !d.entregue ? `<button class="btn sm" data-act="car-reserva" data-id="${c.id}" title="${c.status === 'Reservado' ? 'Voltar para em estoque' : 'Marcar como reservado'}">${c.status === 'Reservado' ? 'Tirar reserva' : 'Reservar'}</button>` : ''}${S.canWrite && !d.vendido && !d.entregue ? `<button class="btn sm pri" data-act="sell-car" data-id="${c.id}">Vender</button>` : ''}${S.canWrite && transfPendente(d) ? `<button class="btn sm pri" data-act="doc-transf" data-id="${c.id}">Transferido</button>` : ''}</div>`;
  if (open) {
    const r = (k, v, cls) => `<span class="k">${esc(k)}</span><span class="v ${cls || ''}">${v}</span>`;
    h += `<div class="det"><h4>Investido por sócio</h4>${r(nm('A'), brl(d.invA))}${r(nm('B'), brl(d.invB))}<h4>Custos</h4>${d.consig ? (d.socio ? r('Parte do dono no carro (' + pctBR(d.partDono) + ')', brl(d.repDono)) + r('Lucro do dono (' + pctBR(d.fDono) + (d.pctCombinado ? ' combinado' : '') + ')' + (d.vendido ? '' : ', previsto'), brl(d.lucDono)) : '') + r('Repasse ao dono (' + (c.dono || '') + ')', brl(d.repasse)) + r('Já repassado', brl(d.repPago)) + (d.emEspecie > 0 ? r('Pago em carro (troca)', brl(d.emEspecie)) : '') + r('Falta repassar', brl(d.repFalta)) + (d.socio ? r('Nossa entrada, ' + nm('A'), brl(d.entA)) + r('Nossa entrada, ' + nm('B'), brl(d.entB)) : '') : r('Entrada ' + nm('A'), brl(d.entA)) + r('Entrada ' + nm('B'), brl(d.entB))}${r('Gastos de ' + nm('A'), brl(d.gastA))}${r('Gastos de ' + nm('B'), brl(d.gastB))}${r('Previstos pendentes', brl(d.prev))}${r('Preço mínimo (zero a zero)', brl(d.pmin))}${r('Preço para a meta de lucro', brl(d.pmeta))}`;
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
/** Ficha do carro (o card completo, com os detalhes abertos) para mostrar numa janela: Gerencial, relatórios... */
export function carFichaHtml(id) {
  const d = S.D[id];
  if (!d) return '';
  const was = S.ui.open[id];
  S.ui.open[id] = true;
  try { return carCard(d).replace('data-act="toggle"', 'data-act="toggle" hidden'); } finally { if (was) S.ui.open[id] = was; else delete S.ui.open[id]; }
}

views.resumo = {
  mount(el) { this.paint(el); },
  paint(el) {
    el = el || $('#view');
    const J = Calc.jurosPagos(S.payables, S.loans);
    const s = Calc.summary(S.D, S.expenses, S.planned, S.settings, today(), S.year, J);
    if (!s.total) {
      el.innerHTML = empty('Nenhum carro ainda', 'Cadastre o primeiro carro para ver lucro, dinheiro parado e o acerto entre vocês dois.', 'Cadastrar primeiro carro', 'new-car') +
        (S.canWrite ? '<div class="empty" style="border-style:solid"><p class="mut" style="margin:0">Quer testar antes? Carregue dados de exemplo e remova depois em Ajustes.</p><button class="btn" data-act="examples">Carregar exemplos</button></div>' : '');
      return;
    }
    const al = [];
    if (s.parados) al.push(['carros', `${s.parados} ${s.parados === 1 ? 'carro parado' : 'carros parados'} há mais de ${S.settings.alerta} dias`]);
    if (s.saidaVencida) al.push(['onde', `${s.saidaVencida} ${s.saidaVencida === 1 ? 'carro passou' : 'carros passaram'} da previsão de saída do local`]);
    if (s.parcAtras) al.push(['vendas', `${brl(s.atrasado)} de clientes vencido`, true]);
    if (s.repFalta > 0.004) al.push(['carros', `${brl(s.repFalta)} para repassar aos donos de consignados`]);
    if (S.DV.atrasado > 0.004) al.push([Object.values(S.DV.porCar).some((g) => g.atrasado > 0.004) ? 'apagar' : 'emprestimos', `${brl(S.DV.atrasado)} a pagar vencido`, true]);
    const nTransf = derived().filter(transfPendente).length, nDoc = derived().filter((d) => d.c.docPend).length;
    if (nTransf) al.push(['carros', `${nTransf} ${nTransf === 1 ? 'transferência pendente' : 'transferências pendentes'}`, true, 'st=Todos;docf=1;soConsig=']);
    if (nDoc) al.push(['carros', `${nDoc} ${nDoc === 1 ? 'carro com documentação pendente' : 'carros com documentação pendente'}`, false, 'st=Todos;docf=1;soConsig=']);
    // Resumo: o painel escuro responde "como estamos?"; abaixo, o que precisa de atenção e os sócios. O detalhe fica no Gerencial.
    const soc = Reports.porSocio(S.D, S.expenses, '', '', J);
    const proj = s.proj - (S.DV.jurosPend || 0), emEst = s.estoque + s.reservados;
    // Tudo no Resumo leva ao detalhe: data-go abre a aba e data-ui ajusta o filtro dela (ex.: "st=Em estoque").
    const link = (go, ui, label) => `data-go="${go}"${ui ? ` data-ui="${esc(ui)}"` : ''} tabindex="0" role="link" aria-label="${esc(label)}"`;
    const R = (t, v, sub, go, ui) => `<div class="hq-i" ${go === 'act' ? `data-act="${ui}" tabindex="0" role="button" aria-label="${esc(t)}: ver detalhes"` : link(go, ui, `${t}: ver detalhes`)}><dt>${esc(t)}</dt><dd>${v}</dd>${sub ? `<dd class="sub">${sub}</dd>` : ''}</div>`;
    let h = `<section class="hq" aria-label="Resumo"><div class="hq-main" ${link('gerencial', 'rep=lucro', 'Lucro líquido: ver por mês')}><p class="hq-l">Lucro líquido</p><p class="hq-big${s.lucroLiq < 0 ? ' neg' : ''}">${money(s.lucroLiq)}</p>` +
      `<p class="hq-sub">${J.total ? `${brl(s.lucro)} dos carros vendidos, menos ${brl(J.total)} de juros` : `${s.vendidos} ${s.vendidos === 1 ? 'carro vendido' : 'carros vendidos'}`}</p></div><dl class="hq-row">` +
      R('Em estoque', `${emEst} ${emEst === 1 ? 'carro' : 'carros'}`, `${s.consigEstoque ? `${s.consigEstoque} ${s.consigEstoque === 1 ? 'consignado' : 'consignados'}, ` : ''}${brl(s.parado)} investidos`, 'carros', 'st=Em estoque;soConsig=') +
      R('Lucro projetado', money(proj), S.DV.jurosPend > 0.004 ? `após ${brl(S.DV.jurosPend)} de juros a pagar` : 'pelo preço de anúncio', 'gerencial', 'rep=estoque') +
      R('A receber', money(s.aReceber), s.atrasado > 0.004 ? `<span class="neg">${brl(s.atrasado)} vencido</span>` : 'nada vencido', 'vendas', 'vf=A receber') +
      R('A pagar', money(S.DV.total), S.DV.total > 0.004 ? (S.DV.atrasado > 0.004 ? `<span class="neg">${brl(S.DV.atrasado)} vencido</span>` : `próximo em ${dmy(S.DV.prox)}`) : 'nada em aberto', 'act', 'rs-apagar') + '</dl></section>';

    if (al.length) {
      const PAG = { carros: 'Carros', onde: 'Onde estão', vendas: 'Vendas', apagar: 'Veículos a pagar', emprestimos: 'Empréstimos', previstos: 'Previstos' };
      h += `<section class="sec"><div class="sec-h"><h2>Precisa de atenção</h2></div><ul class="att">` +
        al.map((a) => `<li><button class="${a[2] ? 'bad' : ''}" data-go="${a[0]}"${a[3] ? ` data-ui="${esc(a[3])}"` : ''}><span>${esc(a[1])}</span><span class="go">${esc(PAG[a[0]] || '')}</span></button></li>`).join('') + '</ul></section>';
    }
    const [a0] = s.acerto;
    const msg = Math.abs(a0.saldo) < 0.005 ? 'Ninguém deve nada a ninguém.' : a0.saldo > 0 ? `${nm('B')} deve ${brl(a0.saldo)} a ${nm('A')}.` : `${nm('A')} deve ${brl(-a0.saldo)} a ${nm('B')}.`;
    h += `<div class="sec cols"><section><div class="sec-h"><h2>Sócios</h2></div><div class="duo">` +
      ['A', 'B'].map((p) => `<div class="socio" ${link('gerencial', 'rep=socios', `${nm(p)}: ver detalhes`)}><div class="nm">${esc(nm(p))}</div><div class="big${soc[p].vendidos.lucLiq < 0 ? ' neg' : ''}">${money(soc[p].vendidos.lucLiq)}</div><div class="sm">de lucro, com ${brl(soc[p].estoque.inv)} investidos hoje</div></div>`).join('') +
      `</div><p class="acerto" ${link('gerencial', 'rep=socios', 'Acerto entre sócios: ver detalhes')}>${esc(msg)}</p></section>` +
      `<section><div class="sec-h"><h2>Lucro líquido por mês</h2><div class="yearnav"><button class="btn sm" data-act="yr" data-d="-1" aria-label="Ano anterior">‹</button><b class="num">${S.year}</b><button class="btn sm" data-act="yr" data-d="1" aria-label="Próximo ano">›</button></div></div><div class="hq-chart" ${link('gerencial', 'rep=lucro', 'Lucro por mês: ver tabela')}>${chart(s.months)}</div></section></div>`;
    h += '<p class="more"><button class="linkbtn" data-go="gerencial">Todos os números no Gerencial</button></p>';
    el.innerHTML = h;
  },
};

views.carros = {
  mount(el) {
    el.innerHTML = `<div class="toolbar"><input type="text" id="q" class="grow" placeholder="Buscar por nome, placa ou comprador" value="${esc(S.ui.q)}" aria-label="Buscar carro"><div class="chips" id="stchips"></div><button class="chip" id="soconsig" aria-pressed="${!!S.ui.soConsig}">Consignados</button><button class="chip" id="docf" aria-pressed="${!!S.ui.docf}">Documentação</button><button class="chip" id="bymarca" aria-pressed="${!!S.ui.byMarca}">Agrupar por montadora</button>${S.canWrite ? '<button class="btn pri" data-act="new-car">Novo carro</button>' : ''}</div><div id="list"></div>`;
    $('#q').oninput = function () { S.ui.q = this.value; views.carros.paint(); };
    $('#docf').onclick = function () { S.ui.docf = S.ui.docf ? '' : '1'; this.setAttribute('aria-pressed', String(!!S.ui.docf)); views.carros.paint(); };
    $('#soconsig').onclick = function () { S.ui.soConsig = !S.ui.soConsig; this.setAttribute('aria-pressed', String(S.ui.soConsig)); views.carros.paint(); };
    $('#bymarca').onclick = function () {
      S.ui.byMarca = !S.ui.byMarca; this.setAttribute('aria-pressed', String(S.ui.byMarca));
      try { localStorage.setItem('bc.byMarca', S.ui.byMarca ? '1' : ''); } catch { /* sem armazenamento: vale só nesta visita */ }
      views.carros.paint();
    };
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
      if (S.ui.soConsig && !d.consig) return false;
      if (S.ui.docf && !(transfPendente(d) || c.docPend)) return false; // só pendências de documento
      return !q || [c.name, c.placa, c.comprador, marcaOf(c)].join(' ').toLowerCase().includes(q);
    }).sort((a, b) => (a.vendido - b.vendido) || String(b.c.dcompra || '').localeCompare(String(a.c.dcompra || '')));
    if (list.length && S.ui.byMarca) {
      const g = {};
      list.forEach((d) => { (g[marcaOf(d.c)] = g[marcaOf(d.c)] || []).push(d); });
      const keys = Object.keys(g).sort((a, b) => (g[b].length - g[a].length) || a.localeCompare(b, 'pt-BR'));
      box.innerHTML = keys.map((k) => {
        const est = g[k].filter((d) => !d.vendido).length;
        return `<section class="mgrp"><h2 class="mgrp-h">${esc(k)} <span class="mut small">${g[k].length} ${g[k].length === 1 ? 'carro' : 'carros'}${est ? ` · ${est} em estoque` : ''}</span></h2><div class="cars">${g[k].map(carCard).join('')}</div></section>`;
      }).join('');
      return;
    }
    box.innerHTML = list.length ? `<div class="cars">${list.map(carCard).join('')}</div>` : '<div class="empty"><p class="mut" style="margin:0">Nenhum carro encontrado com esse filtro.</p></div>';
  },
};

/* ---------- Sócios: lucro de cada um (detalhado) e dívida entre os sócios ---------- */
views.socios = {
  mount(el) {
    el.innerHTML = '<div class="toolbar"><div class="chips" id="sochips"></div><span class="grow"></span><div class="chips" id="soper"></div></div><div id="list" class="stack"></div>';
    this.paint();
  },
  paint() {
    const box = $('#list');
    if (!box) return;
    const f = S.ui.sof || 'lucro';
    $('#sochips').innerHTML = [['lucro', 'Lucro por sócio'], ['divida', 'Dívida entre sócios']].map(([k, l]) => `<button class="chip" data-act="so-f" data-id="${k}" aria-pressed="${f === k}">${l}</button>`).join('');
    const per = S.ui.sper || 'ano';
    $('#soper').innerHTML = f === 'lucro' ? [['mes', 'Este mês'], ['ano', 'Este ano'], ['tudo', 'Tudo']].map(([k, l]) => `<button class="chip" data-act="so-per" data-id="${k}" aria-pressed="${per === k}">${l}</button>`).join('') : '';
    $('#soper').hidden = f !== 'lucro';
    box.innerHTML = f === 'lucro' ? lucroSocios(per) : dividaSociosHtml();
  },
};
const KP = (t, v, cls, hero, sub) => `<div class="kpi${hero ? ' hero' : ''}"><dt>${esc(t)}</dt><dd class="${cls || ''}">${v}</dd>${sub ? `<dd class="sub">${sub}</dd>` : ''}</div>`;
/** Lucro de cada sócio no período: por carro vendido, menos a metade dos juros pagos, e por mês. */
function lucroSocios(per) {
  const p = Reports.periodo(per, today()), J = Calc.jurosPagos(S.payables, S.loans, p.from, p.to);
  const soc = Reports.porSocio(S.D, S.expenses, p.from, p.to, J), rk = Reports.ranking(S.D, p.from, p.to).rows.sort((a, b) => String(b.dvenda).localeCompare(String(a.dvenda)));
  const lm = Reports.lucroMensal(S.D, p.from, p.to, J);
  let h = '<dl class="grid kpis" style="margin:0">' + ['A', 'B'].map((x) => {
    const v = soc[x].vendidos;
    return KP(`Lucro líquido de ${nm(x)}`, money(v.lucLiq), v.lucLiq < 0 ? 'neg' : '', true, `${brl(v.luc)} dos carros${v.juros ? `, menos ${brl(v.juros)} de juros` : ''}`) +
      KP(`Investido hoje por ${nm(x)}`, money(soc[x].estoque.inv), '', false, `${soc[x].estoque.n} ${soc[x].estoque.n === 1 ? 'carro' : 'carros'} em estoque`);
  }).join('') + '</dl>';
  const divisao = (r) => { const d = S.D[r.carId]; if (!d) return ''; const pa = Math.round(d.pA * 100); return pa === 50 ? 'metade cada' : `${pa}% e ${100 - pa}%`; };
  const tA = rk.reduce((a, r) => a + r.lucA, 0), tB = rk.reduce((a, r) => a + r.lucB, 0), tL = rk.reduce((a, r) => a + r.lucro, 0);
  const foot = { Carro: 'Total dos carros', Lucro: brl(tL), [nm('A')]: brl(tA), [nm('B')]: brl(tB) };
  h += `<section class="panel"><div class="panel-h"><h2>Lucro de cada carro vendido</h2></div>` + table([
    { label: 'Carro', get: (r) => `<b>${esc(r.car)}</b><div class="mut small">${r.dvenda ? 'vendido em ' + dmy(r.dvenda) : ''}${divisao(r) ? `, ${divisao(r)}` : ''}</div>` },
    { label: 'Venda', r: true, get: (r) => brl(r.vvenda) },
    { label: 'Lucro', r: true, get: (r) => `<span class="${sign(r.lucro)}">${brl(r.lucro)}</span>` },
    { label: nm('A'), r: true, get: (r) => `<span class="${sign(r.lucA)}">${brl(r.lucA)}</span>` },
    { label: nm('B'), r: true, get: (r) => `<span class="${sign(r.lucB)}">${brl(r.lucB)}</span>` },
  ], rk, rk.length ? foot : null, 'Nenhum carro vendido no período.') +
    (J.total ? `<p class="note">Juros de empréstimos pagos no período: ${brl(J.total)}, metade de cada (${brl(J.total / 2)}). Lucro líquido: ${esc(nm('A'))} <b>${brl(soc.A.vendidos.lucLiq)}</b> e ${esc(nm('B'))} <b>${brl(soc.B.vendidos.lucLiq)}</b>.</p>` : '') + '</section>';
  const meses = lm.rows.filter((r) => r.n || r.juros);
  h += `<section class="panel"><div class="panel-h"><h2>Lucro líquido por mês</h2></div>` + table([
    { label: 'Mês', get: (r) => esc(mlabelBr(r.mes)) }, { label: 'Vendas', r: true, get: (r) => r.n },
    { label: nm('A'), r: true, get: (r) => `<span class="${sign(r.liqA)}">${brl(r.liqA)}</span>` },
    { label: nm('B'), r: true, get: (r) => `<span class="${sign(r.liqB)}">${brl(r.liqB)}</span>` },
    { label: 'Total', r: true, get: (r) => `<b class="${sign(r.liq)}">${brl(r.liq)}</b>` },
  ], meses, meses.length ? { Mês: 'Total', Vendas: lm.total.n, [nm('A')]: brl(lm.total.liqA), [nm('B')]: brl(lm.total.liqB), Total: brl(lm.total.liq) } : null, 'Sem vendas no período.') + '</section>';
  return h;
}
const MES_BR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mlabelBr = (k) => (/^\d{4}-\d{2}$/.test(k) ? `${MES_BR[+k.slice(5) - 1]}/${k.slice(2, 4)}` : k || 'Sem data');
/** Dívida entre os sócios: saldo, o acerto dos carros vendidos e o histórico de dívidas e abatimentos. */
function dividaSociosHtml() {
  const dv = Calc.dividaSocios(S.pdebts);
  const J = Calc.jurosPagos(S.payables, S.loans), sm = Calc.summary(S.D, S.expenses, S.planned, S.settings, today(), S.year, J);
  // número grande: só o valor; quem deve a quem vai embaixo (o texto inteiro não cabia no cartão)
  const valor = (v, nada) => (Math.abs(v) < 0.005 ? nada : brl(Math.abs(v)));
  const quem = (v) => (v > 0 ? `${nm('B')} deve a ${nm('A')}` : `${nm('A')} deve a ${nm('B')}`);
  const sub = (v, resto) => (Math.abs(v) < 0.005 ? resto : esc(quem(v)));
  const carros = sm.acerto[0].saldo, total = Math.round((dv.saldo + carros) * 100) / 100;
  let h = '<dl class="grid kpis" style="margin:0">' +
    KP('Dívida entre sócios', valor(dv.saldo, 'Ninguém deve'), '', true, Math.abs(dv.saldo) >= 0.005 && dv.A > 0.004 && dv.B > 0.004 ? `${esc(quem(dv.saldo))} (${esc(nm('A'))} deve ${brl(dv.A)} e ${esc(nm('B'))} ${brl(dv.B)})` : sub(dv.saldo, 'só as dívidas lançadas aqui')) +
    KP('Acerto dos carros vendidos', valor(carros, 'Tudo acertado'), '', false, sub(carros, 'pelo que cada um investiu e recebeu')) +
    KP('No total', valor(total, 'Ninguém deve'), '', false, sub(total, 'dívida + acerto dos carros')) + '</dl>';
  if (S.canWrite) h += `<div class="toolbar"><button class="btn pri" data-act="pd-new" data-tipo="Dívida">Nova dívida</button><button class="btn" data-act="pd-new" data-tipo="Abatimento" data-como="Num carro"${dv.saldo > 0 ? ' data-dev="B"' : dv.saldo < 0 ? ' data-dev="A"' : ''}>Abater num carro</button><button class="btn" data-act="pd-new" data-tipo="Abatimento" data-como="Dinheiro"${dv.saldo > 0 ? ' data-dev="B"' : dv.saldo < 0 ? ' data-dev="A"' : ''}>Pago em dinheiro</button><span class="mut small">Quem deve pode abater pagando a parte do outro num carro que entra, ou passando o valor em dinheiro ou Pix.</span></div>`;
  const rows = (S.pdebts || []).filter((x) => !x.deleted).sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
  h += `<section class="panel"><div class="panel-h"><h2>Histórico</h2></div>` + table([
    { label: 'Data', get: (x) => dmy(x.date) },
    { label: 'O que', get: (x) => x.tipo === 'Abatimento' ? `${esc(nm(x.devedor))} abateu` : `${esc(nm(x.devedor))} ficou devendo` },
    { label: 'Valor', r: true, get: (x) => (x.tipo === 'Abatimento' ? `<span class="pos">− ${brl(Calc.num(x.valor))}</span>` : `<b>${brl(Calc.num(x.valor))}</b>`) },
    { label: 'Como', get: (x) => (x.carId && x.como !== 'Dinheiro' && x.como !== 'Pix' ? esc(carName(x.carId)) : x.como && x.tipo === 'Abatimento' ? esc(x.como) : '<span class="mut">—</span>') },
    { label: 'Observação', get: (x) => esc(x.obs || '') },
    { label: '', get: (x) => (S.canWrite ? `<div class="row-acts"><button class="btn sm" data-act="pd-edit" data-id="${x.id}">Editar</button><button class="btn sm" data-act="pd-del" data-id="${x.id}">Excluir</button></div>` : '') },
  ], rows, null, 'Nenhuma dívida registrada. Use "Nova dívida" quando um sócio ficar devendo ao outro.') + '</section>';
  return h;
}

/* ---------- Consignados: carros de terceiros que a gente vende ---------- */
views.consignados = {
  mount(el) {
    el.innerHTML = `<div class="toolbar"><div class="chips" id="cgchips"></div><span class="grow"></span>${S.canWrite ? '<button class="btn pri" data-act="new-car">Novo carro</button>' : ''}</div><div id="list" class="stack"></div>`;
    this.paint();
  },
  paint() {
    const box = $('#list');
    if (!box) return;
    const f = S.ui.cgf || 'Todos';
    $('#cgchips').innerHTML = ['Todos', 'Em estoque', 'Vendidos', 'A repassar', 'Por dono'].map((x) => `<button class="chip" data-act="cg-f" data-id="${x}" aria-pressed="${f === x}">${x}</button>`).join('');
    const c = Reports.consignados(S.D, today()), t = c.total;
    if (!c.rows.length) {
      box.innerHTML = empty('Nenhum carro consignado', 'Carro de terceiro que vocês vendem: no cadastro, preencha "Dono do carro" e o repasse combinado. Ele aparece aqui com a comissão e o que falta repassar.', 'Cadastrar carro', 'new-car');
      return;
    }
    const est = c.rows.filter((r) => !r.vendido), proj = est.reduce((a, r) => a + (r.proj || 0), 0);
    const K = (tt, v, cls, hero, sub) => `<div class="kpi${hero ? ' hero' : ''}"><dt>${esc(tt)}</dt><dd class="${cls || ''}">${v}</dd>${sub ? `<dd class="sub">${sub}</dd>` : ''}</div>`;
    let h = '<dl class="grid kpis" style="margin:0">' +
      K('Em estoque', `${est.length} ${est.length === 1 ? 'carro' : 'carros'}`, '', true, est.length ? `comissão prevista de ${brl(proj)}` : '') +
      K('Comissão realizada', money(t.comissao), t.comissao < 0 ? 'neg' : '', false, `${t.vendidos} ${t.vendidos === 1 ? 'vendido' : 'vendidos'}, ${esc(nm('A'))} ${brl(t.comA)} e ${esc(nm('B'))} ${brl(t.comB)}`) +
      K('A repassar aos donos', money(t.falta), t.falta > 0.004 ? 'neg' : '', false, (t.falta > 0.004 ? 'de carros já vendidos' : 'nada de carros vendidos') + (est.length ? `, mais ${brl(est.reduce((a, r) => a + r.donoParte + (r.proj != null ? (r.donoLucroPrev || 0) : 0), 0))} previstos dos que estão em estoque` : '')) +
      K('Os donos recebem', money(t.donoRecebe), '', false, t.donoLucro > 0.004 ? `${brl(t.donoLucro)} de lucro dos donos sócios` : 'pelos carros vendidos') + '</dl>';
    if (f === 'Por dono') {
      h += `<p class="mut small" style="margin:0">Quanto cada dono recebeu e ganhou com vocês. Clique no nome para ver os carros dele.</p>` + table([
        { label: 'Dono', get: (o) => `<button class="linkbtn" data-act="cg-dono" data-id="${esc(o.dono)}"><b>${esc(o.dono)}</b></button><div class="mut small">${esc(o.carros.join(', '))}</div>` },
        { label: 'Carros', r: true, get: (o) => `${o.n}<div class="mut small">${o.vendidos} ${o.vendidos === 1 ? 'vendido' : 'vendidos'}</div>` },
        { label: 'Recebe nas vendas', r: true, get: (o) => `<b>${brl(o.recebe)}</b>${o.falta > 0.004 ? `<div class="neg small">falta repassar ${brl(o.falta)}</div>` : ''}` },
        { label: 'Lucro dele', r: true, get: (o) => (o.lucro ? `<span class="${sign(o.lucro)}">${brl(o.lucro)}</span>` : '<span class="mut">—</span>') },
        { label: 'Em estoque', r: true, get: (o) => (o.estoque ? `${brl(o.emEstoque)}${o.lucroPrev ? `<div class="mut small">lucro previsto ${brl(o.lucroPrev)}</div>` : ''}` : '<span class="mut">—</span>') },
      ], c.porDono, null, 'Nenhum dono.');
      box.innerHTML = h; return;
    }
    const so = S.ui.cgdono || '';
    if (so) h += `<div class="toolbar"><span>Carros de <b>${esc(so)}</b></span><button class="btn sm" data-act="cg-dono" data-id="">Ver todos os donos</button></div>`;
    const rows = c.rows.filter((r) => (!so || String(r.dono).trim().toLowerCase() === so.toLowerCase()) && (f === 'Todos' || (f === 'Em estoque' && !r.vendido) || (f === 'Vendidos' && r.vendido) || (f === 'A repassar' && r.vendido && r.falta > 0.004)));
    const sit = (r) => {
      const d = S.D[r.carId] || {};
      if (!r.vendido) return `Em estoque${d.dias != null ? `<div class="mut small">há ${d.dias} ${d.dias === 1 ? 'dia' : 'dias'}</div>` : ''}`;
      return `Vendido${r.dvenda ? `<div class="mut small">em ${dmy(r.dvenda)}</div>` : ''}`;
    };
    h += table([
      { label: 'Carro', get: (r) => `<b>${esc(r.car)}</b>${r.placa ? `<div class="mut small">${esc(r.placa)}</div>` : ''}` },
      { label: 'Dono', get: (r) => esc(r.dono || '—') },
      { label: 'Situação', get: sit },
      { label: 'Dono recebe', r: true, get: (r) => (r.vendido ? `<b>${brl(r.donoRecebe)}</b>${r.donoLucro ? `<div class="small ${sign(r.donoLucro)}">${brl(r.donoLucro)} de lucro</div>` : ''}<div class="mut small">repassado ${brl(r.repassado)}</div>`
        : `<b>${brl(r.donoParte)}</b> <span class="mut small">fixo</span>${r.socio ? (r.donoLucroPrev != null && r.proj != null ? `<div class="small ${sign(r.donoLucroPrev)}">+ ${brl(r.donoLucroPrev)} de lucro projetado</div>` : '<div class="mut small">lucro: informe o anúncio para projetar</div>') : ''}`) },
      { label: 'A repassar', r: true, get: (r) => (r.vendido ? (r.falta > 0.004 ? `<span class="neg">${brl(r.falta)}</span>` : '<span class="mut">nada</span>')
        : `${brl(r.donoParte + (r.proj != null ? (r.donoLucroPrev || 0) : 0))}<div class="mut small">${r.socio && r.proj != null ? 'previsto, pelo anúncio' : 'quando vender'}</div>`) },
      { label: 'Nosso ganho', r: true, get: (r) => (r.vendido ? `<span class="${sign(r.comissao)}">${brl(r.comissao)}</span>${r.gastos > 0.004 ? `<div class="mut small">e ${brl(r.gastos)} de gastos de volta</div>` : ''}` : (r.proj != null ? `<span class="mut">prevista ${brl(r.proj)}</span>` : '<span class="mut">sem anúncio</span>')) },
      { label: '', get: (r) => `<div class="row-acts">${r.vendido ? `<button class="btn sm" data-act="repasses" data-id="${r.carId}">Repasses</button>` : (S.canWrite ? `<button class="btn sm pri" data-act="sell-car" data-id="${r.carId}">Vender</button>` : '')}${S.canWrite ? `<button class="btn sm" data-act="edit-car" data-id="${r.carId}">Editar</button>` : ''}</div>` },
    ], rows, null, 'Nenhum carro neste filtro.');
    box.innerHTML = h;
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
    el.innerHTML = `<div class="toolbar"><div class="chips" id="gstchips"></div></div><div class="toolbar"><select id="gcar" class="grow" aria-label="Filtrar por carro"></select><select id="gquem" aria-label="Filtrar por sócio"><option value="">Todos os sócios</option>${['A', 'B'].map((p) => `<option value="${p}"${S.ui.gquem === p ? ' selected' : ''}>${esc(nm(p))}</option>`).join('')}</select>${S.canWrite ? '<button class="btn pri" data-act="new-exp">Novo gasto</button>' : ''}</div><div id="list"></div>`;
    $('#gcar').onchange = function () { S.ui.gcar = this.value; views.gastos.paint(); };
    $('#gquem').onchange = function () { S.ui.gquem = this.value; views.gastos.paint(); };

    this.paint();
  },
  paint() {
    const box = $('#list');
    if (!box) return;
    $('#gcar').innerHTML = carOptions(S.ui.gcar);
    $('#gstchips').innerHTML = [['', 'Todos'], ['pend', 'Pendentes'], ['quit', 'Quitados']].map(([k, l]) => `<button class="chip" data-act="gst-f" data-id="${k}" aria-pressed="${(S.ui.gst || '') === k}" title="${k === 'pend' ? 'Gastos no cartão com parcela a pagar' : k === 'quit' ? 'Pagos à vista ou com o cartão todo pago' : ''}">${l}</button>`).join('');
    const all = S.expenses.filter((x) => !x.deleted);
    // pendente: gasto no cartão com parcela ainda não paga; o resto (à vista ou cartão todo pago) está quitado
    const pendente = (x) => { const g = S.DV.porGasto && S.DV.porGasto[x.id]; return !!g && g.falta > 0.004; };
    if (!all.length) { box.innerHTML = empty('Nenhum gasto lançado', 'Lance cada gasto com o carro, a categoria e quem pagou. Ele entra no custo do carro na hora.', 'Lançar primeiro gasto', 'new-exp'); return; }
    const rows = all.filter((x) => (!S.ui.gcar || String(x.carId) === S.ui.gcar) && (!S.ui.gquem || x.quem === S.ui.gquem || !x.quem) && (!S.ui.gst || (S.ui.gst === 'pend') === pendente(x))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const sum = (arr) => arr.reduce((a, x) => a + (Calc.num(x.valor) || 0), 0);
    const parte = (p) => rows.reduce((a, x) => a + (x.quem === p ? (Calc.num(x.valor) || 0) : x.quem ? 0 : (Calc.num(x.valor) || 0) / 2), 0);
    // faturas do cartão ainda não pagas (todos os gastos, sem filtro)
    const G = Object.values(S.DV.porGasto || {}), cFalta = G.reduce((a, g) => a + g.falta, 0), cVenc = G.reduce((a, g) => a + g.atrasado, 0);
    const cProx = G.map((g) => g.prox).filter(Boolean).sort()[0];
    let h = `<dl class="grid kpis" style="margin:0 0 12px"><div class="kpi"><dt>Total</dt><dd>${brl(sum(rows))}</dd></div>${['A', 'B'].map((p) => `<div class="kpi"><dt>${esc(nm(p))}</dt><dd>${brl(parte(p))}</dd></div>`).join('')}` +
      (cFalta > 0.004 ? `<div class="kpi"><dt>Cartão a pagar</dt><dd class="${cVenc > 0.004 ? 'neg' : ''}">${brl(cFalta)}</dd><dd class="sub">${cVenc > 0.004 ? `${brl(cVenc)} vencido` : cProx ? `próxima fatura em ${dmy(cProx)}` : ''}</dd></div>` : '') + '</dl>';
    const cartaoTxt = (x) => {
      const g = S.DV.porGasto && S.DV.porGasto[x.id];
      if (x.forma !== 'Cartão de crédito' || !g) return x.forma ? `<div class="mut small">${esc(x.forma)}</div>` : '';
      const st = g.falta <= 0.004 ? '<span class="pill ok">Pago</span>' : g.atrasado > 0.004 ? `<span class="pill late">Fatura vencida ${brl(g.atrasado)}</span>` : `<span class="mut small">${g.nPago}/${g.n} pagas, próxima ${dmy(g.prox)}</span>`;
      return `<div class="small">Cartão ${g.n > 1 ? g.n + 'x' : 'à vista'}${x.cartao ? ' (' + esc(x.cartao) + ')' : ''} ${st} <button class="linkbtn" data-act="dv-parc-exp" data-id="${x.id}">Parcelas</button></div>`;
    };
    h += '<div class="tbl"><table><thead><tr><th>Data</th><th>Carro</th><th>Categoria</th><th>Descrição</th><th class="r">Valor</th><th>Quem</th><th></th></tr></thead><tbody>' + rows.map((x) =>
      `<tr><td class="num">${dmy(x.date)}</td><td>${esc(carName(x.carId))}</td><td>${esc(x.cat || '')}</td><td>${esc(x.desc || '')}${x.obs ? `<div class="mut" style="font-size:12px">${esc(x.obs)}</div>` : ''}</td><td class="r num">${brl(Calc.num(x.valor))}${cartaoTxt(x)}</td><td>${x.quem ? esc(nm(x.quem)) : 'Metade cada'}</td><td style="white-space:nowrap">${S.canWrite ? `<button class="btn sm" data-act="edit-exp" data-id="${x.id}">Editar</button> <button class="btn sm danger" data-act="del-exp" data-id="${x.id}">Excluir</button>` : ''}</td></tr>`).join('') + '</tbody></table></div>';
    box.innerHTML = rows.length ? h : `<div class="empty"><p class="mut" style="margin:0">${S.ui.gst === 'pend' ? 'Nenhum gasto com parcela do cartão a pagar.' : 'Nenhum gasto com esse filtro.'}</p></div>`;
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
    el.innerHTML = `<div class="toolbar"><button class="btn sm" data-go="ajustes">‹ Voltar para Ajustes</button></div><p class="mut" style="margin:0">Registro automático de quem criou, editou, moveu ou excluiu cada coisa. O histórico não pode ser editado nem apagado, nem pelo app.</p><div class="toolbar"><select id="hu" aria-label="Filtrar por pessoa"></select><select id="he" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option>${[['car', 'Carros'], ['expense', 'Gastos'], ['planned', 'Previstos'], ['receipt', 'Recebimentos'], ['loan', 'Empréstimos'], ['payable', 'Contas a pagar'], ['pdebt', 'Dívida entre sócios'], ['settings', 'Ajustes'], ['user', 'Usuários']].map((e) => `<option value="${e[0]}"${S.ui.he === e[0] ? ' selected' : ''}>${e[1]}</option>`).join('')}</select></div><div id="list" class="log"></div>`;
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
    h += `<section class="panel"><h2>Histórico</h2><p class="mut">Quem criou, editou, moveu ou excluiu cada coisa no app.</p><div class="acts" style="margin-top:8px"><button class="btn" data-go="historico">Ver histórico</button></div></section>`;
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
