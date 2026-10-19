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
const MAX_PER_HOUR = 30; // por usuário, só consultas que vão ao provedor

const normalizePlate = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "R$ 45.300,00" -> 45300 */
function parseBRL(s) {
  if (typeof s === 'number') return s;
  const n = parseFloat(String(s || '').replace(/[^\d,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const SIGLAS = new Set(['LT', 'LTZ', 'LS', 'LX', 'LXS', 'EX', 'EXL', 'GLS', 'GL', 'GLX', 'GLI', 'SE', 'SL', 'SV', 'SR', 'TSI', 'MPI', 'TDI', 'GTI', 'GT', 'XLS', 'XL', 'XEI', 'LE', 'RS', 'SS', 'HD', 'CD', 'MT', 'AT', 'CVT', 'TFSI', 'MI', 'MPFI', 'VW', 'GM', 'BMW', 'KIA', 'AWD', 'SUV', 'TB', 'TCE', 'ECO', 'DOHC']);
/** "VW - VolksWagen" -> "Volkswagen"; "VW/GOL 1.0 MI" -> "VW/Gol 1.0 MI": siglas e palavras com número ficam em maiúsculo. */
function tidy(s, semPrefixo) {
  let t = String(s || '').trim();
  if (semPrefixo && t.includes(' - ')) t = t.split(' - ').pop();
  return t.replace(/[^\s/]+/g, (w) => (/\d/.test(w) || SIGLAS.has(w.toUpperCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()));
}

function normalize(raw, placa) {
  const marca = tidy(raw.MARCA || raw.marca, true);
  const modelo = tidy(raw.MODELO || raw.modelo);
  const versao = tidy(raw.VERSAO || raw.SUBMODELO || '');
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

const hits = new Map(); // userId -> [timestamps]
function throttle(userId) {
  const t = Date.now(), list = (hits.get(userId) || []).filter((x) => t - x < 3600000);
  if (list.length >= MAX_PER_HOUR) throw new HttpError(429, 'Muitas consultas de placa na última hora. Tente mais tarde.');
  list.push(t); hits.set(userId, list);
}

async function lookup({ db, cfg, user, placa: rawPlaca, fresh }) {
  const placa = normalizePlate(rawPlaca);
  if (!PLACA_RE.test(placa)) throw new HttpError(400, 'Placa inválida. Use o formato ABC1D23 ou ABC1234.');
  const gratis = !cfg.placaToken;
  if (gratis && !cfg.placaFree) throw new HttpError(503, 'A consulta de placa ainda não foi ativada. Coloque o token em PLACA_API_TOKEN (veja docs/OPERACAO.md).');
  if (!fresh) {
    const c = await db.get('SELECT json, at FROM placa_cache WHERE placa = ?', placa);
    if (c && Date.now() - Date.parse(c.at) < TTL_MS) return { ...JSON.parse(c.json), cache: true, consultadoEm: c.at };
  }
  throttle(user.id);
  let res, body;
  try {
    const doFetch = cfg.fetch || fetch;
    if (gratis) {
      // Serviço gratuito e não oficial: POST com a placa em JSON, sem token.
      res = await doFetch(String(cfg.placaFreeUrl), { method: 'POST', signal: AbortSignal.timeout(15000), headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ placa }) });
      body = await res.json().catch(() => null);
      if (body && typeof body === 'object' && !body.marca && !body.MARCA && !body.modelo && !body.MODELO) body = body.data || body.dados || body.result || body.resultado || body;
    } else {
      res = await doFetch(`${String(cfg.placaUrl).replace(/\/$/, '')}/${placa}/${encodeURIComponent(cfg.placaToken)}`, { signal: AbortSignal.timeout(12000), headers: { accept: 'application/json' } });
      body = await res.json().catch(() => null);
    }
  } catch {
    throw new HttpError(502, gratis ? 'O serviço gratuito de placa não respondeu. Use "Buscar valor na tabela FIPE" (marca > modelo > ano) ou tente de novo.' : 'Não consegui falar com o serviço de consulta de placa. Tente de novo em instantes.');
  }
  const msg = body && (body.mensagemRetorno || body.message || body.erro);
  const data = body && res.ok ? normalize(body, placa) : null;
  if (!data) {
    if (gratis) throw new HttpError(404, 'O serviço gratuito não achou essa placa (ou está fora do ar). Use "Buscar valor na tabela FIPE" (marca > modelo > ano).');
    if (res && (res.status === 401 || res.status === 403)) throw new HttpError(502, 'O serviço recusou o token (inválido ou sem saldo). Confira PLACA_API_TOKEN.');
    throw new HttpError(404, msg && !/^ok$/i.test(String(msg)) ? `Consulta sem resultado: ${msg}` : 'Placa não encontrada.');
  }
  const at = new Date().toISOString();
  await db.run('INSERT INTO placa_cache (placa, json, at) VALUES (?, ?, ?) ON CONFLICT(placa) DO UPDATE SET json = excluded.json, at = excluded.at', placa, JSON.stringify(data), at);
  return { ...data, cache: false, consultadoEm: at };
}

module.exports = { lookup, normalize, normalizePlate, parseBRL, PLACA_RE };
