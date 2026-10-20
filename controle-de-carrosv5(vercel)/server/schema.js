'use strict';
/**
 * Definição dos itens (carros, gastos, previstos): campos, tipos, rótulos e validação.
 * É a ÚNICA fonte da verdade para: o que o servidor aceita, como cada campo aparece no histórico
 * e o que é obrigatório. Para acrescentar um campo: crie a coluna numa migration nova, declare o
 * campo aqui e (se quiser digitá-lo na tela) acrescente-o em public/js/forms.js.
 *
 * Tipos: text, int, money, pct (0 a 1), date (AAAA-MM-DD), enum, partner ('A' ou 'B'), ref (id de outro item).
 * `label` recebe os nomes dos sócios ({A, B}) porque alguns rótulos os citam.
 */
const { lists } = require('./config');

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const L = (s) => () => s;

const entities = {
  cars: {
    table: 'cars',
    kind: 'car',
    fields: {
      name: { t: 'text', req: true, max: 120, label: L('Carro (modelo e versão)') },
      placa: { t: 'text', max: 12, upper: true, label: L('Placa') },
      ano: { t: 'int', min: 1900, max: 2100, label: L('Ano') },
      cor: { t: 'text', max: 40, label: L('Cor') },
      km: { t: 'int', min: 0, max: 3000000, label: L('KM') },
      fipe: { t: 'money', label: L('Valor FIPE') },
      fipeRef: { t: 'text', max: 80, label: L('Referência FIPE') },
      dcompra: { t: 'date', label: L('Data da compra') },
      entT: { t: 'money', label: L('Valor de entrada (total)') },
      ovrA: { t: 'money', label: (p) => `Pago por ${p.A} (só se NÃO foi metade)` },
      ovrB: { t: 'money', label: (p) => `Pago por ${p.B} (só se NÃO foi metade)` },
      origemId: { t: 'ref', ref: 'cars', label: L('Veio de troca em qual carro nosso?') },
      dono: { t: 'text', max: 80, label: L('Dono do carro (consignado)') },
      repasse: { t: 'money', label: L('Repasse ao dono (valor mínimo)') },
      anun: { t: 'money', label: L('Preço de anúncio') },
      loc: { t: 'enum', values: lists.locs, label: L('Onde está agora') },
      locdet: { t: 'text', max: 120, label: L('Qual oficina / funilaria') },
      locdesde: { t: 'date', label: L('No local desde') },
      locprev: { t: 'date', label: L('Previsão de saída') },
      status: { t: 'enum', values: lists.status, req: true, default: 'Em estoque', label: L('Status') },
      dvenda: { t: 'date', label: L('Data da venda') },
      vvenda: { t: 'money', label: L('Valor total da venda (dinheiro + carro de troca)') },
      quemrec: { t: 'partner', label: L('Quem ficou com o dinheiro') },
      comprador: { t: 'text', max: 120, label: L('Comprador') },
      divis: { t: 'enum', values: lists.divis, label: L('Divisão do lucro') },
      pcust: { t: 'pct', label: (p) => `% do lucro de ${p.A}` },
    },
    // Campos que a ação "Mover carro" pode alterar.
    move: ['loc', 'locdet', 'locdesde', 'locprev'],
    labelOf: (r) => r.name,
  },
  expenses: {
    table: 'expenses',
    kind: 'expense',
    fields: {
      carId: { t: 'ref', ref: 'cars', req: true, label: L('Carro') },
      date: { t: 'date', req: true, label: L('Data') },
      cat: { t: 'enum', values: lists.cats, req: true, label: L('Categoria') },
      desc: { t: 'text', max: 200, label: L('Descrição') },
      valor: { t: 'money', req: true, label: L('Valor') },
      quem: { t: 'partner', req: true, label: L('Quem gastou') },
      obs: { t: 'text', max: 500, label: L('Observação') },
    },
    labelOf: async (r, db) => `${r.desc || r.cat || 'gasto'} — ${await carName(db, r.carId)}`,
  },
  receipts: {
    table: 'receipts',
    kind: 'receipt',
    fields: {
      carId: { t: 'ref', ref: 'cars', req: true, label: L('Carro') },
      label: { t: 'text', max: 40, label: L('Parcela') },
      due: { t: 'date', req: true, label: L('Vencimento') },
      valor: { t: 'money', req: true, label: L('Valor') },
      status: { t: 'enum', values: lists.rstatus, req: true, default: 'Pendente', label: L('Situação') },
      paidAt: { t: 'date', label: L('Recebido em') },
      quem: { t: 'partner', label: L('Quem ficou com o dinheiro') },
      obs: { t: 'text', max: 300, label: L('Observação') },
    },
    labelOf: async (r, db) => `${r.label || 'Recebimento'} — ${await carName(db, r.carId)}`,
  },
  payments: {
    table: 'payments',
    kind: 'payment',
    fields: {
      receiptId: { t: 'ref', ref: 'receipts', refName: 'Parcela', req: true, label: L('Parcela') },
      date: { t: 'date', req: true, label: L('Data do pagamento') },
      valor: { t: 'money', req: true, label: L('Valor pago') },
      quem: { t: 'partner', label: L('Quem ficou com o dinheiro') },
      obs: { t: 'text', max: 300, label: L('Observação') },
    },
    labelOf: async (r, db) => `Pagamento de ${BRL.format(r.valor)} — ${await receiptName(db, r.receiptId)}`,
  },
  repasses: {
    table: 'repasses',
    kind: 'repasse',
    fields: {
      carId: { t: 'ref', ref: 'cars', req: true, label: L('Carro') },
      date: { t: 'date', req: true, label: L('Data do repasse') },
      valor: { t: 'money', req: true, label: L('Valor repassado') },
      quem: { t: 'partner', label: L('Quem pagou o dono') },
      obs: { t: 'text', max: 300, label: L('Observação') },
    },
    labelOf: async (r, db) => `Repasse de ${BRL.format(r.valor)} ao dono — ${await carName(db, r.carId)}`,
  },
  planned: {
    table: 'planned',
    kind: 'planned',
    fields: {
      carId: { t: 'ref', ref: 'cars', req: true, label: L('Carro') },
      cat: { t: 'enum', values: lists.cats, req: true, label: L('Categoria') },
      desc: { t: 'text', max: 200, label: L('Descrição') },
      valor: { t: 'money', req: true, label: L('Valor previsto') },
      quem: { t: 'partner', label: L('Quem vai pagar') },
      prazo: { t: 'date', label: L('Prazo') },
      status: { t: 'enum', values: lists.pstatus, req: true, default: 'Pendente', label: L('Status') },
    },
    labelOf: async (r, db) => `${r.desc || r.cat || 'previsto'} — ${await carName(db, r.carId)}`,
  },
};

async function carName(db, id) {
  const r = id == null ? null : await db.get('SELECT name FROM cars WHERE id = ?', id);
  return r ? r.name : '—';
}

async function receiptName(db, id) {
  const r = id == null ? null : await db.get('SELECT label, carId FROM receipts WHERE id = ?', id);
  return r ? `${r.label || 'Parcela'} — ${await carName(db, r.carId)}` : '—';
}

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Valida e normaliza `input` contra a definição. Só olha as chaves presentes em `input`.
 * Retorna { values, errors }. Texto vazio vira null. `current` é a linha atual (em edição).
 */
async function validate(def, input, db, current) {
  const values = {};
  const errors = [];
  for (const [k, raw] of Object.entries(input || {})) {
    const f = def.fields[k];
    if (!f) { errors.push(`Campo desconhecido: ${k}`); continue; }
    const label = f.label({ A: 'A', B: 'B' });
    if (isBlank(raw)) {
      if (f.req) errors.push(`Preencha "${label}".`);
      values[k] = null;
      continue;
    }
    let v = raw;
    switch (f.t) {
      case 'text': {
        v = String(raw).trim();
        if (f.upper) v = v.toUpperCase();
        if (v.length > (f.max || 200)) errors.push(`"${label}" passou de ${f.max || 200} caracteres.`);
        break;
      }
      case 'int': {
        v = Number(raw);
        if (!Number.isInteger(v) || v < (f.min ?? 0) || v > (f.max ?? 1e9)) errors.push(`Número inválido em "${label}".`);
        break;
      }
      case 'money': {
        v = Number(raw);
        if (!Number.isFinite(v) || v < 0 || v > 1e9) errors.push(`Valor inválido em "${label}".`);
        else v = Math.round(v * 100) / 100;
        break;
      }
      case 'pct': {
        v = Number(raw);
        if (!Number.isFinite(v) || v < 0 || v > 1) errors.push(`"${label}" deve ficar entre 0% e 100%.`);
        break;
      }
      case 'date': {
        v = String(raw);
        if (!validDate(v)) errors.push(`Data inválida em "${label}".`);
        break;
      }
      case 'enum': {
        v = String(raw);
        if (!f.values.includes(v)) errors.push(`Opção inválida em "${label}".`);
        break;
      }
      case 'partner': {
        v = String(raw);
        if (v !== 'A' && v !== 'B') errors.push(`Sócio inválido em "${label}".`);
        break;
      }
      case 'ref': {
        v = Number(raw);
        const same = current && current[k] === v;
        const row = Number.isInteger(v) ? await db.get(`SELECT id, deleted FROM ${f.ref} WHERE id = ?`, v) : null;
        if (!row || (!same && row.deleted)) errors.push(`${f.refName || 'Carro'} não encontrado em "${label}".`);
        break;
      }
      default:
        errors.push(`Tipo desconhecido: ${f.t}`);
    }
    values[k] = v;
  }
  return { values, errors };
}

/** Texto legível de um valor, usado no histórico. */
async function fmtValue(db, f, v, partners) {
  if (v === null || v === undefined || v === '') return '—';
  switch (f.t) {
    case 'money': return BRL.format(v);
    case 'pct': return `${(v * 100).toFixed(1).replace('.', ',')}%`;
    case 'date': return String(v).split('-').reverse().join('/');
    case 'partner': return partners[v] || v;
    case 'ref': return f.ref === 'receipts' ? await receiptName(db, v) : await carName(db, v);
    default: return String(v);
  }
}

module.exports = { entities, validate, fmtValue, carName, isBlank };
