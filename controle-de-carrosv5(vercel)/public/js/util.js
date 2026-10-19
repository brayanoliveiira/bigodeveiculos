// Funções pequenas de formatação e DOM, sem estado.
export const $ = (s, r) => (r || document).querySelector(s);
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRLF = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v) => (v == null ? '—' : BRLF.format(v));
export const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1).replace('.', ',') + '%');
export const dmy = (s) => (s ? String(s).split('-').reverse().join('/') : '—');
const pad = (n) => (n < 10 ? '0' : '') + n;
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export function stamp(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const sign = (v) => (v == null ? '' : v < 0 ? 'neg' : v > 0 ? 'pos' : '');
export function parseMoney(s) {
  s = String(s == null ? '' : s).replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}
/** Número -> "R$ 2.000,00" (para preencher campos de valor). */
export const moneyField = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? '' : BRLF.format(Number(v)));
/** Máscara de digitação: "2000" vira "R$ 2.000"; depois da vírgula aceita 2 casas. Ao sair do campo completa ",00". */
function maskMoney(el, final) {
  const old = el.value, pos = el.selectionStart == null ? old.length : el.selectionStart;
  const keep = (old.slice(0, pos).match(/[\d,]/g) || []).length; // dígitos/vírgula antes do cursor
  const s = old.replace(/[^\d,]/g, '');
  if (!s) { el.value = ''; return; }
  const parts = s.split(',');
  let int = parts[0].replace(/^0+(?=\d)/, ''), dec = (parts[1] || '').slice(0, 2);
  const comma = parts.length > 1;
  if (final) { dec = dec.padEnd(2, '0'); }
  const out = 'R$ ' + (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (comma || final ? ',' + dec : '');
  el.value = out;
  if (!final && document.activeElement === el) {
    let n = 0, i = 0;
    while (i < out.length && n < keep) { if (/[\d,]/.test(out[i])) n++; i++; }
    try { el.setSelectionRange(i, i); } catch { /* campo sem seleção */ }
  }
}
let moneyMaskOn = false;
/** Liga a máscara em todo input com data-money (vale para formulários criados depois). */
export function installMoneyMask() {
  if (moneyMaskOn) return;
  moneyMaskOn = true;
  document.addEventListener('input', (ev) => { if (ev.target.matches && ev.target.matches('[data-money]') && ev.inputType !== 'insertCompositionText') maskMoney(ev.target, false); }, true);
  document.addEventListener('focusout', (ev) => { if (ev.target.matches && ev.target.matches('[data-money]')) maskMoney(ev.target, true); }, true);
}
let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** Tabela HTML. cols: [{ label, r (alinha à direita), get(row) -> HTML já escapado }]. foot: linha de total (mesmas colunas). */
export function table(cols, rows, foot, emptyText) {
  if (!rows.length) return `<p class="mut" style="margin:0">${esc(emptyText || 'Sem dados no período.')}</p>`;
  const td = (c, v) => `<td class="${c.r ? 'r num' : ''}">${v == null ? '' : v}</td>`;
  return `<div class="tbl"><table class="compact" style="min-width:0"><thead><tr>${cols.map((c) => `<th class="${c.r ? 'r' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>` +
    rows.map((r) => `<tr>${cols.map((c) => td(c, c.get(r))).join('')}</tr>`).join('') + '</tbody>' +
    (foot ? `<tfoot><tr>${cols.map((c) => `<td class="${c.r ? 'r num' : ''}"><b>${foot[c.label] == null ? '' : foot[c.label]}</b></td>`).join('')}</tr></tfoot>` : '') + '</table></div>';
}
/** Baixa um CSV (com BOM, para o Excel reconhecer os acentos). */
export function downloadFile(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const mlabel = (k) => (/^\d{4}-\d{2}$/.test(k) ? ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][+k.slice(5) - 1] + '/' + k.slice(2, 4) : k || 'Sem data');
