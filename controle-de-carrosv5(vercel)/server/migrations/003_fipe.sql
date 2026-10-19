-- Dados vindos da consulta de placa e da tabela FIPE.
ALTER TABLE cars ADD COLUMN cor TEXT;
ALTER TABLE cars ADD COLUMN fipe REAL;       -- valor FIPE (R$) no momento da consulta
ALTER TABLE cars ADD COLUMN fipeRef TEXT;    -- "Out/2026 · cód. 001234-5"

-- Cache das consultas de placa (cada consulta no provedor é cobrada): reaproveita por 30 dias.
CREATE TABLE placa_cache (
  placa TEXT PRIMARY KEY,
  json  TEXT NOT NULL,
  at    TEXT NOT NULL
);
