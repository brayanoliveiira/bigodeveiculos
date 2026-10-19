# Bigodes Car — controle de carros

App web para dois sócios controlarem compra e venda de carros: custo, lucro (com divisão diferente por carro), vendas com carro na troca, gastos (quem pagou), gastos previstos, localização do carro (oficina, funilaria...), acerto entre sócios, **login por usuário e histórico de quem fez cada alteração**.

Roda no seu computador ou num servidor. **Não precisa do Claude, de internet de terceiros nem de `npm install`.**

## Novidades: carro consignado e pagamento parcial
Veja docs/OPERACAO.md (seções "Carro consignado" e "Pagamento parcial de parcela").

## Começar em 1 minuto
```bash
node --version        # precisa ser 22.13 ou mais novo
ADMIN_USER=brayan ADMIN_PASSWORD='uma-senha-forte' ADMIN_NAME=Brayan npm start
```
Abra http://localhost:3000, entre, vá em **Ajustes → Usuários → Novo usuário** e crie o do Marcos. Em **Ajustes** também dá para carregar dados de exemplo.

Para deixar no ar para os dois usarem de qualquer lugar: [docs/OPERACAO.md](docs/OPERACAO.md) (Docker, HTTPS, backup).

## Telas
Resumo (lucro, estoque, **investido por sócio**, acerto, gráficos, alertas) · Carros · Onde estão (por local) · **Vendas** (carro na troca, à vista, a prazo, parcelado; o que já entrou e o que falta) · Gastos · Previstos · **Gerencial** (relatórios completos, com período e exportação CSV) · Histórico (auditoria) · Ajustes (meta, sócios, usuários, senha, backup).

**Relatórios gerenciais:** visão geral · sócios (investido em estoque e em vendidos, lucro, retorno, saldo) · lucro por mês e por investidor · caixa e recebíveis (recebido x previsto por mês, vencimentos, agenda de parcelas, atrasos) · vendas por forma de pagamento · estoque (idade e capital parado por sócio) · gastos · carros vendidos (ranking). Cada tabela exporta CSV (abre direto no Excel) e a tela imprime / salva em PDF.

## Documentação
- [docs/DEPLOY-VERCEL-SUPABASE.md](docs/DEPLOY-VERCEL-SUPABASE.md): **colocar online 24 h (Vercel + Supabase)**
- [docs/OPERACAO.md](docs/OPERACAO.md): instalar, publicar, backup, atualizar, problemas comuns
- [docs/ARQUITETURA.md](docs/ARQUITETURA.md): como o código está organizado e como mexer nele
- [docs/API.md](docs/API.md): rotas e campos

## Testes
```bash
npm test                       # regras de cálculo + API (login, permissões, histórico, atomicidade)
TEST_PG=1 npm test             # a mesma suíte contra um PostgreSQL local (postgres://postgres@127.0.0.1:5432)
# navegador de verdade (opcional; precisa de Python + Playwright + Chromium):
DB_PATH=/tmp/t.db PORT=3456 ADMIN_USER=brayan ADMIN_PASSWORD=senha-do-brayan npm start &
BASE=http://localhost:3456 python3 tests/e2e/smoke.py     # com banco novo
BASE=http://localhost:3456 python3 tests/e2e/reports.py   # depois, no mesmo banco
```

## Estrutura
```
server/    API, banco, login, histórico (Node, sem dependências)
public/    interface (HTML, CSS e JS puros)
scripts/   criar usuário, backup
tests/     testes
docs/      documentação
data/      o banco (não vai para o git)
```
