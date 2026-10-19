'use strict';
/**
 * Configuração. Tudo que muda de um ambiente para outro vem de variáveis de ambiente
 * (veja .env.example). As listas de opções (locais, categorias...) ficam aqui: é o único
 * lugar para editá-las, o navegador recebe as listas por GET /api/config.
 */
const path = require('path');

const ROOT = path.join(__dirname, '..');

const lists = {
  locs: ['Pátio / Loja', 'Oficina mecânica', 'Funilaria e pintura', 'Elétrica', 'Lavagem / estética',
    'Despachante / vistoria', 'Com cliente (test drive)', 'Outro'],
  cats: ['Mecânica', 'Peças', 'Funilaria e pintura', 'Pneus', 'Elétrica', 'Documentação e transferência',
    'IPVA / multas / licenciamento', 'Limpeza e estética', 'Combustível', 'Anúncio / marketing', 'Comissão', 'Outros'],
  // Os três abaixo são comparados por texto nas regras de cálculo (public/js/calc.js): não renomeie.
  status: ['Em estoque', 'Reservado', 'Vendido'],
  pstatus: ['Pendente', 'Realizado', 'Cancelado'],
  rstatus: ['Pendente', 'Recebido'],
  divis: ['50/50', 'Proporcional ao investido', 'Personalizado'],
  roles: ['admin', 'member', 'viewer'],
};

function fromEnv(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    dbPath: env.DB_PATH || path.join(ROOT, 'data', 'controle.db'),
    publicDir: path.join(ROOT, 'public'),
    // true quando o site é servido por HTTPS (recomendado em produção): marca o cookie como Secure.
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : !!env.VERCEL,
    // true quando há proxy reverso na frente (Nginx, Caddy, Cloudflare...): usa X-Forwarded-For para o IP.
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === 'true' : !!env.VERCEL,
    // Nuvem: com DATABASE_URL (Supabase/Postgres) o app usa Postgres em vez do arquivo SQLite.
    databaseUrl: env.DATABASE_URL || env.POSTGRES_URL || '',
    databaseSsl: env.DATABASE_SSL !== 'false',
    // Consulta de placa + FIPE (serviço pago, ex.: apiplacas.com.br). Sem token, o botão de consulta fica desligado.
    placaToken: env.PLACA_API_TOKEN || '',
    placaUrl: env.PLACA_API_URL || 'https://wdapi2.com.br/consulta',
    // Consulta por placa GRÁTIS (não oficial, sem token): usada quando não há PLACA_API_TOKEN. PLACA_FREE=false desliga.
    placaFree: env.PLACA_FREE !== 'false',
    placaFreeUrl: env.PLACA_FREE_URL || 'https://placa-fipe.apibrasil.com.br/placa/consulta',
    // Tabela FIPE gratuita (marca > modelo > ano). O token é opcional e gratuito (fipe.api.br): sobe o limite de 500 para 1.000 por dia.
    fipeUrl: env.FIPE_API_URL || 'https://fipe.parallelum.com.br/api/v2',
    fipeToken: env.FIPE_TOKEN || '',
    fipeUrlV1: env.FIPE_API_URL ? '' : 'https://fipe.parallelum.com.br/api/v1',
    sessionDays: Number(env.SESSION_DAYS || 14),
    // Só usados na primeira execução, quando ainda não existe nenhum usuário.
    adminUser: env.ADMIN_USER || '',
    adminPassword: env.ADMIN_PASSWORD || '',
    adminName: env.ADMIN_NAME || 'Administrador',
  };
}

module.exports = { ROOT, lists, fromEnv };
