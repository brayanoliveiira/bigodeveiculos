-- Documento do carro: em nome de quem está (Antigo dono / Nosso nome / Comprador), data da transferência para o comprador
-- e documentação pendente (com o que falta).
ALTER TABLE cars ADD COLUMN docNome TEXT;
ALTER TABLE cars ADD COLUMN docTransf TEXT;
ALTER TABLE cars ADD COLUMN docPend INTEGER;
ALTER TABLE cars ADD COLUMN docObs TEXT;
