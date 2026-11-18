-- Espelha server/migrations/017_divida_como.sql.
ALTER TABLE partnerDebts ADD COLUMN IF NOT EXISTS como TEXT;
