-- Empréstimo com juros mensais: data do 1º vencimento dos juros (os outros seguem o mesmo dia). Vazio = 1 mês depois do empréstimo.
ALTER TABLE loans ADD COLUMN venc1 TEXT;
