-- Consignado em sociedade com o dono: o lucro da venda é dividido na proporção do que cada lado tem no carro
-- (repasse do dono x gastos nossos). Ex.: dono 23 mil e nós 9 mil.
ALTER TABLE cars ADD COLUMN donoSocio INTEGER;
