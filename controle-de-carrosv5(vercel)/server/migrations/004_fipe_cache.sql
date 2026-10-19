-- Cache das consultas à tabela FIPE gratuita (marcas, modelos, anos e preços): poupa o limite diário da API.
CREATE TABLE fipe_cache (
  key  TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  at   TEXT NOT NULL
);
