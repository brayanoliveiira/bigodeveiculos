'use strict';
/**
 * Tabela FIPE gratuita (https://fipe.parallelum.com.br/api/v2, sem cadastro: 500 consultas por dia;
 * com FIPE_TOKEN gratuito de fipe.api.br: 1.000 por dia). Escolhe-se marca > modelo > ano e a API devolve o valor.
 * O navegador nunca fala com a API: passa por aqui, que guarda tudo em cache (tabela fipe_cache).
 */
const { HttpError } = require('./services');
const { parseBRL } = require('./placa');

const TIPOS = ['cars', 'motorcycles', 'trucks'];
const DAY = 86400000;
const TTL = { lista: 7 * DAY, preco: 2 * DAY };

async function getJson(db, cfg, path, ttl) {
  const hit = await db.get('SELECT json, at FROM fipe_cache WHERE key = ?', path);
  if (hit && Date.now() - Date.parse(hit.at) < ttl) return JSON.parse(hit.json);
  let res, body;
  try {
    const headers = { accept: 'application/json', 'user-agent': 'bigodes-car' };
    if (cfg.fipeToken) headers['X-Subscription-Token'] = cfg.fipeToken;
    res = await (cfg.fetch || fetch)(`${String(cfg.fipeUrl).replace(/\/$/, '')}${path}`, { signal: AbortSignal.timeout(12000), headers });
    body = await res.json().catch(() => null);
  } catch {
    const alt = await v1(cfg, path).catch(() => null);
    if (alt) { await salvar(db, path, alt); return alt; }
    if (hit) return JSON.parse(hit.json); // sem internet: melhor o dado antigo do que nada
    throw new HttpError(502, 'Não consegui falar com a tabela FIPE. Tente de novo em instantes.');
  }
  if (res.status === 429) throw new HttpError(429, 'O limite diário gratuito da tabela FIPE acabou. Tente amanhã ou coloque um FIPE_TOKEN gratuito (fipe.api.br).');
  if (!res.ok || body == null) {
    const alt = res.status === 404 ? null : await v1(cfg, path).catch(() => null);
    if (alt) { await salvar(db, path, alt); return alt; }
    if (hit) return JSON.parse(hit.json);
    throw new HttpError(res.status === 404 ? 404 : 502, res.status === 404 ? 'Não encontrado na tabela FIPE.' : 'A tabela FIPE não respondeu direito. Tente de novo.');
  }
  await salvar(db, path, body);
  return body;
}
async function salvar(db, path, body) {
  await db.run('INSERT INTO fipe_cache (key, json, at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, at = excluded.at', path, JSON.stringify(body), new Date().toISOString());
}

/* Plano B: a API antiga (v1) da mesma tabela, que segue no ar sem cadastro. Só entra se a v2 falhar. */
const V1 = { cars: 'carros', motorcycles: 'motos', trucks: 'caminhoes' };
const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] != null) return o[k]; return null; };
const lista1 = (arr) => (Array.isArray(arr) ? arr.map((x) => ({ code: String(pick(x, 'codigo', 'code')), name: String(pick(x, 'nome', 'name')) })) : []);
async function v1(cfg, path) {
  if (!cfg.fipeUrlV1) return null;
  const m = path.match(/^\/(cars|motorcycles|trucks)\/brands(?:\/(\d+)(?:\/models(?:\/(\d+)(?:\/years(?:\/([\d-]+))?)?)?)?)?$/);
  if (!m) return null;
  const [, tipo, b, mo, y] = m;
  const url = `${String(cfg.fipeUrlV1).replace(/\/$/, '')}/${V1[tipo]}/marcas${b ? `/${b}/modelos` : ''}${mo ? `/${mo}/anos` : ''}${y ? `/${y}` : ''}`;
  const res = await (cfg.fetch || fetch)(url, { signal: AbortSignal.timeout(12000), headers: { accept: 'application/json', 'user-agent': 'bigodes-car' } });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  if (j == null) return null;
  if (y) return { price: j.Valor, codeFipe: j.CodigoFipe, brand: j.Marca, model: j.Modelo, modelYear: j.AnoModelo, fuel: j.Combustivel, referenceMonth: j.MesReferencia };
  if (mo) return lista1(j);
  if (b) return lista1(j.modelos);
  return lista1(j);
}

const idOk = (v, re = /^\d{1,7}$/) => {
  if (!re.test(String(v))) throw new HttpError(400, 'Código inválido.');
  return String(v);
};
const tipoOk = (t) => {
  const v = t || 'cars';
  if (!TIPOS.includes(v)) throw new HttpError(400, 'Tipo de veículo inválido.');
  return v;
};
const items = (arr) => (Array.isArray(arr) ? arr.map((x) => ({ code: String(x.code), name: String(x.name) })) : []);

const marcas = async (db, cfg, tipo) => items(await getJson(db, cfg, `/${tipoOk(tipo)}/brands`, TTL.lista));
const modelos = async (db, cfg, tipo, b) => items(await getJson(db, cfg, `/${tipoOk(tipo)}/brands/${idOk(b)}/models`, TTL.lista));
const anos = async (db, cfg, tipo, b, m) => items(await getJson(db, cfg, `/${tipoOk(tipo)}/brands/${idOk(b)}/models/${idOk(m)}/years`, TTL.lista));

/** Mesmo formato dos itens `fipe` da consulta de placa, para a tela reaproveitar. */
async function preco(db, cfg, tipo, b, m, y) {
  const r = await getJson(db, cfg, `/${tipoOk(tipo)}/brands/${idOk(b)}/models/${idOk(m)}/years/${idOk(y, /^\d{4,5}-\d$/)}`, TTL.preco);
  const valor = parseBRL(r.price);
  if (valor == null) throw new HttpError(404, 'A tabela FIPE não tem preço para essa combinação.');
  return { valor, codigo: r.codeFipe || null, marca: r.brand || null, modelo: r.model || null, anoModelo: Number(r.modelYear) || null, combustivel: r.fuel || null, referencia: r.referenceMonth || null };
}

const simples = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const palavras = (x) => simples(x).split(/[^a-z0-9.]+/).filter(Boolean);

/**
 * Quando a consulta de placa não traz FIPE: procura na tabela gratuita pela marca, pelo modelo e pelo ano.
 * Devolve até 5 versões no mesmo formato de `preco` (com `score`: quantas palavras do modelo bateram), da mais parecida para a menos.
 * Cada passo fica no cache (fipe_cache), então repetir a mesma placa não gasta consultas.
 */
async function adivinhar(db, cfg, { marca, modelo, ano, tipo }) {
  const t = tipoOk(tipo);
  const alvo = simples(marca).replace(/^gm$/, 'chevrolet').replace(/^vw$/, 'volkswagen');
  const ws = palavras(modelo).filter((w) => w.length >= 2);
  if (!alvo || !ws.length) return [];
  const b = (await marcas(db, cfg, t)).find((x) => palavras(x.name).includes(alvo) || simples(x.name) === alvo);
  if (!b) return [];
  const principal = ws.find((w) => w.length >= 3 && !/^\d/.test(w)) || ws[0]; // "kangoo", "onix", "gol"
  const mods = (await modelos(db, cfg, t, b.code))
    .map((m) => ({ ...m, score: palavras(m.name).filter((w) => ws.includes(w)).length }))
    .filter((m) => palavras(m.name).includes(principal))
    .sort((x, y) => y.score - x.score || x.name.length - y.name.length)
    .slice(0, 15); // nem toda versão existe no ano procurado: olha várias (tudo vai para o cache)
  const out = [];
  for (const m of mods) {
    let ys;
    try { ys = await anos(db, cfg, t, b.code, m.code); } catch { continue; }
    for (const y of ys.filter((y) => ano && String(y.code).startsWith(String(ano))).slice(0, 2)) {
      try { out.push({ ...(await preco(db, cfg, t, b.code, m.code, y.code)), score: m.score }); } catch { /* sem preço nessa combinação */ }
    }
    if (out.length >= 5) break;
  }
  return out.slice(0, 5);
}

module.exports = { marcas, modelos, anos, preco, adivinhar };
