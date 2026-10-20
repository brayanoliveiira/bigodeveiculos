-- Espelha server/migrations/011_venc1.sql.
ALTER TABLE loans ADD COLUMN IF NOT EXISTS venc1 TEXT;
