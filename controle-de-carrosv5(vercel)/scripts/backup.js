'use strict';
// Lê o .env da pasta do projeto (variáveis já definidas no ambiente têm prioridade).
try { process.loadEnvFile(require('path').join(__dirname, '..', '.env')); } catch { /* sem .env: usa o padrão */ }
/**
 * Cópia de segurança consistente do banco (VACUUM INTO), mesmo com o app rodando.
 * Uso: npm run backup     (BACKUP_KEEP=30 mantém as 30 mais recentes)
 * Para restaurar: pare o app e substitua data/controle.db pelo arquivo da cópia.
 */
try { process.loadEnvFile(require('path').join(__dirname, '..', '.env')); } catch { /* sem .env */ }
const fs = require('fs');
const path = require('path');
const { fromEnv, ROOT } = require('../server/config');
const dbm = require('../server/db');

const dir = process.env.BACKUP_DIR || path.join(ROOT, 'backups');
const keep = Number(process.env.BACKUP_KEEP || 30);
fs.mkdirSync(dir, { recursive: true });

const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;

(async () => {
  const db = await dbm.open(fromEnv());
  let file;
  if (db.dialect === 'pg') {
    // Postgres: cópia em JSON de todas as tabelas (para restaurar, use o painel do Supabase ou me peça o script de importação).
    file = path.join(dir, `controle-${stamp}.json`);
    const out = {};
    for (const t of ['users', 'settings', 'cars', 'expenses', 'planned', 'receipts', 'payments', 'repasses', 'audit']) out[t] = await db.all(`SELECT * FROM ${t} ORDER BY ${t === 'settings' ? 'key' : 'id'}`);
    fs.writeFileSync(file, JSON.stringify(out));
  } else {
    file = path.join(dir, `controle-${stamp}.db`);
    db.raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  }
  await db.close();
  console.log(`Cópia criada: ${file}`);

  const all = fs.readdirSync(dir).filter((f) => /^controle-.*\.(db|json)$/.test(f)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - keep))) {
    fs.unlinkSync(path.join(dir, f));
    console.log(`Removida cópia antiga: ${f}`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
