'use strict';
// Lê o .env da pasta do projeto (variáveis já definidas no ambiente têm prioridade).
try { process.loadEnvFile(require('path').join(__dirname, '..', '.env')); } catch { /* sem .env: usa o padrão */ }
const { createApp } = require('./app');

async function main() {
  const app = await createApp();
  if (app.bootstrapped) console.log(`Administrador "${app.cfg.adminUser}" criado a partir de ADMIN_USER/ADMIN_PASSWORD. Pode remover a senha do .env.`);
  if ((await app.db.get('SELECT COUNT(*) AS n FROM users')).n === 0) {
    console.warn('ATENÇÃO: ainda não há nenhum usuário. Defina ADMIN_USER e ADMIN_PASSWORD e reinicie, ou rode: npm run user:add -- <usuario> "<Nome>" admin');
  }
  const addr = await app.listen();
  console.log(`Controle de Carros no ar em http://localhost:${addr.port} (banco: ${app.cfg.databaseUrl ? 'PostgreSQL' : app.cfg.dbPath})`);

  let closing = false;
  const stop = () => {
    if (closing) return;
    closing = true;
    console.log('Encerrando...');
    app.close().then(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => { console.error('Falha ao iniciar:', e.message); process.exit(1); });
