-- Espelha server/migrations/018_gasto_cartao.sql ("quem" vazio = metade cada; parcelas do cartão em payables.expenseid).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS forma TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS nparc INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS venc1 TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cartao TEXT;
ALTER TABLE expenses ALTER COLUMN quem DROP NOT NULL;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_quem_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_quem_check CHECK (quem IS NULL OR quem IN ('A', 'B'));
ALTER TABLE payables ADD COLUMN IF NOT EXISTS expenseid BIGINT REFERENCES expenses (id);
CREATE INDEX IF NOT EXISTS idx_payables_expense ON payables (expenseid);
