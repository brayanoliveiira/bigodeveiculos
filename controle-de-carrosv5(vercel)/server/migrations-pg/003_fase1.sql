-- Fase 1 do roadmap: montadora, leilão / sinistro e regras de local. Espelha server/migrations/008_fase1.sql.
ALTER TABLE cars ADD COLUMN IF NOT EXISTS marca TEXT;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS leilao INTEGER;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS sinistro INTEGER;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS histObs TEXT;

UPDATE cars SET loc = 'Entregue', locdet = NULL, locprev = NULL, locdesde = COALESCE(dvenda, locdesde) WHERE status = 'Vendido';
UPDATE cars SET locdesde = dcompra WHERE loc = 'Pátio / Loja' AND locdesde IS NULL AND dcompra IS NOT NULL;
