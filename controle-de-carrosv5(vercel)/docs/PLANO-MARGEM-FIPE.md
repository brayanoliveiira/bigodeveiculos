# Plano: margem projetada sobre a FIPE com custo completo

Objetivo: para cada carro, ver em um só lugar **quanto vou ganhar**, usando a FIPE como referência de preço e somando **tudo o que já gastei e ainda vou gastar**.

## 1. Como está hoje (`public/js/calc.js`)

| Valor | Fórmula atual |
|---|---|
| `custo` | entrada (ou repasse, se consignado) + gastos lançados |
| `prev` | previstos com status `Pendente` |
| `pmin` (zero a zero) | `custo + prev` |
| `pmeta` | `pmin × (1 + meta)` |
| `proj` | `anúncio − pmin` (só se houver preço de anúncio) |
| `margem` | `lucro / custo`, **só depois da venda** |

A FIPE (`cars.fipe`) só aparece como texto ("compra a 78% da FIPE", em `views.js:fipeNote`). Ela não entra em nenhum cálculo.

### O que falta para a visão completa

1. A FIPE não é base de projeção.
2. Custos de venda (comissão, transferência, garantia) só contam se alguém lançar um previsto.
3. Custos fixos da operação (pátio, plano de anúncio, contador) não existem no sistema. Todo gasto precisa de um carro.
4. O tempo parado não custa nada no cálculo: capital parado, queda da FIPE, IPVA proporcional.
5. A FIPE fica congelada no dia do cadastro.
6. A margem só existe depois da venda. Não há margem projetada para o estoque.

## 2. Modelo proposto

```
Custo total projetado (CTP) =
    compra (entrada ou repasse)
  + gastos realizados
  + previstos pendentes
  + custos de venda estimados          (fase 2)
  + rateio de custos fixos             (fase 3)
  + custo do tempo em estoque          (fase 4, opcional)

Preço esperado   = FIPE × fator de venda   (ex.: 100% da FIPE; configurável)
Lucro projetado  = Preço esperado − CTP
Margem s/ FIPE   = Lucro projetado / FIPE
Margem s/ custo  = Lucro projetado / CTP   (mesma base da meta atual)
Teto de compra   = Preço esperado − (CTP sem a compra) − lucro da meta
```

Regras:

- Sem FIPE, a base cai para o preço de anúncio. Sem nenhum dos dois, o carro mostra "sem base de projeção".
- Carro vendido: margem **real** (como hoje) e, ao lado, "% da FIPE vendido" (`vvenda / fipe`).
- Na venda, custos estimados (fase 2) saem e só os gastos reais lançados contam.
- Consignado: compra = repasse ao dono; a "margem" é a comissão projetada.
- O fator de venda pode vir do histórico: média de `vvenda / fipe` dos carros vendidos.

## 3. Fases

### Fase 1: margem projetada sobre a FIPE (sem mudança de banco)

- `calc.js`: novos campos `d.ctp`, `d.precoEsperado`, `d.lucroProj`, `d.margemFipe`, `d.margemCustoProj`, `d.tetoCompra`, `d.pctFipeVenda`.
- Ajustes: novo parâmetro `fatorFipe` (padrão 1,00) ao lado da meta de margem. Validação em `services.js`, igual à da `meta`.
- Ficha do carro (`views.js`): bloco "Visão completa" com CTP item a item, preço esperado, lucro e as duas margens. Cor vermelha quando abaixo da meta.
- Resumo: KPI "Lucro projetado do estoque (base FIPE)".
- Testes em `tests/calc.test.js`: carro com FIPE, sem FIPE, consignado, vendido.

### Fase 2: custos de venda estimados

- Ajustes: comissão de venda (% do preço), transferência/despachante (R$), garantia/reserva (R$).
- Cada carro pode sobrescrever esses valores.
- Migration nova em `server/migrations/` **e** `server/migrations-pg/`.
- Entram no CTP enquanto o carro não foi vendido.

### Fase 3: custos fixos da operação

- Nova entidade `overheads` (data, categoria, descrição, valor, quem pagou), sem carro.
- Rateio entre os carros em estoque, por **carro-dia** (quem fica mais tempo paga mais).
- Migrations nas duas pastas, campo em `schema.js`, aba ou seção em "Gastos".
- Relatório: margem bruta (sem fixos) e margem líquida (com fixos).

### Fase 4: custo do tempo (opcional)

- Ajustes: custo do capital (% ao mês sobre o investido) e queda da FIPE (% ao mês).
- Projeção com o prazo médio de venda do histórico (`diasMedio`).
- Mostra "cada mês parado custa R$ X".

### Fase 5: FIPE atualizada

- Botão "Atualizar FIPE do estoque", usando a FIPE gratuita (`server/fipe.js`, com cache) pelo código guardado em `fipeRef`.
- Tabela `fipe_hist` (carro, data, valor) para ver a variação.
- Não usar a consulta de placa paga para isso.

### Fase 6: simulador de compra

- No cadastro de carro novo: FIPE + gastos estimados + meta resultam em "pague no máximo R$ X".

### Fase 7: relatórios no Gerencial

- Margem projetada × real por carro vendido.
- % médio da FIPE na compra e na venda.
- Lista de carros abaixo da meta.

## 4. Decisões em aberto

1. A meta de margem continua sobre o custo, ou passa a ser sobre a FIPE?
2. Fator de venda: fixo (ex.: 100% da FIPE) ou média do histórico?
3. Rateio de custos fixos: por carro-dia ou igual por carro?
4. Entra o custo do capital parado (fase 4)?
