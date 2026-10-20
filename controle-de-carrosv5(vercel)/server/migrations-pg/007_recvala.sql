-- Espelha server/migrations/012_recvala.sql.
ALTER TABLE cars ADD COLUMN IF NOT EXISTS recValA DOUBLE PRECISION;
