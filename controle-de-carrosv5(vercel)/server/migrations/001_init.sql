-- Esquema inicial. Para mudar o banco, crie 002_*.sql, 003_*.sql... (nunca edite um arquivo já aplicado).
-- Datas são texto AAAA-MM-DD; carimbos de tempo são texto ISO 8601 em UTC; dinheiro é REAL em reais.
-- Sócios são sempre 'A' e 'B' no banco; os nomes ficam em settings (partnerA, partnerB).

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  last_login    TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('partnerA', 'Brayan'),
  ('partnerB', 'Marcos'),
  ('meta', '0.1'),
  ('alerta', '45'),
  ('dataVersion', '1');

CREATE TABLE cars (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  placa     TEXT,
  ano       INTEGER,
  dcompra   TEXT,
  entT      REAL,                                   -- valor de entrada total
  ovrA      REAL,                                   -- quanto o sócio A pagou (só se não foi metade)
  ovrB      REAL,                                   -- quanto o sócio B pagou (só se não foi metade)
  origemId  INTEGER REFERENCES cars (id),           -- carro vendido que gerou este por troca
  anun      REAL,                                   -- preço de anúncio
  loc       TEXT,
  locdet    TEXT,
  locdesde  TEXT,
  locprev   TEXT,
  status    TEXT NOT NULL DEFAULT 'Em estoque',
  dvenda    TEXT,
  vvenda    REAL,                                   -- valor total da venda (dinheiro + carro de troca)
  quemrec   TEXT CHECK (quemrec IS NULL OR quemrec IN ('A', 'B')),
  comprador TEXT,
  divis     TEXT,
  pcust     REAL CHECK (pcust IS NULL OR (pcust >= 0 AND pcust <= 1)),
  example   INTEGER NOT NULL DEFAULT 0,
  deleted   INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER,
  createdAt TEXT,
  updatedBy INTEGER,
  updatedAt TEXT
);

CREATE TABLE expenses (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  carId     INTEGER NOT NULL REFERENCES cars (id),
  date      TEXT NOT NULL,
  cat       TEXT NOT NULL,
  "desc"    TEXT,
  valor     REAL NOT NULL,
  quem      TEXT NOT NULL CHECK (quem IN ('A', 'B')),
  obs       TEXT,
  example   INTEGER NOT NULL DEFAULT 0,
  deleted   INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER,
  createdAt TEXT,
  updatedBy INTEGER,
  updatedAt TEXT
);
CREATE INDEX idx_expenses_car ON expenses (carId);

CREATE TABLE planned (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  carId     INTEGER NOT NULL REFERENCES cars (id),
  cat       TEXT NOT NULL,
  "desc"    TEXT,
  valor     REAL NOT NULL,
  quem      TEXT CHECK (quem IS NULL OR quem IN ('A', 'B')),
  prazo     TEXT,
  status    TEXT NOT NULL DEFAULT 'Pendente',
  example   INTEGER NOT NULL DEFAULT 0,
  deleted   INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER,
  createdAt TEXT,
  updatedBy INTEGER,
  updatedAt TEXT
);
CREATE INDEX idx_planned_car ON planned (carId);

-- Histórico: só inclusão. Os gatilhos abaixo impedem alterar ou apagar linhas, mesmo por SQL do próprio app.
CREATE TABLE audit (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL,
  userId   INTEGER,
  entity   TEXT NOT NULL,                           -- car | expense | planned | settings | user
  entityId INTEGER,
  label    TEXT,                                    -- texto legível do item no momento da alteração
  action   TEXT NOT NULL,                           -- criou | editou | moveu | excluiu | restaurou
  changes  TEXT NOT NULL DEFAULT '[]'               -- JSON: [{ "f": campo, "de": antes, "para": depois }]
);
CREATE INDEX idx_audit_ts ON audit (ts DESC);

CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit
BEGIN SELECT RAISE(ABORT, 'O histórico é somente de inclusão'); END;

CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit
BEGIN SELECT RAISE(ABORT, 'O histórico é somente de inclusão'); END;
