-- Dívida entre os sócios: "Dívida" cria (o sócio fica devendo ao outro); "Abatimento" paga parte (ex.: pagou a parte do outro num carro).
CREATE TABLE partnerDebts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  date      TEXT NOT NULL,
  tipo      TEXT NOT NULL,                                     -- Dívida | Abatimento
  devedor   TEXT NOT NULL CHECK (devedor IN ('A', 'B')),       -- o sócio que deve (e que abate)
  valor     REAL NOT NULL,
  carId     INTEGER REFERENCES cars (id),                      -- abatimento feito num carro (opcional)
  obs       TEXT,
  example   INTEGER NOT NULL DEFAULT 0,
  deleted   INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER,
  createdAt TEXT,
  updatedBy INTEGER,
  updatedAt TEXT
);
