'use strict';
/**
 * Entrada para a Vercel (função serverless). Todas as chamadas /api/* chegam aqui (veja vercel.json).
 * O banco é o PostgreSQL do Supabase, escolhido pela variável DATABASE_URL.
 * A instância é criada uma vez por "container" quente e reaproveitada nas requisições seguintes.
 */
let ready = null;

// Tira da mensagem qualquer pedaço da connection string (senha!) antes de mostrar na tela.
function limpa(msg) {
  let m = String(msg || 'erro desconhecido');
  for (const v of [process.env.DATABASE_URL, process.env.POSTGRES_URL]) {
    if (!v) continue;
    m = m.split(v).join('[DATABASE_URL]');
    try { const pw = decodeURIComponent(new URL(v).password); if (pw) m = m.split(pw).join('***'); } catch { /* url inválida */ }
  }
  return m.slice(0, 300);
}

module.exports = async (req, res) => {
  try {
    if (!ready) ready = require('../server/app').createApp();
    const app = await ready;
    return await app.handle(req, res);
  } catch (e) {
    ready = null; // tenta de novo na próxima requisição (ex.: banco fora do ar por um instante)
    console.error('[erro ao iniciar]', e && e.stack || e);
    let dica = '';
    const m = String(e && e.message || '');
    if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) dica = ' A variável DATABASE_URL não está cadastrada na Vercel (Settings > Environment Variables) ou o deploy foi feito antes de cadastrá-la: cadastre e faça Redeploy.';
    else if (/Cannot find module/.test(m)) dica = ' O pacote "pg" não foi instalado: confira se o package.json foi enviado ao GitHub.';
    else if (/ENOTFOUND|ENETUNREACH|EAI_AGAIN/.test(m)) dica = ' Endereço do banco não encontrado: use a connection string do "Transaction pooler" (porta 6543), não a "Direct connection".';
    else if (/Tenant or user not found/i.test(m)) dica = ' Usuário errado: no pooler o usuário é "postgres.SEU-PROJETO" (copie a string pronta do botão Connect).';
    else if (/password authentication failed/i.test(m)) dica = ' Senha incorreta (ou com caracteres especiais sem codificar: troque a senha do banco por uma só com letras e números).';
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: `Não consegui conectar ao banco de dados. Detalhe: ${limpa(m)}.${dica}` }));
  }
};
