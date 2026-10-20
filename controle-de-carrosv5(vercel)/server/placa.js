'use strict';
/**
 * Consulta de placa: devolve marca, modelo, ano, cor e valor(es) FIPE.
 * Não existe fonte pública e gratuita para placa -> dados do carro; por isso usa um provedor pago
 * (padrão: apiplacas.com.br, GET {PLACA_API_URL}/{placa}/{token}). O token fica só no servidor.
 * Cada consulta é cobrada pelo provedor, então o resultado fica em cache (tabela placa_cache) por 30 dias.
 */
const { HttpError } = require('./services');

const PLACA_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/; // AAA9999 (antiga) e AAA9A99 (Mercosul)
const TTL_MS = 30 * 86400000;
const CACHE_V = 2; // muda quando a leitura dos dados muda: consultas guardadas de versão antiga são refeitas (v2: marca/modelo consertados)
const MAX_PER_HOUR = 30; // por usuário, só consultas que vão ao provedor

const normalizePlate = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "R$ 45.300,00" -> 45300 */
function parseBRL(s) {
  if (typeof s === 'number') return s;
  const n = parseFloat(String(s || '').replace(/[^\d,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const SIGLAS = new Set(['LT', 'LTZ', 'LS', 'LX', 'LXS', 'EX', 'EXL', 'GLS', 'GL', 'GLX', 'GLI', 'SE', 'SL', 'SV', 'SR', 'TSI', 'MPI', 'TDI', 'GTI', 'GT', 'XLS', 'XL', 'XEI', 'LE', 'RS', 'SS', 'HD', 'CD', 'MT', 'AT', 'CVT', 'TFSI', 'MI', 'MPFI', 'VW', 'GM', 'BMW', 'KIA', 'GWM', 'BYD', 'JAC', 'RAM', 'AWD', 'SUV', 'TB', 'TCE', 'ECO', 'DOHC']);
/** "VW - VolksWagen" -> "Volkswagen"; "VW/GOL 1.0 MI" -> "VW/Gol 1.0 MI": siglas e palavras com número ficam em maiúsculo. */
function tidy(s, semPrefixo) {
  let t = String(s || '').trim();
  if (semPrefixo && t.includes(' - ')) t = t.split(' - ').pop();
  return t.replace(/[^\s/]+/g, (w) => (/\d/.test(w) || SIGLAS.has(w.toUpperCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()));
}

// Montadoras conhecidas: quando o provedor manda a marca errada (ex.: "T", "I" de importado) e ela aparece no modelo.
const MONTADORAS = ['ALFA ROMEO', 'LAND ROVER', 'MERCEDES-BENZ', 'MERCEDES', 'AUDI', 'BMW', 'BYD', 'CAOA', 'CHERY', 'CHEVROLET', 'CHEV', 'CITROEN', 'DODGE', 'FIAT', 'FORD', 'GM', 'GWM',
  'HONDA', 'HYUNDAI', 'IVECO', 'JAC', 'JAGUAR', 'JEEP', 'KIA', 'LEXUS', 'LIFAN', 'MINI', 'MITSUBISHI', 'MMC', 'NISSAN', 'PEUGEOT', 'PORSCHE', 'RAM', 'RENAULT', 'SUBARU', 'SUZUKI',
  'TOYOTA', 'TROLLER', 'VOLKSWAGEN', 'VOLVO', 'VW', 'YAMAHA'];
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
/** Conserta marca/modelo mal preenchidos pelo provedor e tira códigos soltos do modelo ("RENAULT KANGOO SPW1616" com marca "T" -> Renault / Kangoo). */
function arrumar(marcaRaw, modeloRaw, versaoRaw) {
  let marca = String(marcaRaw || '').trim(), modelo = String(modeloRaw || '').trim(), versao = String(versaoRaw || '').trim();
  modelo = modelo.replace(/^I\s*\//, '').replace(/^([A-Z]+)\//i, '$1 '); // "I/VW GOL" -> "VW GOL"; "VW/GOL" -> "VW GOL"
  const APELIDO = { CHEV: 'CHEVROLET', GM: 'CHEVROLET', VW: 'VOLKSWAGEN', MMC: 'MITSUBISHI', MERCEDES: 'MERCEDES-BENZ' };
  const canon = (x) => { const k = semAcento(x).split(' - ').pop(); return APELIDO[k] || k; };
  const conhecida = (x) => MONTADORAS.some((m) => canon(x) === canon(m));
  const naFrente = MONTADORAS.find((m) => semAcento(modelo) === m || semAcento(modelo).startsWith(m + ' '));
  if (naFrente && (!conhecida(marca) || semAcento(marca).length <= 1)) { marca = modelo.slice(0, naFrente.length); modelo = modelo.slice(naFrente.length).trim(); }
  else if (!conhecida(marca) && semAcento(marca).length <= 1 && conhecida(versao)) { marca = versao; versao = ''; }
  else if (naFrente && canon(marca) === canon(naFrente)) modelo = modelo.slice(naFrente.length).trim(); // marca repetida no modelo ("CHEV ONIX" com marca Chevrolet)
  // código solto (letras e números juntos, 6+ caracteres, ex.: SPW1616) não é nome de versão
  modelo = modelo.split(/\s+/).filter((w) => !(/^(?=.*\d)(?=.*[A-Z])[A-Z0-9]{6,}$/i.test(w))).join(' ');
  if (versao && canon(versao) === canon(marca)) versao = '';
  return { marca, modelo, versao };
}

function normalize(raw, placa) {
  const fx = arrumar(raw.MARCA || raw.marca, raw.MODELO || raw.modelo, raw.VERSAO || raw.SUBMODELO || '');
  const marca = tidy(fx.marca, true);
  const modelo = tidy(fx.modelo);
  const versao = tidy(fx.versao);
  if (!marca && !modelo) return null;
  const dados = Array.isArray(raw.fipe && raw.fipe.dados) ? raw.fipe.dados : [];
  const fipe = dados
    .map((d) => ({
      valor: parseBRL(d.texto_valor), codigo: d.codigo_fipe || null, modelo: tidy(d.texto_modelo),
      anoModelo: Number(d.ano_modelo) || null, combustivel: d.combustivel || null,
      referencia: d.mes_referencia ? String(d.mes_referencia).trim() : (d.referencia_fipe ? String(d.referencia_fipe) : null),
      score: Number(d.score) || 0,
    }))
    .filter((d) => d.valor != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const semMarca = modelo.toUpperCase().startsWith(marca.toUpperCase());
  const comVersao = versao && !modelo.toUpperCase().includes(versao.toUpperCase());
  const nome = [semMarca ? '' : marca, modelo, comVersao ? versao : ''].filter(Boolean).join(' ');
  return {
    placa, marca, modelo, versao, nome,
    ano: Number(raw.anoModelo || raw.ano) || null, anoFab: Number(raw.ano) || null,
    cor: tidy(raw.cor), uf: raw.uf || null, municipio: tidy(raw.municipio), situacao: raw.situacao || null,
    fipe,
  };
}

/** Acha o primeiro objeto aninhado que tenha algum dos campos (as respostas do provedor mudam de formato). */
function findObj(o, keys, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 5) return null;
  if (!Array.isArray(o) && keys.some((k) => o[k] != null && o[k] !== '')) return o;
  for (const v of Object.values(o)) { const r = findObj(v, keys, depth + 1); if (r) return r; }
  return null;
}
const pick = (o, ...ks) => { for (const k of ks) { const f = Object.keys(o || {}).find((x) => x.toLowerCase() === k.toLowerCase()); if (f && o[f] != null && o[f] !== '') return o[f]; } return null; };

/** Resposta da APIBrasil (dados + fipe) -> mesmo formato do normalize(). */
function normalizeApiBrasil(dadosBody, fipeBody, placa) {
  const d = findObj(dadosBody, ['marca', 'MARCA', 'modelo', 'MODELO']);
  if (!d) return null;
  const raw = { marca: pick(d, 'marca'), modelo: pick(d, 'modelo'), VERSAO: pick(d, 'versao', 'submodelo'), ano: pick(d, 'ano', 'anoFabricacao'), anoModelo: pick(d, 'anoModelo', 'ano_modelo'), cor: pick(d, 'cor'), uf: pick(d, 'uf'), municipio: pick(d, 'municipio'), situacao: pick(d, 'situacao') };
  let lista = [];
  const f = fipeBody && (fipeBody.response || fipeBody.data || fipeBody.dados || fipeBody);
  const arr = Array.isArray(f) ? f : (f && (f.dados || f.fipe || f.data)) || (f ? [f] : []);
  for (const it of (Array.isArray(arr) ? arr : [arr])) {
    if (!it || typeof it !== 'object') continue;
    const v = pick(it, 'texto_valor', 'valor', 'value', 'preco');
    if (v != null) lista.push({ texto_valor: v, codigo_fipe: pick(it, 'codigo_fipe', 'codigoFipe', 'codigo'), texto_modelo: pick(it, 'texto_modelo', 'modelo', 'model'), ano_modelo: pick(it, 'ano_modelo', 'anoModelo', 'ano'), combustivel: pick(it, 'combustivel'), mes_referencia: pick(it, 'mes_referencia', 'referencia', 'mesReferencia'), score: pick(it, 'score') || 0 });
  }
  raw.fipe = { dados: lista };
  return normalize(raw, placa);
}

/** Resposta de zapcarconsulta.com.br/api/fipe-placa ({ veiculo, fipe[], tem_fipe }) -> normalize(). */
function parseSite(j, placa) {
  const v = j && j.veiculo;
  if (!v || (!v.marca && !v.modelo)) return null;
  return normalize({
    marca: v.marca, modelo: v.modelo, VERSAO: v.submodelo, ano: v.ano_fabricacao || v.ano, anoModelo: v.ano, cor: v.cor, uf: v.uf, municipio: v.municipio,
    fipe: { dados: Array.isArray(j.fipe) ? j.fipe : [] },
  }, placa);
}

const hits = new Map(); // userId -> [timestamps]
function throttle(userId) {
  const t = Date.now(), list = (hits.get(userId) || []).filter((x) => t - x < 3600000);
  if (list.length >= MAX_PER_HOUR) throw new HttpError(429, 'Muitas consultas de placa na última hora. Tente mais tarde.');
  list.push(t); hits.set(userId, list);
}

async function lookup({ db, cfg, user, placa: rawPlaca, fresh }) {
  const placa = normalizePlate(rawPlaca);
  if (!PLACA_RE.test(placa)) throw new HttpError(400, 'Placa inválida. Use o formato ABC1D23 ou ABC1234.');
  const apib = !cfg.placaToken && !!(cfg.apibrasilBearer && cfg.apibrasilDevice);
  const site = !cfg.placaToken && !apib && cfg.placaSite !== false && !!cfg.placaSiteUrl;
  const gratis = !cfg.placaToken && !apib && !site;
  if (gratis && !cfg.placaFree) throw new HttpError(503, 'A consulta de placa ainda não foi ativada. Cadastre APIBRASIL_BEARER e APIBRASIL_DEVICE_TOKEN (veja docs/OPERACAO.md).');
  if (!fresh) {
    const c = await db.get('SELECT json, at FROM placa_cache WHERE placa = ?', placa);
    const old = c ? JSON.parse(c.json) : null;
    if (old && old.v === CACHE_V && Date.now() - Date.parse(c.at) < TTL_MS) { delete old.v; return { ...old, cache: true, consultadoEm: c.at }; }
  }
  throttle(user.id);
  let res, body;
  try {
    const doFetch = cfg.fetch || fetch;
    if (site) {
      res = await doFetch(`${String(cfg.placaSiteUrl)}?placa=${encodeURIComponent(placa)}`, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json', 'accept-language': 'pt-BR,pt;q=0.9', 'user-agent': 'Mozilla/5.0 (compatible; BigodesCar/1.0)' } });
      const j = await res.json().catch(() => null);
      body = res.ok ? { __site: true, j } : j;
    } else if (apib) {
      const base = String(cfg.apibrasilUrl).replace(/\/$/, '');
      const hdr = { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${cfg.apibrasilBearer}`, devicetoken: cfg.apibrasilDevice };
      const call = async (rota) => { const r = await doFetch(`${base}/vehicles/${rota}`, { method: 'POST', signal: AbortSignal.timeout(20000), headers: hdr, body: JSON.stringify({ placa }) }); return { r, b: await r.json().catch(() => null) }; };
      const [dd, ff] = await Promise.all([call('dados'), call('fipe').catch(() => ({ r: { ok: false }, b: null }))]);
      res = dd.r;
      body = res.ok && dd.b && dd.b.error !== true ? { __apib: true, dados: dd.b, fipe: ff.r.ok ? ff.b : null } : dd.b;
    } else if (gratis) {
      // Serviço gratuito e não oficial: POST com a placa em JSON, sem token.
      res = await doFetch(String(cfg.placaFreeUrl), { method: 'POST', signal: AbortSignal.timeout(15000), headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ placa }) });
      body = await res.json().catch(() => null);
      if (body && typeof body === 'object' && !body.marca && !body.MARCA && !body.modelo && !body.MODELO) body = body.data || body.dados || body.result || body.resultado || body;
    } else {
      res = await doFetch(`${String(cfg.placaUrl).replace(/\/$/, '')}/${placa}/${encodeURIComponent(cfg.placaToken)}`, { signal: AbortSignal.timeout(12000), headers: { accept: 'application/json' } });
      body = await res.json().catch(() => null);
    }
  } catch (e) {
    const motivo = e && (e.cause && (e.cause.code || e.cause.message) || e.name || e.message) || 'erro';
    throw new HttpError(502, site ? `Não consegui acessar o site de consulta (${String(motivo).slice(0, 80)}). Use "Buscar valor na tabela FIPE" (marca > modelo > ano) ou tente de novo.` : gratis ? `O serviço gratuito de placa não respondeu (${String(motivo).slice(0, 80)}). Use "Buscar valor na tabela FIPE" (marca > modelo > ano) ou tente de novo.` : 'Não consegui falar com o serviço de consulta de placa. Tente de novo em instantes.');
  }
  const msg = body && (body.mensagemRetorno || body.message || body.erro);
  const data = body && res.ok ? (body.__site ? parseSite(body.j, placa) : body.__apib ? normalizeApiBrasil(body.dados, body.fipe, placa) : normalize(body, placa)) : null;
  if (!data) {
    if (site) throw new HttpError(res && !res.ok ? 502 : 404, res && !res.ok ? `O site de consulta respondeu HTTP ${res.status}. Use "Buscar valor na tabela FIPE" (marca > modelo > ano) ou tente de novo.` : 'O site não achou essa placa. Confira a placa ou use "Buscar valor na tabela FIPE".');
    if (gratis) throw new HttpError(404, `O serviço gratuito não achou essa placa (resposta HTTP ${res && res.status}${msg ? ': ' + String(msg).slice(0, 80) : ''}). Use "Buscar valor na tabela FIPE" (marca > modelo > ano).`);
    if (res && (res.status === 401 || res.status === 403)) throw new HttpError(502, apib ? 'A APIBrasil recusou os tokens. Confira APIBRASIL_BEARER e APIBRASIL_DEVICE_TOKEN.' : 'O serviço recusou o token (inválido ou sem saldo). Confira PLACA_API_TOKEN.');
    throw new HttpError(404, msg && !/^ok$/i.test(String(msg)) ? `Consulta sem resultado: ${msg}` : 'Placa não encontrada.');
  }
  const at = new Date().toISOString();
  await db.run('INSERT INTO placa_cache (placa, json, at) VALUES (?, ?, ?) ON CONFLICT(placa) DO UPDATE SET json = excluded.json, at = excluded.at', placa, JSON.stringify({ ...data, v: CACHE_V }), at);
  return { ...data, cache: false, consultadoEm: at };
}

module.exports = { arrumar, parseSite, lookup, normalize, normalizeApiBrasil, normalizePlate, parseBRL, PLACA_RE };
