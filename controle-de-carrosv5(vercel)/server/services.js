'use strict';
/**
 * Regras de gravação. Toda alteração de dados passa por aqui e, na MESMA transação:
 *   1) grava o item, 2) grava a linha do histórico (audit), 3) incrementa a versão dos dados.
 * Se qualquer passo falhar, nada é gravado. Por isso o histórico nunca fica para trás.
 */
const { entities, validate, fmtValue, isBlank } = require('./schema');

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const now = () => new Date().toISOString();
// Colunas sempre em minúsculas entre aspas: vale no SQLite (sem diferença de caixa) e no Postgres (guarda em minúsculas).
const q = (id) => `"${id.toLowerCase()}"`;

/** map assíncrono em ordem (os itens usam o mesmo cliente de banco, então não pode ser paralelo). */
async function mapSeq(arr, fn) { const out = []; for (const x of arr) out.push(await fn(x)); return out; }

async function getSetting(db, key) {
  const r = await db.get('SELECT value FROM settings WHERE key = ?', key);
  return r ? r.value : null;
}
async function setSetting(db, key, value) {
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}
async function partners(db) {
  return { A: await getSetting(db, 'partnerA') || 'Sócio A', B: await getSetting(db, 'partnerB') || 'Sócio B' };
}
async function bump(db) {
  await db.run("UPDATE settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'dataVersion'");
}
async function version(db) {
  return Number(await getSetting(db, 'dataVersion') || 1);
}

async function writeAudit(db, userId, entity, entityId, label, action, changes) {
  await db.run('INSERT INTO audit (ts, userId, entity, entityId, label, action, changes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    now(), userId, entity, entityId ?? null, label ?? null, action, JSON.stringify(changes || []));
}

/** Converte a linha do banco para o formato da API (0/1 vira booleano). */
function serialize(row) {
  if (!row) return row;
  const out = { ...row };
  if ('deleted' in out) out.deleted = !!out.deleted;
  if ('example' in out) out.example = !!out.example;
  return out;
}

const sameValue = (a, b) => (a ?? null) === (b ?? null);

/** Regras que dependem de mais de um campo ou de outras linhas. */
async function crossCheck(db, name, merged, selfId) {
  if (name === 'cars') {
    if (merged.status === 'Vendido' && isBlank(merged.vvenda)) {
      throw new HttpError(400, 'Para marcar como vendido, informe o valor total da venda.');
    }
    if (merged.origemId != null && merged.origemId === selfId) {
      throw new HttpError(400, 'Um carro não pode ter vindo da troca dele mesmo.');
    }
  }
  if (name === 'payments') {
    const r = await db.get('SELECT * FROM receipts WHERE id = ?', merged.receiptId);
    if (!r || r.deleted) throw new HttpError(404, 'Parcela não encontrada.');
    if (!(merged.valor > 0)) throw new HttpError(400, 'O valor pago precisa ser maior que zero.');
    const falta = round2(r.valor - await paidOf(db, r, selfId));
    if (falta <= 0.004) throw new HttpError(400, 'Essa parcela já está quitada.');
    if (merged.valor > falta + 0.004) {
      throw new HttpError(400, `Faltam só ${BRL.format(falta)} nessa parcela. Se o cliente pagou mais (juros, multa), edite o valor da parcela antes.`);
    }
  }
  if (name === 'repasses') {
    if (!(merged.valor > 0)) throw new HttpError(400, 'O valor repassado precisa ser maior que zero.');
    const car = await db.get('SELECT dono FROM cars WHERE id = ?', merged.carId);
    if (!car || !String(car.dono || '').trim()) throw new HttpError(400, 'Só carros consignados (com dono) têm repasse.');
  }
  if (name === 'loans') {
    if (!(merged.valor > 0)) throw new HttpError(400, 'O valor emprestado precisa ser maior que zero.');
    if (merged.modo === 'Juros mensais') {
      if (isBlank(merged.venc)) throw new HttpError(400, 'Informe a data em que o valor precisa ser devolvido.');
      if (merged.venc <= merged.data) throw new HttpError(400, 'A devolução precisa ser depois da data do empréstimo.');
    }
    if (merged.modo === 'Parcelado' && !(merged.nParc >= 1)) throw new HttpError(400, 'Informe o número de parcelas.');
  }
  if (name === 'payables') {
    if (!(merged.valor > 0)) throw new HttpError(400, 'O valor precisa ser maior que zero.');
    if (merged.origem === 'Carro' && merged.carId == null) throw new HttpError(400, 'Escolha o carro desta conta.');
    if (merged.origem === 'Empréstimo' && merged.loanId == null) throw new HttpError(400, 'Escolha o empréstimo desta conta.');
    if (merged.status === 'Pago' && isBlank(merged.paidAt)) throw new HttpError(400, 'Informe a data do pagamento.');
  }
  if (name === 'receipts' && merged.status === 'Recebido' && isBlank(merged.paidAt)) {
    throw new HttpError(400, 'Informe a data em que o dinheiro entrou.');
  }
}

const round2 = (v) => Math.round(v * 100) / 100;

/**
 * Regras automáticas de local do carro (mexem em `values`, que é o que será gravado):
 * vendido fica "Entregue" (sem oficina nem previsão de saída); voltou da venda para o estoque, sai de "Entregue";
 * no Pátio / Loja sem data de entrada, vale a data de compra; no pátio (ou sem local) não há nome de oficina.
 */
function carRules(values, merged, row) {
  // Transferido para o comprador: guarda a data (se não veio); deixou de ser 'Comprador': apaga a data.
  if (merged.docNome === 'Comprador' && isBlank(merged.docTransf)) values.docTransf = new Date().toISOString().slice(0, 10);
  if (merged.docNome !== 'Comprador' && !isBlank(merged.docTransf)) values.docTransf = null;
  if (merged.status === 'Vendido') {
    if (merged.loc !== 'Entregue' || (row && row.status !== 'Vendido')) {
      values.loc = 'Entregue'; values.locdet = null; values.locprev = null;
      values.locdesde = merged.dvenda || null;
    }
    return;
  }
  let loc = merged.loc, desde = merged.locdesde;
  if (loc === 'Entregue') { values.loc = loc = null; values.locdesde = desde = null; }
  if (loc === 'Pátio / Loja' && isBlank(desde) && !isBlank(merged.dcompra)) values.locdesde = merged.dcompra;
  if (isBlank(loc) || loc === 'Pátio / Loja') { // nome do local e previsão de saída só fora do pátio
    if (!isBlank(merged.locdet)) values.locdet = null;
    if (!isBlank(merged.locprev)) values.locprev = null;
  }
}

/** Quanto da parcela já foi pago. Parcela marcada "Recebido" sem nenhum pagamento lançado (jeito antigo) conta como paga por inteiro. */
async function paidOf(db, receipt, exceptPaymentId) {
  const pays = (await db.all('SELECT id, valor, date FROM payments WHERE receiptId = ? AND deleted = 0', receipt.id)).filter((p) => p.id !== exceptPaymentId);
  const all = await db.all('SELECT id FROM payments WHERE receiptId = ? AND deleted = 0', receipt.id);
  if (!all.length && receipt.status === 'Recebido') return round2(receipt.valor);
  return round2(pays.reduce((a, p) => a + p.valor, 0));
}

/** Depois de qualquer mudança em pagamentos: a parcela vira Recebido quando a soma chega ao valor, senão volta a Pendente. */
async function syncReceipt(db, user, receiptId) {
  const r = await db.get('SELECT * FROM receipts WHERE id = ?', receiptId);
  if (!r) return;
  const pays = await db.all('SELECT valor, date FROM payments WHERE receiptId = ? AND deleted = 0', receiptId);
  const sum = round2(pays.reduce((a, p) => a + p.valor, 0));
  const done = pays.length > 0 && sum >= round2(r.valor) - 0.004;
  const status = done ? 'Recebido' : 'Pendente';
  const paidAt = done ? pays.map((p) => p.date).sort().pop() : null;
  if (status !== r.status || (paidAt || null) !== (r.paidAt || null)) {
    await db.run('UPDATE receipts SET status = ?, paidAt = ?, updatedBy = ?, updatedAt = ? WHERE id = ?', status, paidAt, user.id, now(), receiptId);
  }
}

async function createItem(db, user, name, input) {
  const def = entities[name];
  return db.tx(async (db) => {
    const { values, errors } = await validate(def, input, db, null);
    for (const [k, f] of Object.entries(def.fields)) {
      if (values[k] === undefined && f.default !== undefined) values[k] = f.default;
      if (f.req && isBlank(values[k]) && !errors.some((e) => e.includes(f.label({ A: 'A', B: 'B' })))) {
        errors.push(`Preencha "${f.label({ A: 'A', B: 'B' })}".`);
      }
    }
    if (errors.length) throw new HttpError(400, errors[0], { errors });
    if (name === 'cars') carRules(values, values, null);
    await crossCheck(db, name, values, null);

    const ts = now();
    const all = { ...values, example: 0, deleted: 0, createdBy: user.id, createdAt: ts, updatedBy: user.id, updatedAt: ts };
    const keys = Object.keys(all);
    const id = await db.insert(`INSERT INTO ${def.table} (${keys.map(q).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
      ...keys.map((k) => all[k]));
    const row = await db.get(`SELECT * FROM ${def.table} WHERE id = ?`, id);
    if (name === 'payments') await syncReceipt(db, user, row.receiptId);

    const p = await partners(db);
    const changes = await mapSeq(Object.keys(values).filter((k) => values[k] != null), async (k) => ({
      f: def.fields[k].label(p), de: null, para: await fmtValue(db, def.fields[k], values[k], p),
    }));
    await writeAudit(db, user.id, def.kind, id, await def.labelOf(row, db), 'criou', changes);
    await bump(db);
    return serialize(row);
  });
}

/** opts.move = true restringe a edição aos campos de localização e registra a ação como "moveu". */
async function updateItem(db, user, name, id, input, opts = {}) {
  const def = entities[name];
  return db.tx(async (db) => {
    const row = await db.get(`SELECT * FROM ${def.table} WHERE id = ?`, id);
    if (!row) throw new HttpError(404, 'Item não encontrado.');
    if (row.deleted) throw new HttpError(409, 'Este item foi excluído. Restaure antes de editar.');
    if (opts.move) {
      for (const k of Object.keys(input)) if (!def.move.includes(k)) throw new HttpError(400, `Campo não permitido ao mover: ${k}`);
    }
    const { values, errors } = await validate(def, input, db, row);
    if (errors.length) throw new HttpError(400, errors[0], { errors });

    if (name === 'cars') carRules(values, { ...row, ...values }, row);
    const p = await partners(db);
    const changedKeys = Object.keys(values).filter((k) => !sameValue(row[k], values[k]));
    if (!changedKeys.length) return { item: serialize(row), changed: false };
    await crossCheck(db, name, { ...row, ...values }, id);

    const patch = {};
    for (const k of changedKeys) patch[k] = values[k];
    patch.updatedBy = user.id;
    patch.updatedAt = now();
    const keys = Object.keys(patch);
    await db.run(`UPDATE ${def.table} SET ${keys.map((k) => `${q(k)} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => patch[k]), id);

    const fresh = await db.get(`SELECT * FROM ${def.table} WHERE id = ?`, id);
    if (name === 'payments') await syncReceipt(db, user, fresh.receiptId);
    if (name === 'receipts' && await db.get('SELECT 1 AS x FROM payments WHERE receiptId = ? AND deleted = 0', id)) await syncReceipt(db, user, id);
    const changes = await mapSeq(changedKeys, async (k) => ({
      f: def.fields[k].label(p),
      de: await fmtValue(db, def.fields[k], row[k], p),
      para: await fmtValue(db, def.fields[k], values[k], p),
    }));
    await writeAudit(db, user.id, def.kind, id, await def.labelOf(fresh, db), opts.move ? 'moveu' : 'editou', changes);
    await bump(db);
    return { item: serialize(fresh), changed: true };
  });
}

/** Exclusão lógica (a linha continua no banco e pode ser restaurada). */
async function setDeleted(db, user, name, id, deleted) {
  const def = entities[name];
  return db.tx(async (db) => {
    const row = await db.get(`SELECT * FROM ${def.table} WHERE id = ?`, id);
    if (!row) throw new HttpError(404, 'Item não encontrado.');
    if (!!row.deleted === deleted) return { item: serialize(row), changed: false };
    if (!deleted && (name === 'payments' || name === 'repasses')) await crossCheck(db, name, row, id);
    await db.run(`UPDATE ${def.table} SET deleted = ?, updatedBy = ?, updatedAt = ? WHERE id = ?`, deleted ? 1 : 0, user.id, now(), id);
    const fresh = await db.get(`SELECT * FROM ${def.table} WHERE id = ?`, id);
    if (name === 'payments') await syncReceipt(db, user, fresh.receiptId);
    await writeAudit(db, user.id, def.kind, id, await def.labelOf(fresh, db), deleted ? 'excluiu' : 'restaurou', []);
    await bump(db);
    return { item: serialize(fresh), changed: true };
  });
}

async function saveSettings(db, user, { meta, alerta }) {
  return db.tx(async (db) => {
    const m = Number(meta);
    const a = Number(alerta);
    if (!Number.isFinite(m) || m < 0 || m > 5) throw new HttpError(400, 'A meta de margem deve ficar entre 0% e 500%.');
    if (!Number.isInteger(a) || a < 1 || a > 3650) throw new HttpError(400, 'O alerta deve ser de 1 dia ou mais.');
    const changes = [];
    if (Number(await getSetting(db, 'meta')) !== m) {
      changes.push({ f: 'Meta de margem', de: `${(Number(await getSetting(db, 'meta')) * 100).toFixed(1).replace('.', ',')}%`, para: `${(m * 100).toFixed(1).replace('.', ',')}%` });
    }
    if (Number(await getSetting(db, 'alerta')) !== a) {
      changes.push({ f: 'Alerta de carro parado (dias)', de: await getSetting(db, 'alerta'), para: String(a) });
    }
    if (!changes.length) return { changed: false };
    await setSetting(db, 'meta', m);
    await setSetting(db, 'alerta', a);
    await writeAudit(db, user.id, 'settings', null, 'ajustes', 'editou', changes);
    await bump(db);
    return { changed: true };
  });
}

async function savePartners(db, user, { A, B }) {
  return db.tx(async (db) => {
    const a = String(A || '').trim();
    const b = String(B || '').trim();
    if (!a || !b || a.length > 40 || b.length > 40) throw new HttpError(400, 'Informe os dois nomes (até 40 caracteres).');
    if (a.toLowerCase() === b.toLowerCase()) throw new HttpError(400, 'Os dois sócios precisam ter nomes diferentes.');
    const old = await partners(db);
    const changes = [];
    if (old.A !== a) changes.push({ f: 'Nome do sócio 1', de: old.A, para: a });
    if (old.B !== b) changes.push({ f: 'Nome do sócio 2', de: old.B, para: b });
    if (!changes.length) return { changed: false };
    await setSetting(db, 'partnerA', a);
    await setSetting(db, 'partnerB', b);
    await writeAudit(db, user.id, 'settings', null, 'ajustes', 'editou', changes);
    await bump(db);
    return { changed: true };
  });
}

/**
 * Programa como o dinheiro da venda vai entrar (várias parcelas de uma vez, numa transação só).
 * `parts`: [{ label, due, valor, status?, paidAt?, quem? }]. Parcelas ainda pendentes programadas antes são
 * substituídas (excluídas logicamente); as já recebidas são mantidas.
 */
async function schedulePlan(db, user, carId, parts) {
  const def = entities.receipts;
  return db.tx(async (db) => {
    const car = await db.get('SELECT * FROM cars WHERE id = ?', carId);
    if (!car || car.deleted) throw new HttpError(404, 'Carro não encontrado.');
    if (!Array.isArray(parts) || !parts.length || parts.length > 60) throw new HttpError(400, 'Informe de 1 a 60 parcelas.');
    const p = await partners(db);
    const ts = now();
    // Parcelas pendentes sem nenhum pagamento são substituídas; as que já receberam algo (mesmo em parte) ficam.
    const old = await db.all("SELECT id FROM receipts WHERE carId = ? AND deleted = 0 AND status = 'Pendente' AND id NOT IN (SELECT receiptId FROM payments WHERE deleted = 0)", carId);
    for (const o of old) await db.run('UPDATE receipts SET deleted = 1, updatedBy = ?, updatedAt = ? WHERE id = ?', user.id, ts, o.id);
    const changes = old.length ? [{ f: 'Parcelas pendentes anteriores', de: `${old.length}`, para: 'substituídas' }] : [];
    for (const [i, part] of parts.entries()) {
      const { values, errors } = await validate(def, { ...part, carId }, db, null);
      for (const [k, f] of Object.entries(def.fields)) if (values[k] === undefined && f.default !== undefined) values[k] = f.default;
      if (errors.length) throw new HttpError(400, `Parcela ${i + 1}: ${errors[0]}`, { errors });
      await crossCheck(db, 'receipts', values, null);
      const all = { ...values, example: 0, deleted: 0, createdBy: user.id, createdAt: ts, updatedBy: user.id, updatedAt: ts };
      const keys = Object.keys(all);
      await db.run(`INSERT INTO receipts (${keys.map(q).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => all[k]));
      changes.push({
        f: values.label || `Parcela ${i + 1}`, de: null,
        para: `${await fmtValue(db, def.fields.valor, values.valor, p)} em ${await fmtValue(db, def.fields.due, values.due, p)}${values.status === 'Recebido' ? ' (recebido)' : ''}`,
      });
    }
    await writeAudit(db, user.id, 'car', carId, car.name, 'programou', changes);
    await bump(db);
    return { count: parts.length };
  });
}

/**
 * Programa as contas a pagar de um empréstimo (loanId) ou da compra de um carro (carId), tudo numa transação.
 * Com replace (só empréstimo), as parcelas ainda pendentes do empréstimo são trocadas pelas novas; as pagas ficam.
 */
async function schedulePayables(db, user, { loanId, carId, replace, parts }) {
  const def = entities.payables;
  return db.tx(async (db) => {
    const lid = loanId == null ? null : Number(loanId), cid = carId == null ? null : Number(carId);
    const owner = lid != null ? await db.get('SELECT * FROM loans WHERE id = ?', lid) : await db.get('SELECT * FROM cars WHERE id = ?', cid);
    if (!owner || owner.deleted) throw new HttpError(404, lid != null ? 'Empréstimo não encontrado.' : 'Carro não encontrado.');
    if (!Array.isArray(parts) || !parts.length || parts.length > 130) throw new HttpError(400, 'Informe de 1 a 130 parcelas.');
    const p = await partners(db);
    const ts = now();
    const changes = [];
    if (lid != null && replace) {
      const old = await db.all("SELECT id FROM payables WHERE loanId = ? AND deleted = 0 AND status = 'Pendente'", lid);
      for (const o of old) await db.run('UPDATE payables SET deleted = 1, updatedBy = ?, updatedAt = ? WHERE id = ?', user.id, ts, o.id);
      if (old.length) changes.push({ f: 'Parcelas pendentes anteriores', de: `${old.length}`, para: 'substituídas' });
    }
    for (const [i, part] of parts.entries()) {
      const input = { ...part, origem: lid != null ? 'Empréstimo' : 'Carro', loanId: lid, carId: lid != null ? (owner.carId ?? null) : cid };
      if (lid != null) input.credor = owner.credor;
      const { values, errors } = await validate(def, input, db, null);
      for (const [k, f] of Object.entries(def.fields)) if (values[k] === undefined && f.default !== undefined) values[k] = f.default;
      if (errors.length) throw new HttpError(400, `Parcela ${i + 1}: ${errors[0]}`, { errors });
      await crossCheck(db, 'payables', values, null);
      const all = { ...values, example: 0, deleted: 0, createdBy: user.id, createdAt: ts, updatedBy: user.id, updatedAt: ts };
      const keys = Object.keys(all);
      await db.run(`INSERT INTO payables (${keys.map(q).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => all[k]));
      changes.push({
        f: values.label || `Parcela ${i + 1}`, de: null,
        para: `${await fmtValue(db, def.fields.valor, values.valor, p)} em ${await fmtValue(db, def.fields.due, values.due, p)}${values.status === 'Pago' ? ' (pago)' : ''}`,
      });
    }
    if (lid != null) await writeAudit(db, user.id, 'loan', lid, entities.loans.labelOf(owner), 'programou', changes);
    else await writeAudit(db, user.id, 'car', cid, owner.name, 'programou a pagar', changes);
    await bump(db);
    return { count: parts.length };
  });
}

async function getData(db) {
  const rows = async (t) => (await db.all(`SELECT * FROM ${t} ORDER BY id`)).map(serialize);
  return {
    version: await version(db),
    cars: await rows('cars'),
    expenses: await rows('expenses'),
    planned: await rows('planned'),
    receipts: await rows('receipts'),
    payments: await rows('payments'),
    repasses: await rows('repasses'),
    loans: await rows('loans'),
    payables: await rows('payables'),
    settings: {
      meta: Number(await getSetting(db, 'meta')),
      alerta: Number(await getSetting(db, 'alerta')),
      partners: await partners(db),
    },
  };
}

async function getAudit(db, limit = 500, offset = 0) {
  const lim = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const off = Math.max(Number(offset) || 0, 0);
  return (await db.all(`SELECT a.id, a.ts, a.userId, u.name AS "userName", a.entity, a.entityId, a.label, a.action, a.changes
                 FROM audit a LEFT JOIN users u ON u.id = a.userId
                 ORDER BY a.id DESC LIMIT ? OFFSET ?`, lim, off))
    .map((r) => ({ ...r, changes: JSON.parse(r.changes || '[]') }));
}

module.exports = {
  HttpError, now, getSetting, setSetting, partners, bump, version, writeAudit, serialize,
  createItem, updateItem, setDeleted, schedulePlan, schedulePayables, saveSettings, savePartners, getData, getAudit,
};
