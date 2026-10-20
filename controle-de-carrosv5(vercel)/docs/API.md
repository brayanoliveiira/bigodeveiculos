# API

JSON sobre HTTP. Tudo em `/api/*`. Erros: `{ "error": "mensagem em português" }` com status 400/401/403/404/409/429.
**Requisitos de toda requisição que altera algo (POST/PUT/PATCH/DELETE):** cabeçalho `X-Requested-With: controle-de-carros` (e `Content-Type: application/json`). Sem ele, 403. A sessão vai no cookie `cc_sid` (HttpOnly), criado pelo login.

Perfis: `admin` (tudo) · `member` (lê e grava dados) · `viewer` (só lê).

| Método e rota | Quem | O que faz |
|---|---|---|
| `GET /api/health` | público | `{ok:true}` (checa o banco) |
| `GET /api/config` | público | listas de opções (locais, categorias, status...) |
| `POST /api/login` `{username,password}` | público | cria sessão. 401 se errado; 429 após 5 erros seguidos |
| `POST /api/logout` | logado | encerra a sessão |
| `GET /api/me` | logado | `{user:{id,username,name,role}}` |
| `POST /api/password` `{current,next}` | logado | troca a própria senha (mín. 8); encerra as outras sessões |
| `GET /api/version` | logado | `{version}`; muda a cada gravação (a tela consulta a cada 5 s) |
| `GET /api/data` | logado | `{version, cars, expenses, planned, settings:{meta,alerta,partners:{A,B}}}` (inclui excluídos com `deleted:true`) |
| `GET /api/placa/:placa[?fresh=1]` | admin/membro | consulta placa + FIPE: `{placa,marca,modelo,nome,ano,cor,uf,municipio,fipe:[{valor,codigo,modelo,anoModelo,referencia,score}],cache,consultadoEm}`. 503 sem `PLACA_API_TOKEN`; `fresh=1` ignora o cache |
| `GET /api/fipe/marcas[?tipo=cars\|motorcycles\|trucks]`, `/marcas/:b/modelos`, `/marcas/:b/modelos/:m/anos` | admin/membro | `{items:[{code,name}]}` da tabela FIPE gratuita (com cache) |
| `GET /api/fipe/marcas/:b/modelos/:m/anos/:y` | admin/membro | `{valor,codigo,marca,modelo,anoModelo,combustivel,referencia}` |
| `GET /api/audit?limit=&offset=` | logado | histórico, mais novo primeiro, com `userName` |
| `GET /api/export` | logado | tudo + histórico, como download JSON |
| `GET /api/users` | admin | lista usuários |
| `POST /api/users` `{username,name,role,password}` | admin | cria usuário |
| `PATCH /api/users/:id` `{name?,role?,active?,password?}` | admin | edita; não deixa ficar sem admin ativo; trocar senha/desativar derruba as sessões dele |
| `POST /api/cars/:id/plan` `{parts:[{label,due,valor,status?,paidAt?,quem?}]}` | admin/member | programa o recebimento da venda (entrada + parcelas) numa transação; substitui as parcelas ainda pendentes e mantém as recebidas |
| `POST /api/payables/plan` `{loanId?, carId?, replace?, parts:[{label,tipo,due,valor,forma?,quem?,credor?,status?,paidAt?}]}` | admin/member | programa contas a pagar de um empréstimo (`loanId`) ou da compra a prazo de um carro (`carId`) numa transação; com `replace` (só empréstimo), troca as parcelas pendentes e mantém as pagas |
| `GET/POST/PATCH/DELETE /api/loans`, `/api/payables` | — | CRUD genérico de empréstimos e contas a pagar (mesmas regras de `/api/:entity`) |
| `PUT /api/settings` `{meta,alerta}` | admin/member | meta de margem (0 a 5 = 0 a 500%) e dias de alerta |
| `PUT /api/settings/partners` `{A,B}` | admin | nomes dos sócios |
| `POST /api/examples` `{today?:"AAAA-MM-DD"}` / `DELETE /api/examples` | admin/member | carrega / remove dados de exemplo (as datas partem do `today` do navegador) |
| `POST /api/{cars\|expenses\|planned\|receipts}` | admin/member | cria → `201 {item}` |
| `PATCH /api/{entity}/:id` | admin/member | edita só os campos enviados → `{item, changed}`. Com `"_action":"move"` (só carros) aceita apenas `loc, locdet, locdesde, locprev` e registra "moveu" |
| `DELETE /api/{entity}/:id` | admin/member | exclusão lógica (continua no banco) |
| `POST /api/{entity}/:id/restore` | admin/member | restaura |

## Campos
Definidos em `server/schema.js` (tipo, obrigatório, rótulo). Sócios são sempre `"A"` e `"B"` (os nomes ficam em `settings.partners`). Datas `AAAA-MM-DD`. Dinheiro em reais (número). Campo desconhecido → 400.

**cars:** `name*, placa, ano, dcompra, entT, ovrA, ovrB, origemId, anun, loc, locdet, locdesde, locprev, status*, dvenda, vvenda, quemrec(A|B), comprador, divis, pcust(0..1)`
**expenses:** `carId*, date*, cat*, desc, valor*, quem*(A|B), obs`
**planned:** `carId*, cat*, desc, valor*, quem(A|B), prazo, status*`
**receipts** (recebimentos de venda): `carId*, label, due*, valor*, status*(Pendente|Recebido), paidAt (obrigatório se Recebido), quem(A|B; vazio = regra do carro), obs`

`placa` é sempre gravada em maiúsculo.

Regras cruzadas: `status = "Vendido"` exige `vvenda`; `origemId` não pode ser o próprio carro; `carId`/`origemId` devem apontar para carro existente e não excluído.

## Item de histórico
```json
{ "id": 12, "ts": "2026-10-18T21:06:41.000Z", "userId": 2, "userName": "Marcos",
  "entity": "expense", "entityId": 5, "label": "Revisão — Fiat Uno 2015", "action": "criou",
  "changes": [ { "f": "Valor", "de": null, "para": "R$ 850,50" } ] }
```
`entity`: car | expense | planned | receipt | settings | user. `action`: criou | editou | moveu | programou | excluiu | restaurou.


## Pagamentos e repasses
- `POST /api/payments` `{receiptId, date, valor, quem?, obs?}` — pagamento (inteiro ou parcial) de uma parcela; `PATCH/DELETE /api/payments/:id`. A parcela vira Recebido quando a soma fecha o valor.
- `POST /api/repasses` `{carId, date, valor, quem?, obs?}` — repasse ao dono de carro consignado (o carro precisa ter `dono`); `PATCH/DELETE /api/repasses/:id`.
- Carros aceitam `dono` e `repasse`; `GET /api/data` devolve também `payments` e `repasses`.
