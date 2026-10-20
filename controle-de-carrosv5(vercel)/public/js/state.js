// Estado único da tela. Os dados vêm do servidor (GET /api/data); o resto é preferência de tela.
export const LISTS = { locs: [], cats: [], status: [], pstatus: [], rstatus: [], divis: [], roles: [] };

export const S = {
  me: null,           // { id, username, name, role }
  canWrite: false,
  cars: [], expenses: [], planned: [], receipts: [], payments: [], repasses: [], audit: [],
  settings: { meta: 0.1, alerta: 45, partners: { A: 'Sócio 1', B: 'Sócio 2' } },
  version: 0,
  loaded: false, auditLoaded: false,
  tab: 'resumo',
  year: new Date().getFullYear(),
  ui: { q: '', st: 'Todos', gcar: '', gquem: '', pcar: '', pst: '', hu: '', he: '', open: {}, vf: 'Todas', rep: 'geral', per: 'ano', from: '', to: '', rcCar: null, repCar: null, byMarca: (() => { try { return !!localStorage.getItem('bc.byMarca'); } catch { return false; } })() },
  D: {},
  users: [],
};

export const names = () => S.settings.partners;
export const itemOf = (kind, id) => {
  const arr = kind === 'car' ? S.cars : kind === 'expense' ? S.expenses : kind === 'planned' ? S.planned : kind === 'receipt' ? S.receipts : kind === 'payment' ? S.payments : kind === 'repasse' ? S.repasses : [];
  return arr.find((x) => x.id === Number(id));
};
export const carName = (id) => { const c = S.cars.find((x) => x.id === id); return c ? c.name : '—'; };
export const liveCars = () => S.cars.filter((c) => !c.deleted).sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
export const locClass = (loc) => { const i = LISTS.locs.indexOf(loc); return 'l' + (i < 0 ? 5 : i); };
