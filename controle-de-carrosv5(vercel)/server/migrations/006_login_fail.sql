-- Tentativas de login que falharam (guardadas no banco para valer mesmo com vários servidores/instâncias).
CREATE TABLE login_fail (
  key        TEXT PRIMARY KEY,           -- ip|usuario
  n          INTEGER NOT NULL DEFAULT 0, -- erros seguidos
  until_ms   INTEGER NOT NULL DEFAULT 0, -- bloqueado até (epoch em ms)
  updated_ms INTEGER NOT NULL DEFAULT 0
);
