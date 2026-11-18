-- Espelha server/migrations/016_dono_socio.sql.
ALTER TABLE cars ADD COLUMN IF NOT EXISTS donosocio INTEGER;
