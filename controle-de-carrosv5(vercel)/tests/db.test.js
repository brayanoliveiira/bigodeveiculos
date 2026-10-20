'use strict';
// No Postgres as colunas voltam em minúsculas; o mapa CASE devolve o nome do código. Coluna fora dele chega errada na tela
// (ex.: "jurosmes" em vez de "jurosMes": o empréstimo aparecia sem juros e sem parcelas).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CASE } = require('../server/db');
const { entities } = require('../server/schema');

test('todo campo com maiúscula do schema volta com o nome certo do Postgres', () => {
  for (const [name, e] of Object.entries(entities)) {
    for (const k of Object.keys(e.fields)) if (k !== k.toLowerCase()) assert.equal(CASE[k.toLowerCase()], k, `${name}.${k}`);
  }
});

test('toda coluna com maiúscula criada nas migrations do Postgres está no mapa', () => {
  const dir = path.join(__dirname, '..', 'server', 'migrations-pg');
  const sql = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n').replace(/--.*$/gm, '');
  const cols = new Set();
  for (const m of sql.matchAll(/^\s+([a-z][A-Za-z_]*[A-Z][A-Za-z_]*)\s+(?:TEXT|BIGINT|INTEGER|DOUBLE)/gm)) cols.add(m[1]);
  for (const m of sql.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([a-z][A-Za-z_]*[A-Z][A-Za-z_]*)\s/g)) cols.add(m[1]);
  assert.ok(cols.size > 10, 'achou as colunas');
  for (const c of cols) assert.equal(CASE[c.toLowerCase()], c, c);
});
