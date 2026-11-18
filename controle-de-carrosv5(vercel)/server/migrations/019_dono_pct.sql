-- Consignado com dono sócio: % do lucro combinado com o dono (0 a 1). Vazio = proporcional à parte dele no carro.
ALTER TABLE cars ADD COLUMN donoPct REAL;
