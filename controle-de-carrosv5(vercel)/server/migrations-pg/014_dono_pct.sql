-- Espelha server/migrations/019_dono_pct.sql.
ALTER TABLE cars ADD COLUMN IF NOT EXISTS donopct DOUBLE PRECISION;
