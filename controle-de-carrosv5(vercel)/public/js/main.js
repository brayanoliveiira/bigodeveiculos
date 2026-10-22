// Ponto de entrada: login, carregamento dos dados, abas, ações dos botões e atualização automática.
import { $, esc, brl, dmy as dmyStr, today, parseMoney, toast, initials } from './util.js';
import { api, ApiError, setUnauthorizedHandler } from './api.js';
import { S, LISTS, names, itemOf } from './state.js';
import { openForm, openPlanForm, confirmBox, closeModal, setHooks } from './forms.js';
import { views, ROLE_NAME } from './views.js';
import { renderReceipts, renderRepasses } from './vendas.js';
import { renderParcelas } from './dividas.js';
import { exportCsv } from './gerencial.js';

const TABS = [['resumo', 'Resumo'], ['carros', 'Carros'], ['consignados', 'Consignados'], ['onde', 'Onde estão'], ['vendas', 'Vendas'], ['apagar', 'Veículos a pagar'], ['emprestimos', 'Empréstimos'], ['gastos', 'Gastos'], ['previstos', 'Previstos'], ['gerencial', 'Gerencial'], ['historico', 'Histórico'], ['ajustes', 'Ajustes']];
const POLL_MS = 5000;
let pollTimer = null;

const banner = (msg, bad) => { $('#banner').innerHTML = msg ? `<div class="banner${bad ? ' bad' : ''}">${esc(msg)}</div>` : ''; };

/* ---------- dados ---------- */
function recompute() {
  S.D = Calc.compute(S.cars, S.expenses, S.planned, S.settings, today(), S.receipts, S.payments, S.repasses);
  S.DV = Calc.debts(S.payables, S.loans, S.cars, today());
  // Carros que hoje "carregam" dinheiro de empréstimo ainda não quitado (segue as trocas a partir do carro comprado).
  S.loanHold = {};
  (S.loans || []).filter((l) => !l.deleted && l.carId != null && !(S.DV.porLoan[l.id] && S.DV.porLoan[l.id].quitado)).forEach((l) => {
    const t = Calc.loanTrail(l.carId, S.cars, (c) => !!(S.D[c.id] && S.D[c.id].entregue));
    if (t) t.holders.forEach((c) => { (S.loanHold[c.id] = S.loanHold[c.id] || []).push(l); });
  });
}

async function loadAudit() {
  const r = await api('GET', '/api/audit?limit=500');
  S.audit = r.audit; S.auditLoaded = true;
}
async function loadUsers() {
  if (S.me.role !== 'admin') return;
  S.users = (await api('GET', '/api/users')).users;
}

/** Busca tudo de novo no servidor e redesenha a aba atual (sem apagar o que a pessoa está digitando). */
async function reload() {
  const d = await api('GET', '/api/data');
  S.cars = d.cars; S.expenses = d.expenses; S.planned = d.planned; S.receipts = d.receipts; S.payments = d.payments || []; S.repasses = d.repasses || []; S.loans = d.loans || []; S.payables = d.payables || []; S.settings = d.settings; S.version = d.version; S.loaded = true;
  if (S.tab === 'historico') await loadAudit();
  if (S.tab === 'ajustes') await loadUsers();
  recompute();
  views[S.tab].paint();
  if (S.ui.rcCar && $('#modal').querySelector('.rc-sum')) renderReceipts(S.ui.rcCar); // janela de recebimentos aberta: atualiza
  if (S.ui.repCar && $('#modal').querySelector('.rp-sum')) renderRepasses(S.ui.repCar);
  if (S.ui.dvOwner && $('#modal').querySelector('.dv-sum')) renderParcelas(S.ui.dvOwner);
}
setHooks({ reload });

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (document.hidden || !S.me) return;
    try {
      const { version } = await api('GET', '/api/version');
      if (version !== S.version) { await reload(); banner(''); }
      else if ($('#banner').textContent.includes('conexão')) banner('');
    } catch (e) {
      if (e.status === 0) banner('Sem conexão com o servidor. Tentando de novo…', true);
    }
  }, POLL_MS);
}
function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me) reload().catch(() => {}); });

/* ---------- login ---------- */
function showLogin(message) {
  stopPolling();
  S.me = null; S.loaded = false; S.auditLoaded = false;
  closeModal(); banner('');
  $('#top').hidden = true; $('#tabs').hidden = true;
  $('#view').innerHTML = `<div class="login"><form id="login" novalidate><div class="login-brand"><svg class="logo" viewBox="0 0 48 22" aria-hidden="true"><path d="M24 8.5C21.5 4.5 16.5 3.2 11.5 5 6.5 6.8 3.2 11 1 16.5c4.2-2.7 8.6-3.2 12.4-1.6 3.6 1.5 7.4.6 10.6-2.4 3.2 3 7 3.9 10.6 2.4 3.8-1.6 8.2-1.1 12.4 1.6-2.2-5.5-5.5-9.7-10.5-11.5-5-1.8-10-.5-12.5 3.5z"/></svg><h1>Bigodes Car</h1><p class="mut">Entre com o seu usuário para continuar.</p></div>
    <div class="field"><label for="lu">Usuário</label><input type="text" id="lu" autocomplete="username" autocapitalize="none" spellcheck="false"></div>
    <div class="field"><label for="lp">Senha</label><input type="password" id="lp" autocomplete="current-password"></div>
    <div class="err" id="lerr" role="alert">${esc(message || '')}</div>
    <button class="btn pri" type="submit" id="lgo">Entrar</button></form></div>`;
  $('#lu').focus();
  $('#login').onsubmit = async (ev) => {
    ev.preventDefault();
    $('#lgo').disabled = true; $('#lerr').textContent = '';
    try {
      const r = await api('POST', '/api/login', { username: $('#lu').value.trim(), password: $('#lp').value });
      await start(r.user);
    } catch (e) {
      $('#lerr').textContent = e.message;
      $('#lgo').disabled = false;
      $('#lp').value = ''; $('#lp').focus();
    }
  };
}

async function start(user) {
  S.me = user;
  S.canWrite = user.role !== 'viewer';
  const h = (location.hash || '').replace('#', '');
  if (views[h]) S.tab = h;
  $('#view').innerHTML = '<div class="empty"><p class="mut">Carregando…</p></div>';
  await reload();
  renderHeader();
  $('#top').hidden = false; $('#tabs').hidden = false;
  if (!S.canWrite) banner('Seu perfil é só de leitura. Peça a um administrador para trocar seu perfil se precisar lançar dados.');
  mountTab();
  startPolling();
}

function renderHeader() {
  $('#who').innerHTML = `<span class="avatar">${esc(initials(S.me.name))}</span><span>${esc(S.me.name)}</span><button class="btn" data-act="logout">Sair</button>`;
}

/* ---------- abas ---------- */
function renderTabs() {
  $('#tabs').innerHTML = TABS.map((t) => `<button class="tab" data-go="${t[0]}"${S.tab === t[0] ? ' aria-current="page"' : ''}>${t[1]}</button>`).join('');
}
async function mountTab() {
  recompute(); renderTabs();
  const el = $('#view');
  el.innerHTML = '<div class="empty"><p class="mut">Carregando…</p></div>';
  const tab = S.tab;
  try {
    if (tab === 'historico') await loadAudit();
    if (tab === 'ajustes') await loadUsers();
  } catch (e) { banner(e.message, true); }
  if (S.tab !== tab) return;
  views[tab].mount(el);
  if (tab === 'ajustes') views.ajustes.paintUsers();
  window.scrollTo(0, 0);
}
function go(tab) {
  if (!views[tab]) tab = 'resumo';
  S.tab = tab;
  try { if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab); } catch { /* sem histórico */ }
  mountTab();
}
window.addEventListener('hashchange', () => { const t = location.hash.replace('#', ''); if (S.me && t && t !== S.tab && views[t]) go(t); });
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !$('#modal').hidden) closeModal();
  // blocos clicáveis do Resumo (não são <button>): Enter ou espaço abrem como um clique
  const t = ev.target;
  if ((ev.key === 'Enter' || ev.key === ' ') && t && t.matches && t.matches('[role="link"],[role="button"]') && t.tagName !== 'BUTTON') { ev.preventDefault(); t.click(); }
});

/* ---------- ações ---------- */
async function run(fn, okMsg) {
  try { const r = await fn(); await reload(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message); return null; }
}
const COLL = { car: 'cars', expense: 'expenses', planned: 'planned', receipt: 'receipts', payment: 'payments', repasse: 'repasses', loan: 'loans', payable: 'payables' };
const del = (kind, it, restore) => run(
  () => (restore ? api('POST', `/api/${COLL[kind]}/${it.id}/restore`) : api('DELETE', `/api/${COLL[kind]}/${it.id}`)),
  restore ? 'Restaurado.' : 'Excluído. Dá para restaurar pelo Histórico.');

function openSheet(html, wide) {
  const m = $('#modal');
  m.innerHTML = `<form class="sheet${wide ? ' wide' : ''}" id="sheet" novalidate>${html}</form>`;
  m.hidden = false;
  m.onclick = (ev) => { if (ev.target === m || ev.target.getAttribute?.('data-x') === 'cancel') closeModal(); };
  return $('#sheet');
}

function passwordForm() {
  const f = openSheet(`<h2>Trocar minha senha</h2>
    <div class="field"><label for="pw0">Senha atual</label><input type="password" id="pw0" autocomplete="current-password"></div>
    <div class="field"><label for="pw1">Nova senha (mínimo 8 caracteres)</label><input type="password" id="pw1" autocomplete="new-password"></div>
    <div class="field"><label for="pw2">Repita a nova senha</label><input type="password" id="pw2" autocomplete="new-password"></div>
    <div class="err" id="ferr" role="alert"></div><div class="acts"><button type="button" class="btn" data-x="cancel">Cancelar</button><button class="btn pri" type="submit">Salvar</button></div>`);
  $('#pw0').focus();
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    if ($('#pw1').value !== $('#pw2').value) { $('#ferr').textContent = 'As senhas novas não são iguais.'; return; }
    try {
      await api('POST', '/api/password', { current: $('#pw0').value, next: $('#pw1').value });
      closeModal(); toast('Senha alterada. Outros aparelhos precisarão entrar de novo.');
    } catch (e) { $('#ferr').textContent = e.message; }
  };
}

function userForm(u) {
  const roleOpts = LISTS.roles.map((r) => `<option value="${r}"${u && u.role === r ? ' selected' : ''}>${esc(ROLE_NAME[r])}</option>`).join('');
  const f = openSheet(`<h2>${u ? 'Editar usuário' : 'Novo usuário'}</h2><div class="fgrid">
    <div class="field"><label for="u_name">Nome</label><input type="text" id="u_name" value="${esc(u ? u.name : '')}"></div>
    <div class="field"><label for="u_user">Usuário (para entrar)</label><input type="text" id="u_user" autocapitalize="none" value="${esc(u ? u.username : '')}"${u ? ' disabled' : ''}></div>
    <div class="field"><label for="u_role">Perfil</label><select id="u_role">${roleOpts}</select><span class="hint">Membro lança e edita dados. Só leitura apenas consulta. Administrador também gerencia usuários.</span></div>
    ${u ? `<div class="field"><label for="u_active">Situação</label><select id="u_active"><option value="1"${u.active ? ' selected' : ''}>Ativo</option><option value="0"${u.active ? '' : ' selected'}>Desativado (não consegue entrar)</option></select></div>` : '<div></div>'}
    <div class="field full"><label for="u_pw">${u ? 'Nova senha (deixe em branco para não mudar)' : 'Senha inicial (mínimo 8 caracteres)'}</label><input type="password" id="u_pw" autocomplete="new-password"></div></div>
    <div class="err" id="ferr" role="alert"></div><div class="acts"><button type="button" class="btn" data-x="cancel">Cancelar</button><button class="btn pri" type="submit">Salvar</button></div>`);
  $('#u_name').focus();
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      if (!u) {
        await api('POST', '/api/users', { username: $('#u_user').value.trim(), name: $('#u_name').value, role: $('#u_role').value, password: $('#u_pw').value });
      } else {
        const body = { name: $('#u_name').value, role: $('#u_role').value, active: $('#u_active').value === '1' };
        if ($('#u_pw').value) body.password = $('#u_pw').value;
        await api('PATCH', `/api/users/${u.id}`, body);
      }
      closeModal(); await loadUsers(); await reload(); views.ajustes.paintUsers(); toast('Usuário salvo.');
    } catch (e) { $('#ferr').textContent = e.message; }
  };
}

document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-act],[data-go],[data-st],[data-vf],[data-rep]');
  if (!b || !S.me) return;
  if (b.dataset.go) {
    // data-ui="chave=valor;..." ajusta o filtro da aba antes de abrir (ex.: Em estoque, A receber, relatório do Gerencial)
    if (b.dataset.ui) b.dataset.ui.split(';').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) S.ui[kv.slice(0, i)] = kv.slice(i + 1); });
    if (b.closest('#modal')) closeModal();
    if (S.tab === b.dataset.go) mountTab(); else go(b.dataset.go);
    return;
  }
  if (b.dataset.st) { S.ui.st = b.dataset.st; views.carros.paint(); return; }
  if (b.dataset.vf) { S.ui.vf = b.dataset.vf; views.vendas.paint(); return; }
  if (b.dataset.rep) { S.ui.rep = b.dataset.rep; views.gerencial.paint(); return; }
  const act = b.dataset.act, id = b.dataset.id;
  let it;
  switch (act) {
    case 'logout':
      try { await api('POST', '/api/logout'); } catch { /* já saiu */ }
      showLogin(); break;
    case 'toggle': S.ui.open[id] = !S.ui.open[id]; views.carros.paint(); break;
    case 'receipts': renderReceipts(Number(id)); break;
    case 'rc-plan': openPlanForm(Number(id), () => renderReceipts(Number(id))); break;
    case 'rc-new': openForm('receipt', null, { prefill: { carId: Number(id) }, onDone: () => renderReceipts(Number(id)) }); break;
    case 'rc-edit': it = itemOf('receipt', id); openForm('receipt', it, { onDone: () => renderReceipts(it.carId) }); break;
    case 'rc-pay': {
      it = itemOf('receipt', id);
      const pc = (S.D[it.carId] || { parcelas: [] }).parcelas.find((x) => x.r.id === it.id);
      openForm('pay', null, { prefill: { date: today(), valor: pc ? pc.falta : Calc.num(it.valor) }, extra: { receiptId: it.id }, heading: `Registrar pagamento — ${it.label || 'parcela'}${pc ? ` (falta ${brl(pc.falta)})` : ''}`, onDone: () => renderReceipts(it.carId) });
      break;
    }
    case 'pay-edit': { it = itemOf('payment', id); const rc = itemOf('receipt', it.receiptId); openForm('pay', it, { heading: 'Editar pagamento', onDone: () => renderReceipts(rc.carId) }); break; }
    case 'pay-del': {
      it = itemOf('payment', id); const rc = itemOf('receipt', it.receiptId);
      confirmBox(`Excluir o pagamento de ${brl(Calc.num(it.valor))} de ${dmyStr(it.date)}? A parcela volta a mostrar o que falta. Dá para restaurar pelo Histórico.`, async () => { await del('payment', it); setTimeout(() => renderReceipts(rc.carId), 0); }, 'Excluir');
      break;
    }
    case 'repasses': renderRepasses(Number(id)); break;
    case 'rep-new': {
      const dd = S.D[Number(id)];
      openForm('repasse', null, { prefill: { date: today(), valor: dd && dd.repFalta > 0 ? dd.repFalta : '' }, extra: { carId: Number(id) }, heading: 'Registrar repasse ao dono', onDone: () => renderRepasses(Number(id)) });
      break;
    }
    case 'rep-edit': it = itemOf('repasse', id); openForm('repasse', it, { heading: 'Editar repasse', onDone: () => renderRepasses(it.carId) }); break;
    case 'rep-del':
      it = itemOf('repasse', id);
      confirmBox(`Excluir o repasse de ${brl(Calc.num(it.valor))}? Dá para restaurar pelo Histórico.`, async () => { await del('repasse', it); setTimeout(() => renderRepasses(it.carId), 0); }, 'Excluir');
      break;
    case 'rc-del': it = itemOf('receipt', id); confirmBox(`Excluir a parcela ${it.label || ''} de ${brl(Calc.num(it.valor))}? Dá para restaurar pelo Histórico.`, async () => { await del('receipt', it); setTimeout(() => renderReceipts(it.carId), 0); }, 'Excluir'); break;
    case 'csv': exportCsv(id); break;
    case 'print': window.print(); break;
    case 'new-car': openForm('car'); break;
    case 'edit-car': openForm('car', itemOf('car', id)); break;
    case 'sell-car': it = itemOf('car', id); openForm('car', it, { vender: true, heading: `Vender ${it.name}` }); break;
    case 'car-gastos': S.ui.gcar = String(id); go('gastos'); break;
    case 'cg-f': S.ui.cgf = id; views.consignados.paint(); break;
    case 'doc-transf': // carro vendido: confirma antes de marcar como transferido para o comprador
      it = itemOf('car', id);
      confirmBox(`Confirmar que o ${it.name}${it.placa ? ' (' + it.placa + ')' : ''} já foi transferido para o comprador${it.comprador ? ', ' + it.comprador : ''}?`,
        async () => { await api('PATCH', `/api/cars/${id}`, { docNome: 'Comprador' }); await reload(); toast('Marcado como transferido.'); }, 'Sim, transferido');
      break;
    case 'doc-ok':
      it = itemOf('car', id);
      confirmBox(`A documentação do ${it.name} está resolvida${it.docObs ? ` (${it.docObs})` : ''}?`,
        async () => { await api('PATCH', `/api/cars/${id}`, { docPend: 0, docObs: null }); await reload(); toast('Documentação resolvida.'); }, 'Sim, resolvida');
      break;
    case 'rs-apagar': { // Resumo > A pagar: quanto é de veículos e quanto é de empréstimos
      const soma = (o, k) => Object.values(o).reduce((a, g) => a + (g[k] || 0), 0);
      const linha = (go, nome, falta, venc, n) => `<li><button type="button" class="${venc > 0.004 ? 'bad' : ''}" data-go="${go}"><span>${esc(nome)}: <b>${brl(falta)}</b>${venc > 0.004 ? `, ${brl(venc)} vencido` : ''}<span class="mut small"> em ${n} ${n === 1 ? 'conta' : 'contas'}</span></span><span class="go">Ver</span></button></li>`;
      const nv = Object.values(S.DV.porCar).filter((g) => g.falta > 0.004).length, ne = Object.values(S.DV.porLoan).filter((g) => g.falta > 0.004).length;
      openSheet(`<h2>A pagar: ${brl(S.DV.total)}</h2><ul class="att">${linha('apagar', 'Veículos a pagar', soma(S.DV.porCar, 'falta'), soma(S.DV.porCar, 'atrasado'), nv)}${linha('emprestimos', 'Empréstimos', soma(S.DV.porLoan, 'falta'), soma(S.DV.porLoan, 'atrasado'), ne)}</ul>
        <p class="mut small" style="margin:0">${esc(names().A)} paga ${brl(S.DV.A)} e ${esc(names().B)} paga ${brl(S.DV.B)}.${S.DV.prox ? ` Próximo vencimento em ${dmyStr(S.DV.prox)}.` : ''}</p>
        <div class="acts"><button type="button" class="btn" data-x="cancel">Fechar</button></div>`);
      break;
    }
    case 'move': openForm('move', itemOf('car', id)); break;
    case 'del-car': it = itemOf('car', id); confirmBox(`Excluir o carro "${it.name}"? Os gastos dele deixam de contar. Dá para restaurar pelo Histórico.`, () => del('car', it), 'Excluir'); break;
    case 'new-exp': openForm('expense', null, { prefill: S.ui.gcar ? { carId: S.ui.gcar } : {} }); break;
    case 'edit-exp': openForm('expense', itemOf('expense', id)); break;
    case 'del-exp': it = itemOf('expense', id); confirmBox(`Excluir este gasto de ${brl(Calc.num(it.valor))}? Dá para restaurar pelo Histórico.`, () => del('expense', it), 'Excluir'); break;
    case 'new-pl': openForm('planned', null, { prefill: S.ui.pcar ? { carId: S.ui.pcar } : {} }); break;
    case 'edit-pl': openForm('planned', itemOf('planned', id)); break;
    case 'del-pl': it = itemOf('planned', id); confirmBox('Excluir este gasto previsto? Dá para restaurar pelo Histórico.', () => del('planned', it), 'Excluir'); break;
    case 'done-pl': {
      it = itemOf('planned', id);
      const r = await run(() => api('PATCH', `/api/planned/${id}`, { status: 'Realizado' }));
      if (r) { toast('Marcado como realizado. Lance o gasto real.'); openForm('expense', null, { prefill: { carId: it.carId, cat: it.cat, desc: it.desc, quem: it.quem, valor: Calc.num(it.valor) } }); }
      break;
    }
    case 'restore': it = itemOf(b.dataset.e, id); if (it) del(b.dataset.e, it, true); break;
    case 'yr': S.year += Number(b.dataset.d); views.resumo.paint(); break;
    case 'examples': await run(() => api('POST', '/api/examples', { today: today() }), 'Exemplos carregados.'); if (S.tab === 'ajustes') mountTab(); break;
    case 'rm-examples':
      confirmBox('Remover todos os dados de exemplo? Os seus dados reais não são afetados.', async () => { await api('DELETE', '/api/examples'); await reload(); if (S.tab === 'ajustes') mountTab(); toast('Exemplos removidos.'); }, 'Remover');
      break;
    case 'save-set': {
      const m = parseMoney($('#a_meta').value), a = parseInt($('#a_alerta').value, 10);
      if (m == null || isNaN(m) || m < 0 || m > 500 || isNaN(a) || a < 1) { $('#aerr').textContent = 'Confira a meta (0 a 500%) e os dias (1 ou mais).'; return; }
      $('#aerr').textContent = '';
      await run(async () => { const r = await api('PUT', '/api/settings', { meta: m / 100, alerta: a }); toast(r.changed ? 'Ajustes salvos.' : 'Nada mudou.'); });
      break;
    }
    case 'save-partners':
      try {
        const r = await api('PUT', '/api/settings/partners', { A: $('#p_a').value, B: $('#p_b').value });
        $('#perr').textContent = ''; await reload(); toast(r.changed ? 'Nomes salvos.' : 'Nada mudou.');
      } catch (e) { $('#perr').textContent = e.message; }
      break;
    case 'pwd': passwordForm(); break;
    case 'new-user': userForm(null); break;
    case 'edit-user': userForm(S.users.find((u) => u.id === Number(id))); break;
    default: break;
  }
});

/* ---------- início ---------- */
setUnauthorizedHandler(() => { if (S.me) showLogin('Sessão expirada. Entre novamente.'); });

(async function boot() {
  renderTabs();
  try {
    const cfg = await api('GET', '/api/config');
    Object.assign(LISTS, cfg.lists);
    S.placa = !!cfg.placa;
  } catch (e) { $('#view').innerHTML = `<div class="empty"><h3>Não consegui falar com o servidor</h3><p class="mut" style="margin:0">${esc(e.message)}</p></div>`; return; }
  try {
    const me = await api('GET', '/api/me');
    await start(me.user);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) showLogin();
    else $('#view').innerHTML = `<div class="empty"><h3>Algo deu errado</h3><p class="mut" style="margin:0">${esc(e.message)}</p></div>`;
  }
})();
