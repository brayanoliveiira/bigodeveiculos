'use strict';
/**
 * Cria um usuário pelo terminal (útil na primeira instalação ou se alguém esquecer a senha e não houver admin).
 * Uso: npm run user:add -- <usuario> "<Nome>" <admin|member|viewer> [senha]
 * Sem senha, gera uma aleatória e mostra na tela. Se o usuário já existir, REDEFINE a senha dele.
 */
try { process.loadEnvFile(require('path').join(__dirname, '..', '.env')); } catch { /* sem .env */ }
const crypto = require('crypto');
const { fromEnv, lists } = require('../server/config');
const dbm = require('../server/db');
const A = require('../server/auth');
const S = require('../server/services');

const [username, name, role, passArg] = process.argv.slice(2);
if (!username || !name || !lists.roles.includes(role)) {
  console.error('Uso: npm run user:add -- <usuario> "<Nome>" <admin|member|viewer> [senha]');
  process.exit(1);
}
const password = passArg || crypto.randomBytes(9).toString('base64url');
const bad = A.checkPasswordRules(password);
if (bad) { console.error(bad); process.exit(1); }

(async () => {
  const db = await dbm.open(fromEnv());
  await dbm.migrate(db);
  const existing = await db.get('SELECT * FROM users WHERE lower(username) = lower(?)', username);
  await db.tx(async (db) => {
    if (existing) {
      await db.run('UPDATE users SET name = ?, role = ?, active = 1, password_hash = ? WHERE id = ?', name, role, A.hashPassword(password), existing.id);
      await A.destroyUserSessions(db, existing.id);
      await S.writeAudit(db, null, 'user', existing.id, username, 'editou', [{ f: 'Senha', de: null, para: 'redefinida pelo terminal' }]);
    } else {
      const newId = await db.insert('INSERT INTO users (username, name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
        username, name, A.hashPassword(password), role, S.now());
      await S.writeAudit(db, null, 'user', newId, username, 'criou', [{ f: 'Perfil', de: null, para: role }]);
    }
    await S.bump(db);
  });
  console.log(`${existing ? 'Usuário atualizado' : 'Usuário criado'}: ${username} (${role})`);
  if (!passArg) console.log(`Senha: ${password}   (anote e troque depois de entrar)`);
  await db.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
