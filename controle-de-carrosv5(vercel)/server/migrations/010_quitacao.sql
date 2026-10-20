-- Empréstimo: data em que pretendemos quitar (vazio = data da última parcela).
ALTER TABLE loans ADD COLUMN quitPrev TEXT;
