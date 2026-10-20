-- Espelha server/migrations/010_quitacao.sql.
ALTER TABLE loans ADD COLUMN IF NOT EXISTS quitPrev TEXT;
