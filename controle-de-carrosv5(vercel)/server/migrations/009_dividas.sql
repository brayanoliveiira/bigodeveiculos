-- Empréstimos (dinheiro que pegamos para comprar carros) e contas a pagar (parcelas de empréstimos e de carros comprados a prazo).
CREATE TABLE loans (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  credor    TEXT NOT NULL,                          -- de quem pegamos (ex.: "Mãe", "Nubank")
  data      TEXT NOT NULL,                          -- quando o dinheiro entrou (AAAA-MM-DD)
  valor     REAL NOT NULL,                          -- quanto pegamos
  carId     INTEGER REFERENCES cars (id),           -- para qual carro (opcional)
  modo      TEXT NOT NULL,                          -- 'Juros mensais' (só juros todo mês, devolve tudo no fim) | 'Parcelado'
  jurosMes  REAL,                                   -- juros em R$ por mês (modo Juros mensais)
  taxaMes   REAL,                                   -- juros em % ao mês (0 a 1)
  nParc     INTEGER,                                -- número de parcelas (modo Parcelado)
  venc      TEXT,                                   -- data da devolução (Juros mensais) ou do 1º vencimento (Parcelado)
  quem      TEXT CHECK (quem IS NULL OR quem IN ('A', 'B')),  -- quem paga (vazio = metade cada)
  obs       TEXT,
  example   INTEGER NOT NULL DEFAULT 0,
  deleted   INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER,
  createdAt TEXT,
  updatedBy INTEGER,
  updatedAt TEXT
);

CREATE TABLE payables (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  origem    TEXT NOT NULL,                          -- 'Carro' | 'Empréstimo'
  carId     INTEGER REFERENCES cars (id),
  loanId    INTEGER REFERENCES loans (id),
  credor    TEXT,                                   -- a quem pagamos
  label     TEXT,                                   -- "1/2", "Juros 11/2026", "Devolução"...
  tipo      TEXT,                                   -- À vista | Entrada | Parcela | Juros | Devolução
  due       TEXT NOT NULL,                          -- vencimento
  valor     REAL NOT NULL,
  forma     TEXT,                                   -- Pix, boleto, transferência...
  quem      TEXT CHECK (quem IS NULL OR quem IN ('A', 'B')),  -- quem paga (vazio = metade cada)
  status    TEXT NOT NULL DEFAULT 'Pendente',       -- Pendente | Pago
  paidAt    TEXT,
  obs       TEXT,
  example   INTEGER NOT NULL DEFAULT 0,
  deleted   INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER,
  createdAt TEXT,
  updatedBy INTEGER,
  updatedAt TEXT
);
CREATE INDEX idx_payables_car ON payables (carId);
CREATE INDEX idx_payables_loan ON payables (loanId);
