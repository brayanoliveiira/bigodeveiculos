-- Carro consignado: o carro é de um terceiro; só fica com a gente para vender.
-- `dono` preenchido = consignado. `repasse` = valor que precisa ir para o dono (sai do valor da venda).
-- A comissão é o que sobra: venda - repasse - gastos do carro.
ALTER TABLE cars ADD COLUMN dono TEXT;
ALTER TABLE cars ADD COLUMN repasse REAL;

-- Repasses ao dono do carro consignado (pode ser em partes).
CREATE TABLE repasses (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  carId     INTEGER NOT NULL REFERENCES cars (id),
  date      TEXT NOT NULL,
  valor     REAL NOT NULL,
  quem      TEXT CHECK (quem IS NULL OR quem IN ('A', 'B')),  -- quem pagou o dono (vazio = quem ficou com o dinheiro da venda)
  obs       TEXT,
  example   INTEGER NOT NULL DEFAULT 0,
  deleted   INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER,
  createdAt TEXT,
  updatedBy INTEGER,
  updatedAt TEXT
);
CREATE INDEX idx_repasses_car ON repasses (carId);

-- Pagamentos de uma parcela: o cliente pode pagar em partes, em dias diferentes.
-- A parcela só fica "Recebido" quando a soma dos pagamentos chega ao valor dela.
CREATE TABLE payments (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  receiptId INTEGER NOT NULL REFERENCES receipts (id),
  date      TEXT NOT NULL,
  valor     REAL NOT NULL,
  quem      TEXT CHECK (quem IS NULL OR quem IN ('A', 'B')),  -- quem ficou com o dinheiro (vazio = regra da parcela/carro)
  obs       TEXT,
  example   INTEGER NOT NULL DEFAULT 0,
  deleted   INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER,
  createdAt TEXT,
  updatedBy INTEGER,
  updatedAt TEXT
);
CREATE INDEX idx_payments_receipt ON payments (receiptId);
