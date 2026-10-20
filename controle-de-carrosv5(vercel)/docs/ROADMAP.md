# Roadmap: próximas atualizações

Lista pedida em 20/10/2026, organizada em fases. Cada fase pode ir para produção sozinha.
Regra de sempre: mudança de banco vai em `server/migrations/` **e** `server/migrations-pg/`, com teste em `tests/`.

Legenda de tamanho: **P** = até meio dia · **M** = 1 a 2 dias · **G** = 3 dias ou mais.

## Fase 0: feito

| Item | O que mudou |
|---|---|
| Digitar a placa e preencher tudo | Com a placa completa, a consulta roda sozinha (sem botão). Modelo, ano, cor, FIPE e referência são **trocados** pelos da placa nova. Se a consulta falhar, a FIPE antiga é apagada, porque era de outro carro. No servidor, editar a placa sem FIPE também consulta e preenche FIPE, cor e ano. |
| KM do carro | Campo `km` no cadastro (aceita "85.000"), mostrado no card. Migrations `007_km.sql` e `pg/002_km.sql`. |

## Fase 1: cadastro e organização (feito em 20/10/2026)

Migrations `008_fase1.sql` e `pg/003_fase1.sql`: colunas `marca`, `leilao`, `sinistro` e `histObs`. Carros já vendidos passam para "Entregue", e carros no pátio sem data recebem a data de compra. Essas correções em lote não aparecem no Histórico.

| # | Item | Tamanho | Como |
|---|---|---|---|
| 1.1 | "No local desde" padrão | P | Local `Pátio / Loja` sem data: usa a data de compra (`dcompra`). Regra no formulário e no servidor (`services.js`), para valer também na API. |
| 1.2 | Vendido vira "Entregue" | P | Acrescentar `Entregue` em `lists.locs`. Ao marcar `Vendido`: `loc = 'Entregue'`, limpa `locdet` e `locprev`. A aba "Onde estão" deixa de mostrar vendidos. Migration ajusta os já vendidos. |
| 1.3 | Leilão / sinistro | P | Colunas `leilao` e `sinistro` (0/1) e `histObs` (texto, aparece só se uma das caixas estiver marcada). Etiqueta vermelha no card. |
| 1.4 | Agrupar por montadora | P | Coluna `marca`, já devolvida pela consulta de placa e pela tabela FIPE. Para os carros antigos, a migration extrai a marca do nome. A lista de carros ganha "Agrupar por montadora". |
| 1.5 | Big numbers por sócio no Resumo | P | `Calc.summary().acerto` já calcula investido e lucro por sócio. Falta mostrar os cards: "Investido Brayan", "Lucro Brayan", "Investido Marcos", "Lucro Marcos" (em estoque e vendidos). |

## Fase 2: dinheiro (o que entra, o que sai, de quem é)

| # | Item | Tamanho | Como |
|---|---|---|---|
| 2.1 | Quem recebe, nos recebimentos | P | `calc.js` já tem `aReceberA` e `aReceberB`. Na tela de recebimentos: coluna "Quem recebe" (Brayan, Marcos ou ambos) e totais a receber de cada um. |
| 2.2 | Divisão do lucro com retorno do investido | M | Na ficha e na venda: "Volta para Brayan = entrada + gastos + parte do lucro (ou comissão)", e o mesmo para o Marcos. O cálculo existe em parte (`acerto.saldo`); falta mostrar por carro, com testes de consignado e de troca. |
| 2.3 | Venda com troca: Pix + carro | M | No grupo "Venda": campo "Recebido em dinheiro/Pix" e botão "Adicionar carro de troca", com um mini cadastro (placa com consulta automática, modelo, ano, KM, valor em que entrou). Ao salvar, o carro da troca é criado com `origemId`, e `vvenda = Pix + valor da troca`. Hoje é preciso cadastrar o carro da troca à parte. |
| 2.4 | Forma de pagamento dos gastos | M | Colunas `forma` (Pix à vista, Dinheiro, Débito, Crédito à vista, Crédito parcelado, Boleto/a prazo), `parcelas` e `venc`. Relatório de gastos por forma. Gasto parcelado ou a prazo entra em "Contas a pagar" (2.5). |
| 2.5 | Carros (e gastos) a pagar | G | Entidade nova `payables` (carro, origem `compra` ou `gasto`, vencimento, valor, status, quem paga, forma), com pagamentos parciais como os recebimentos. Compra a prazo (normalmente 60 dias): cada sócio paga metade no vencimento, tenha o carro sido vendido ou não. Entrada e investido contam já na compra (50/50, ou o que estiver em `ovrA`/`ovrB`); a conta a pagar mostra quanto cada sócio ainda precisa desembolsar e quando. Aba "A pagar" com vencidos, próximos 7 e 30 dias, e total por sócio. O carro vendido ou trocado continua mostrando a dívida até quitar. O Resumo ganha "Caixa projetado = a receber − a pagar". |

### Feito em 20/10/2026: Empréstimos e Veículos a pagar (item 2.5)

- Tabelas `loans` e `payables` (migrations `009_dividas.sql` e `pg/004_dividas.sql`).
- **Empréstimos:** de quem, valor, data, carro (opcional), quem paga (os dois ou um só).
  - *Juros mensais:* juros em R$ ou % todo mês e devolução do valor no vencimento.
  - *Parcelado:* tabela Price com % ao mês.
  - Parcelas geradas sozinhas. "Refazer parcelas pendentes" mantém as pagas.
- **Veículos a pagar:** à vista, a prazo (30/45/60/90/120 dias) ou parcelado, com entrada, forma, a quem pagar e quem paga. A dívida continua visível depois que o carro é vendido ou trocado.
- Resumo: alerta de conta atrasada e total a pagar. Card do carro: etiqueta "A pagar".
- **Juros saem do lucro:** juros de empréstimo é custo da sociedade, não de um carro.
  - Lucro líquido = lucro dos carros − juros pagos, no mês em que foram pagos.
  - Metade do juros sai do lucro de cada sócio. Quem pagou do bolso recebe de volta no acerto.
  - No parcelado, só a parte de juros de cada parcela conta.
  - O lucro projetado do estoque desconta os juros que ainda faltam pagar.
- **Rastreio do dinheiro:** o empréstimo tem uma finalidade e o carro comprado com ele. O app segue as trocas (Kombi vendida → Celta que entrou na troca → …). O card do carro que "carrega" o dinheiro mostra "Dinheiro de empréstimo"; quando a cadeia termina numa venda sem carro de troca, aparece "Virou dinheiro" e a marca some.

## Fase 3: controle do dia a dia

| # | Item | Tamanho | Como |
|---|---|---|---|
| 3.1 | Pendências | M | Lista de vários itens por carro (decidido): entidade `pendencias` (carro, tipo: Transferência, Documento, Vistoria, Outro; descrição, prazo, status). Etiqueta "Pendente" no card e contador no Resumo. Ao marcar como vendido, sugere criar "Transferência". |
| 3.2 | Recompra | M | Placa que já existe (mesmo vendida): aviso "Este carro já passou por aqui: vendido em 12/05 para Fulano por R$ X". Botão "Cadastrar como recompra" cria um registro novo com `recompraDe`, etiqueta "Recompra", nova data e novo valor. O histórico do carro anterior fica intacto. |
| 3.3 | Visão de consignados | M | Aba própria (hoje é um relatório no Gerencial): em estoque, dias parados, comissão projetada e realizada, % de comissão sobre a venda, a repassar por dono, ranking de donos. |

## Fase 4: acesso e margem

| # | Item | Tamanho | Como |
|---|---|---|---|
| 4.1 | Login com Google | G | OAuth 2.0 do Google (código + PKCE) sem dependência nova: `fetch` no endpoint de token e validação do `id_token` com `crypto`. Só entra quem já tiver o e-mail cadastrado em `users` (coluna `email`). A senha continua como alternativa (decidido: as duas opções ficam). Na Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e a URL de retorno. |
| 4.2 | Margem sobre a FIPE com custo completo | G | Plano separado: `docs/PLANO-MARGEM-FIPE.md`. Depende de 2.4 e 2.5 para somar tudo o que foi e será gasto. |

## Ordem sugerida

1. Fase 1 inteira (uma entrega, várias colunas, migrations juntas).
2. 2.1, 2.2 e 2.3: mostram o dinheiro certo para cada sócio.
3. 2.4 e 2.5: contas a pagar.
4. Fase 3.
5. 4.2 (margem), depois 4.1 (Google).

## Decisões tomadas (20/10/2026)

1. **Compra a prazo:** cada sócio paga metade no vencimento (normalmente 60 dias), vendido ou não. O investido conta na compra; "A pagar" acompanha o desembolso.
2. **Pendências:** lista com vários itens por carro.
3. **Classe do carro:** fora do roadmap.
4. **Login:** Google e senha, as duas opções.
