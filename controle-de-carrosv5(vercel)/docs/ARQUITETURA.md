# Arquitetura

```
navegador (public/)  ──HTTP/JSON──►  server/ (Node, sem dependências)  ──►  data/controle.db (SQLite)
```

## Princípios
- **Dois bancos, mesma interface assíncrona** (`server/db.js`: `get, all, run, insert, exec, tx(async (db) => ...)`): SQLite local (`server/migrations/`) ou PostgreSQL com `DATABASE_URL` (`server/migrations-pg/`, usado na Vercel + Supabase, pacote `pg`). Mudou o esquema? Crie a migração nas DUAS pastas. SQL do app usa `?` e colunas sem aspas (no Postgres ficam minúsculas; o driver devolve `carId` etc. pela lista `CASE` em db.js). `api/index.js` é a entrada serverless.
- **Local sem dependências.** Só módulos do Node: `node:http`, `node:sqlite`, `node:crypto`, `node:test`. Nada para instalar, nada para ficar desatualizado. Contrapartida: exige Node ≥ 22.13 e o `node:sqlite` ainda é marcado como experimental. Todo o acesso ao banco passa por `server/db.js` (interface: `exec, run, get, all, tx`); trocar por `better-sqlite3` ou outro banco é mexer só nesse arquivo.
- **Sem build no navegador.** O front é HTML + módulos ES + CSS puro. Editou, recarregou.
- **O servidor é a autoridade.** O navegador valida só para ser simpático; o servidor valida tudo de novo (`schema.js`) e decide quem pode o quê.
- **Gravação e histórico são uma coisa só.** Cada alteração roda em *uma transação*: item + linha de histórico + contador de versão. Se qualquer passo falhar, nada é gravado. (`services.js`)

## Mapa de arquivos
| Arquivo | Papel |
|---|---|
| `server/index.js` | inicia o servidor, desliga com SIGTERM |
| `server/app.js` | monta tudo (`createApp`), CSRF, sessão, permissões; usado também pelos testes |
| `server/routes.js` | lista de rotas e quem pode usar cada uma |
| `server/services.js` | criar/editar/excluir com histórico atômico; ajustes; leitura |
| `server/schema.js` | campos de carros/gastos/previstos: tipos, rótulos, validação |
| `server/auth.js` | senha (scrypt), sessões, limitador de tentativas |
| `server/http.js` | roteador, JSON, cookies, estáticos, cabeçalhos de segurança |
| `server/db.js` | SQLite + migrations |
| `server/migrations/*.sql` | esquema do banco, aplicado em ordem, uma vez |
| `server/examples.js` | dados de exemplo |
| `server/config.js` | variáveis de ambiente e listas de opções |
| `public/js/calc.js` | **todas as contas** (lucro, acerto, troca...). Roda no navegador e nos testes |
| `public/js/reports.js` | **relatórios gerenciais** (funções puras: por sócio, lucro mensal, caixa, recebíveis, vendas por forma, estoque, gastos, ranking, CSV) |
| `public/js/{main,views,vendas,gerencial,forms,state,api,util}.js` | interface (`vendas.js`: aba Vendas e janela de recebimentos; `gerencial.js`: aba de relatórios) |
| `scripts/` | `create-user.js`, `backup.js` |
| `tests/` | `calc.test.js`, `reports.test.js`, `api.test.js` (`npm test`), `e2e/smoke.py` e `e2e/reports.py` (navegador) |

## Modelo de dados (resumo)
- `users` (perfil `admin|member|viewer`, senha só em hash), `sessions` (só o SHA-256 do token), `settings` (nomes dos sócios, meta, alerta, `dataVersion`).
- `cars`, `expenses`, `planned`: exclusão é lógica (`deleted=1`). `createdBy/At`, `updatedBy/At` em todo item.
- `audit`: só inclusão. Gatilhos SQLite abortam `UPDATE` e `DELETE`. `changes` é JSON com `{f, de, para}` já formatados para leitura.

## Regras de negócio (public/js/calc.js)
- Entrada total dividida ao meio por padrão; `ovrA`/`ovrB` só quando não foi metade (o outro vira "o resto").
- Custo = entrada + gastos realizados. Preço mínimo = custo + previstos pendentes. Preço meta = mínimo × (1 + meta).
- Troca: o carro recebido aponta para o carro vendido (`origemId`). Dinheiro da venda = valor total − soma da entrada dos carros recebidos (pode ser negativo se vocês pagaram diferença).
- Lucro = venda − custo. Divisão: 50/50 (padrão), proporcional ao investido, ou personalizada (`pcust` = % do sócio A).
- Acerto (só vendidos): saldo do sócio = investido + parte do lucro − dinheiro recebido − carro de troca recebido. Os dois saldos somam zero.
- "Deixou de ganhar" = max(0, anúncio − venda).
- **Recebimentos** (`receipts`): como o *dinheiro* da venda entra (venda total − carro de troca). Sem nenhuma parcela cadastrada, a venda conta como recebida à vista. Com parcelas: `Recebido` já entrou; `Pendente` é a receber (atrasada se vencida); o que não foi programado aparece como "falta programar". Cada parcela pode ter `quem` (senão vale a regra do carro: um sócio ou metade/metade). O lucro é reconhecido na data da venda; o caixa (quando entra) tem relatório próprio. `Calc.plan` gera entrada + à vista / a prazo (30, 45, 60, 90 dias ou outro) / parcelado (2x a 36x, mês a mês, centavos fecham no total).
- **Saldo hoje** = investido + parte do lucro − o que já entrou (dinheiro + carro de troca). A soma dos dois saldos "hoje" é igual ao que ainda falta receber dos clientes; o saldo final (tudo recebido) soma zero.
- **Investido por sócio** = entrada paga + gastos pagos, valendo também para carros ainda em estoque.
- Placa é sempre salva em maiúsculo (servidor e tela).
> Mudou uma regra? Altere `calc.js` e o teste correspondente em `tests/calc.test.js`.

## Atualização em tempo (quase) real
O navegador consulta `GET /api/version` a cada 5 s (e ao voltar para a aba). Se o número mudou, recarrega `GET /api/data`. Simples e robusto; para dois usuários basta. Se um dia precisar de instantâneo, troque por Server-Sent Events em `routes.js`/`main.js`.

## Como acrescentar um campo a carros (exemplo: "cor")
1. `server/migrations/002_cor.sql`: `ALTER TABLE cars ADD COLUMN cor TEXT;`
2. `server/schema.js`: `cor: { t: 'text', max: 40, label: L('Cor') }` em `cars.fields`.
3. `public/js/forms.js`: `{ k: 'cor', label: 'Cor', t: 'text' }` no formulário do carro.
4. (opcional) mostre em `views.js`. O histórico já registra a mudança sozinho.

## Limites conhecidos
- Pensado para poucos usuários e um servidor só (SQLite). Para dezenas de usuários simultâneos, migre o banco.
- Edição simultânea do mesmo item: vale a última gravação (sem aviso de conflito). O histórico mostra o antes/depois de cada uma.
- Sem recuperação de senha por e-mail: um administrador redefine em Ajustes → Usuários, ou use `npm run user:add`.
