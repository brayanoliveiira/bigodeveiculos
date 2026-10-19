# Operação: instalar, publicar, manter

## Requisitos
- **Node.js 22.13 ou mais novo** (usa o SQLite embutido, `node:sqlite`). Nenhum `npm install` é necessário: o projeto não tem dependências.
- Um lugar onde o app fique ligado 24h se vocês dois forem usar de aparelhos diferentes (um VPS barato, um mini-PC em casa, ou um serviço que rode Docker).

## Rodar no seu computador (teste)
```bash
ADMIN_USER=brayan ADMIN_PASSWORD='uma-senha-forte' ADMIN_NAME=Brayan npm start
# abra http://localhost:3000
```
O primeiro administrador é criado automaticamente na primeira execução. Dentro do app, em **Ajustes → Usuários**, crie o usuário do Marcos.

Se esquecer a senha e não tiver outro administrador:
```bash
npm run user:add -- brayan "Brayan" admin NovaSenha123   # redefine a senha se o usuário já existe
```
Sem a senha no final, o script gera uma aleatória e mostra na tela.

## Com Docker
```bash
cp .env.example .env     # edite ADMIN_*, COOKIE_SECURE etc.
docker compose up -d --build
```
O banco fica no volume `controle-data` (arquivo `/data/controle.db`).

## Publicar na internet com segurança
O app tem login, mas **sempre coloque HTTPS na frente**: sem isso, a senha trafega aberta.
1. Aponte um domínio para o servidor e use um proxy reverso que faça o HTTPS sozinho. Exemplo com **Caddy** (`Caddyfile`):
   ```
   carros.seudominio.com.br {
       reverse_proxy localhost:3000
   }
   ```
2. No `.env`: `COOKIE_SECURE=true` e `TRUST_PROXY=true`.
3. Alternativa sem abrir portas: **Cloudflare Tunnel** ou **Tailscale** (só vocês dois enxergam o app).

## Rodar como serviço (sem Docker, Linux)
`/etc/systemd/system/controle-de-carros.service`:
```ini
[Unit]
Description=Controle de Carros
After=network.target

[Service]
WorkingDirectory=/opt/controle-de-carros
EnvironmentFile=/opt/controle-de-carros/.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server/index.js
Restart=always
User=controle

[Install]
WantedBy=multi-user.target
```
`sudo systemctl enable --now controle-de-carros`

## Rodar sempre no Mac (com Tailscale)
Dentro da pasta do projeto: `bash scripts/instalar-mac.sh`. Ele cria o `.env` (se não existir), instala o serviço no launchd
(liga ao entrar no Mac, reinicia se cair), usa a porta 80 (endereço sem `:3000`), agenda backup diário às 03:00 e
impede o Mac de dormir na tomada. Log: `~/Library/Logs/controle-de-carros.log`. Remover: `bash scripts/instalar-mac.sh --remover`.
Para um endereço bonito, renomeie a máquina no Tailscale (login.tailscale.com/admin/machines) para `bigodeveiculos`.

## FIPE grátis (marca > modelo > ano)
No cadastro do carro, **Buscar valor na tabela FIPE (grátis)** deixa escolher marca, modelo (com filtro por texto) e ano, e preenche
valor FIPE, referência, nome e ano. Usa a API pública fipe.parallelum.com.br (v2; se ela cair, o app tenta sozinho a v1 da mesma tabela): sem cadastro, 500 consultas por dia; com
`FIPE_TOKEN` gratuito (fipe.api.br/register), 1.000 por dia. O app guarda as respostas em cache (listas 7 dias, preços 2 dias).
Não existe API gratuita e legítima que descubra o carro **pela placa**: o Sinesp Cidadão foi encerrado e os sites de "placa FIPE"
são formulários, não APIs. Por isso a consulta por placa abaixo é opcional e paga.

## Consulta por placa grátis (APIBrasil, 100/dia)
O serviço gratuito antigo (placa-fipe.apibrasil.com.br) saiu do ar. A opção grátis que existe hoje é o plano gratuito da APIBrasil
(100 consultas por dia), que exige uma conta sua (o token não dá para gerar sozinho):
1. Crie conta em app.apibrasil.io. 2. Em **Minhas APIs** abra **API Placa Dados** e copie o **BearerToken** e o **DeviceToken**.
3. Cadastre `APIBRASIL_BEARER` e `APIBRASIL_DEVICE_TOKEN` (no `.env`, ou em Settings > Environment Variables na Vercel) e reimplante/reinicie.
O app chama `POST https://gateway.apibrasil.io/api/v2/vehicles/dados` e `/vehicles/fipe`. Sem esses tokens, use a busca marca > modelo > ano (grátis, sem conta).
`PLACA_API_TOKEN` (serviço pago) tem prioridade se existir.

## Consulta de placa e FIPE (opcional, paga)
No cadastro do carro, o botão **Consultar placa e FIPE** preenche modelo, ano, cor e valor FIPE a partir da placa.
Não existe fonte pública e gratuita que ligue placa a dados do carro, então o app usa um serviço pago de terceiros
(padrão: apiplacas.com.br, `GET https://wdapi2.com.br/consulta/{placa}/{token}`).
1. Contrate o serviço e copie o token. 2. Coloque no `.env`: `PLACA_API_TOKEN=seu-token`. 3. Reinicie o app
(`launchctl kickstart -k gui/$(id -u)/br.com.bigodeveiculos.app` no Mac).
- O token fica só no servidor; o navegador nunca o vê.
- Cada consulta é cobrada: o resultado fica guardado 30 dias (tabela `placa_cache`) e há limite de 30 consultas por hora por usuário.
- Quando a resposta traz várias versões parecidas do carro, a tela deixa escolher qual valor FIPE usar.
- Outro provedor: `PLACA_API_URL` troca o endereço, mas o formato da resposta precisa ser o mesmo; senão ajuste `server/placa.js` (função `normalize`).
- Valor FIPE e referência também podem ser digitados à mão, com ou sem token.

## Backup (faça!)
- **Cópia consistente com o app ligado:** `npm run backup` → cria `backups/controle-AAAAMMDD-HHMMSS.db` e mantém as 30 mais recentes (`BACKUP_KEEP`).
- Agende (cron): `0 3 * * * cd /opt/controle-de-carros && npm run backup`. Depois copie a pasta `backups/` para outro lugar (nuvem, outro computador).
- Em Docker: `docker compose exec controle node scripts/backup.js` (com `BACKUP_DIR=/data/backups`), ou copie o volume.
- Dentro do app, **Ajustes → Baixar cópia dos dados (JSON)** exporta carros, gastos, previstos e histórico em texto legível.
- **Restaurar:** pare o app, troque `data/controle.db` pelo arquivo da cópia (apague também `controle.db-wal` e `controle.db-shm` se existirem) e inicie de novo.

## Atualizar o app
1. Faça backup.
2. Substitua os arquivos (mantendo `data/` e `.env`) e reinicie. As mudanças de banco rodam sozinhas ao iniciar (`server/migrations/*.sql`, aplicadas uma vez, em ordem).

## Variáveis de ambiente
Veja `.env.example`. Resumo: `PORT`, `HOST`, `DB_PATH`, `ADMIN_USER/ADMIN_PASSWORD/ADMIN_NAME` (só na 1ª execução), `COOKIE_SECURE`, `TRUST_PROXY`, `SESSION_DAYS`, `BACKUP_KEEP`, `BACKUP_DIR`.

## Segurança: o que já está feito e o que depende de você
Já feito: senhas com scrypt, sessão em cookie HttpOnly/SameSite, só o hash da sessão fica no banco, bloqueio de 5 min após 5 senhas erradas, proteção contra CSRF, cabeçalhos de segurança (CSP etc.), perfis (administrador, membro, só leitura), histórico impossível de alterar/apagar mesmo por SQL do próprio app (gatilhos no banco).
Depende de você: HTTPS, backups, senhas fortes, quem tem acesso ao servidor e ao arquivo do banco (quem tem o arquivo lê tudo e pode alterá-lo por fora do app; o histórico dentro do arquivo não é à prova de quem tem acesso total ao servidor).

## Problemas comuns
| Sintoma | Causa provável |
|---|---|
| `Cannot find module 'node:sqlite'` | Node antigo. Instale Node 22.13+. |
| Aviso "SQLite is an experimental feature" | Normal; o `npm start` já o silencia. |
| Não consegue entrar logo após erros | Bloqueio de 5 min por IP+usuário. Espere. |
| Atrás de proxy, todos têm o mesmo IP | Faltou `TRUST_PROXY=true`. |
| Login "não pega" em HTTPS | Faltou `COOKIE_SECURE=true`? (o inverso, `true` em HTTP puro, também impede o login) |


## Carro consignado (de terceiro)
No cadastro do carro, preencha **Dono do carro** e **Repasse mínimo ao dono**. Nesse caso ninguém "comprou" o carro: o custo é o
repasse + os gastos que vocês tiveram, e a **comissão** = valor da venda − repasse − gastos. O investimento de cada sócio conta só os gastos.
No cartão do carro, **Repasses** registra cada pagamento feito ao dono (data, valor, quem pagou) e mostra quanto ainda falta repassar.
O Resumo avisa "A repassar a donos" e o relatório **Consignados** lista tudo. Para a comissão ficar só com um sócio, use divisão
"Personalizado" com 100% para ele.

### Consignado vendido com carro na troca
Se o cliente paga com dinheiro + um carro e **o carro de troca fica com o dono** do consignado: cadastre o carro de troca com o **mesmo Dono**,
**sem repasse**, em **Veio de troca em qual carro nosso?** escolha o consignado vendido e em **Valor de entrada** coloque o valor da troca.
Esse carro não conta como estoque nem investimento de vocês; o valor dele abate o repasse ("Pago em carro") e o que falta repassar é só em dinheiro.
A comissão continua sendo venda total − repasse − gastos. Se vocês ficarem com o carro de troca, cadastre-o normalmente (sem Dono).

## Pagamento parcial de parcela
Em **Recebimentos**, **Receber** registra quanto o cliente pagou e em que dia (tudo ou parte). O que faltar continua em aberto e
fica "Atrasado" se passar do vencimento. A parcela vira "Recebido" quando a soma dos pagamentos fecha o valor. Cada pagamento
pode ser editado ou excluído. Se o cliente pagou a mais (juros/multa), edite o valor da parcela antes.

## Configuração pronta (.env)
O app lê o `.env` da pasta sozinho (`npm start` já basta). A consulta **por placa** é a única que exige token pago
(`PLACA_API_TOKEN`); o token só é emitido pelo provedor depois de um cadastro, então não há como o app gerá-lo sozinho.
A busca por marca/modelo/ano na tabela FIPE funciona sem nenhum token.
