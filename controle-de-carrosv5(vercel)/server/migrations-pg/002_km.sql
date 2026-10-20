-- Quilometragem do carro. Espelha server/migrations/007_km.sql.
ALTER TABLE cars ADD COLUMN IF NOT EXISTS km INTEGER;
