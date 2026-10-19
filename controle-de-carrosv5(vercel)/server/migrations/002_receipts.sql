-- Recebimentos: como o dinheiro de uma venda entra (à vista, a prazo, parcelado, entrada em pix...).
-- Uma venda sem nenhum recebimento cadastrado é tratada como recebida por inteiro (comportamento antigo).
CREATE TABLE receipts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  carId     INTEGER NOT NULL REFERENCES cars (id),
  label     TEXT,                                   -- "Entrada", "1/5", "À vista"...
  due       TEXT NOT NULL,                          -- vencimento (AAAA-MM-DD)
  valor     REAL NOT NULL,
  status    TEXT NOT NULL DEFAULT 'Pendente',       -- Pendente | Recebido
  paidAt    TEXT,                                   -- data em que entrou
  quem      TEXT CHECK (quem IS NULL OR quem IN ('A', 'B')),  -- quem ficou com o dinheiro (vazio = regra do carro)
  obs       TEXT,
  example   INTEGER NOT NULL DEFAULT 0,
  deleted   INTEGER NOT NULL DEFAULT 0,
  createdBy INTEGER,
  createdAt TEXT,
  updatedBy INTEGER,
  updatedAt TEXT
);
CREATE INDEX idx_receipts_car ON receipts (carId);

-- Placas sempre em maiúsculo.
UPDATE cars SET placa = UPPER(TRIM(placa)) WHERE placa IS NOT NULL;
