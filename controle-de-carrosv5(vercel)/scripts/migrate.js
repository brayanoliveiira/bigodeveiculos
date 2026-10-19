'use strict';
/** Cria/atualiza as tabelas do banco (o app também faz isso sozinho ao iniciar). Uso: npm run migrate  (com DATABASE_URL para o Supabase). */
try { process.loadEnvFile(require('path').join(__dirname, '..', '.env')); } catch { /* sem .env */ }
const { fromEnv } = require('../server/config');
const dbm = require('../server/db');

(async () => {
  const db = await dbm.open(fromEnv());
  await dbm.migrate(db);
  console.log(`Banco pronto (${db.dialect === 'pg' ? 'PostgreSQL' : 'SQLite'}).`);
  await db.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
