-- Fase 1 do roadmap: montadora, leilão / sinistro e regras de local.
ALTER TABLE cars ADD COLUMN marca TEXT;
ALTER TABLE cars ADD COLUMN leilao INTEGER;
ALTER TABLE cars ADD COLUMN sinistro INTEGER;
ALTER TABLE cars ADD COLUMN histObs TEXT;

-- Carro vendido fica "Entregue" (sem oficina nem previsão de saída).
UPDATE cars SET loc = 'Entregue', locdet = NULL, locprev = NULL, locdesde = COALESCE(dvenda, locdesde) WHERE status = 'Vendido';
-- No pátio sem data de entrada: vale a data de compra.
UPDATE cars SET locdesde = dcompra WHERE loc = 'Pátio / Loja' AND locdesde IS NULL AND dcompra IS NOT NULL;
