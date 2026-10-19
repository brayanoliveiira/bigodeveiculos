'use strict';
// Sobe o app contra um PostgreSQL local (sem o pacote pg) para os testes de tela. Uso: node tests/e2e/serve-pg.js 3457
const { createTestApp } = require('../helpers/testapp');
process.env.TEST_PG = '1';
createTestApp({ port: Number(process.argv[2] || 3457), adminUser: 'brayan', adminPassword: 'senha-do-brayan', adminName: 'Brayan' })
  .then((a) => a.listen()).then((ad) => console.log('no ar', ad.port));
