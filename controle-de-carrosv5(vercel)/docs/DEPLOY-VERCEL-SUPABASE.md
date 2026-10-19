# Colocar o Bigodes Car online (Vercel + Supabase)

O app fica em `https://seu-projeto.vercel.app`, abre em qualquer celular, 24 h por dia, sem depender do seu Mac.
A Vercel roda o servidor e o Supabase guarda os dados (PostgreSQL). Tudo no plano gratuito.

> **Antes de começar, leia os "Limites do plano gratuito" no fim deste arquivo.**

## 1. Banco de dados (Supabase)
1. Crie conta em supabase.com e clique em **New project**. Região: **South America (São Paulo)**. Anote a senha do banco.
2. Quando o projeto ficar pronto, clique em **Connect** (no topo) e copie a **Connection string** do modo
   **Transaction pooler** (porta **6543**). Troque `[YOUR-PASSWORD]` pela senha do banco. Ela é assim:
   `postgresql://postgres.abcdefgh:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`
3. Não precisa criar tabelas: o app cria tudo sozinho na primeira abertura.

## 2. Código no GitHub
1. Crie um repositório **privado** no GitHub e envie esta pasta (o `.gitignore` já impede de subir o `.env`, dados e backups).
   Se não quiser usar GitHub, dá para usar a CLI da Vercel (`npm i -g vercel` e depois `vercel` dentro da pasta).

## 3. Servidor (Vercel)
1. Em vercel.com, **Add New > Project**, escolha o repositório. Não mexa em Framework nem em Build Command.
2. Em **Environment Variables**, cadastre:

| Nome | Valor |
| --- | --- |
| `DATABASE_URL` | a connection string do passo 1 |
| `ADMIN_USER` | `brayan` |
| `ADMIN_NAME` | `Brayan` |
| `ADMIN_PASSWORD` | uma senha forte (mínimo 8 caracteres). **Não use `brayan01` na internet.** |
| `PLACA_API_TOKEN` | (opcional) token do serviço pago de consulta por placa |
| `FIPE_TOKEN` | (opcional) token gratuito de fipe.api.br |

3. Clique em **Deploy**. Abra o endereço, entre com o usuário e a senha acima.
4. Depois do primeiro login pode apagar `ADMIN_PASSWORD` das variáveis (ela só serve para criar o primeiro administrador).
   Crie o usuário do Marcos em **Ajustes > Usuários**.
5. (Recomendado) Em **Settings > Functions**, deixe a região em **São Paulo (gru1)**, perto do banco.

O `vercel.json` já manda `/api/*` para a função e serve a tela (pasta `public`). Ele também liga uma chamada diária
(`/api/health`) que mantém o banco do Supabase acordado.

## Rodar no seu computador usando o mesmo banco
Coloque `DATABASE_URL=...` no `.env`, rode `npm install` (instala o pacote `pg`) e `npm start`.
Sem `DATABASE_URL` o app continua usando o arquivo SQLite local, como antes.
Comandos úteis: `npm run migrate` (cria/atualiza tabelas), `npm run user:add -- usuario "Nome" admin` (cria ou redefine usuário),
`npm run backup` (no Postgres gera um `.json` com todas as tabelas em `backups/`).

## Segurança
- O site fica **público na internet**. A proteção é o login (senha com scrypt, bloqueio após 5 erros, cookie HttpOnly/Secure).
  Use senhas fortes e não compartilhe usuário.
- O app fala com o banco direto pela connection string. As tabelas têm RLS ligado sem políticas, então a API pública do Supabase
  (anon key) não consegue ler nada. Nunca publique a connection string.
- O histórico de alterações continua somente de inclusão (gatilhos do banco).

## Limites do plano gratuito (honestos)
- **Vercel Hobby é para uso pessoal/não comercial** nos termos da Vercel. Um negócio de venda de carros é uso comercial; o plano
  que permite isso é o Pro (pago). Decida com isso em mente.
- **Supabase gratuito pausa o projeto após 7 dias sem uso** e não tem backup automático com restauração pontual. A chamada diária
  do `vercel.json` ajuda contra a pausa; mesmo assim rode `npm run backup` de vez em quando (ou use Settings > Database no Supabase).
- Limites de tráfego e de funções existem, mas são muito acima do que dois sócios usam.
- A primeira abertura depois de um tempo parado pode levar 1 a 3 segundos (função "acordando").
- O app no seu Mac (`scripts/instalar-mac.sh`) continua funcionando e é independente da nuvem; os dois bancos não se misturam.
