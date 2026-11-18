-- Gasto pago no cartão parcelado: forma, número de parcelas, vencimento da 1ª fatura e qual cartão.
-- As parcelas vão para payables (origem 'Gasto', expenseId) e são marcadas como pagas quando a fatura é paga.
-- "Quem gastou" passa a aceitar vazio = metade de cada sócio (o SQLite não muda CHECK/NOT NULL: a tabela é recriada).
CREATE TABLE expenses_new (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  carId     INTEGER NOT NULL REFERENCES cars (id),
  date      TEXT NOT NULL,
  cat       TEXT NOT NULL,
  "desc"    TEXT,
  valor     REAL NOT NULL,
  quem      TEXT CHECK (quem IS NULL OR quem IN ('A', 'B')),
  obs       TEXT,
  example   INTEGER NOT NULL DEFAULT 0,
  deleted   INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER,
  createdAt TEXT,
  updatedBy INTEGER,
  updatedAt TEXT,
  forma     TEXT,
  nParc     INTEGER,
  venc1     TEXT,
  cartao    TEXT
);
INSERT INTO expenses_new (id, carId, date, cat, "desc", valor, quem, obs, example, deleted, createdBy, createdAt, updatedBy, updatedAt)
  SELECT id, carId, date, cat, "desc", valor, quem, obs, example, deleted, createdBy, createdAt, updatedBy, updatedAt FROM expenses;
DROP TABLE expenses;
ALTER TABLE expenses_new RENAME TO expenses;
CREATE INDEX idx_expenses_car ON expenses (carId);
ALTER TABLE payables ADD COLUMN expenseId INTEGER REFERENCES expenses (id);
