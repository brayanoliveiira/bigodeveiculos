'use strict';
/**
 * Entrada para a Vercel (função serverless). Todas as chamadas /api/* chegam aqui (veja vercel.json).
 * O banco é o PostgreSQL do Supabase, escolhido pela variável DATABASE_URL.
 * A instância é criada uma vez por "container" quente e reaproveitada nas requisições seguintes.
 */
const { createApp } = require('../server/app');

let ready = null;

module.exports = async (req, res) => {
  try {
    if (!ready) ready = createApp();
    const app = await ready;
    return await app.handle(req, res);
  } catch (e) {
    ready = null; // tenta de novo na próxima requisição (ex.: banco fora do ar por um instante)
    console.error('[erro ao iniciar]', e.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Não consegui conectar ao banco de dados. Confira DATABASE_URL e tente de novo.' }));
  }
};
