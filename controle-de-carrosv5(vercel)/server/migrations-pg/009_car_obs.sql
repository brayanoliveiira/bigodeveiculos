-- Espelha server/migrations/014_car_obs.sql.
ALTER TABLE cars ADD COLUMN IF NOT EXISTS obs TEXT;
