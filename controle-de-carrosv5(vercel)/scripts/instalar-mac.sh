#!/usr/bin/env bash
# Instala o Controle de Carros como serviço no macOS (launchd):
#   - liga sozinho quando você entra no Mac e reinicia se cair;
#   - usa a porta 80 (endereço sem ":3000");
#   - faz backup automático todo dia às 03:00.
#
# Uso (dentro da pasta do projeto):
#   bash scripts/instalar-mac.sh            instala / atualiza
#   bash scripts/instalar-mac.sh --remover  desinstala o serviço (os dados ficam)
set -euo pipefail

LABEL="br.com.bigodeveiculos.app"
LABEL_BKP="br.com.bigodeveiculos.backup"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
PLIST="$AGENTS/$LABEL.plist"
PLIST_BKP="$AGENTS/$LABEL_BKP.plist"
LOG="$HOME/Library/Logs/controle-de-carros.log"
UID_N="$(id -u)"

if [ "$(uname -s)" != "Darwin" ]; then echo "Este script é só para macOS."; exit 1; fi

descarregar() {
  launchctl bootout "gui/$UID_N" "$1" 2>/dev/null || true
}

if [ "${1:-}" = "--remover" ]; then
  descarregar "$PLIST"; descarregar "$PLIST_BKP"
  rm -f "$PLIST" "$PLIST_BKP"
  echo "Serviço removido. Seus dados continuam em $DIR/data."
  exit 0
fi

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then echo "Node não encontrado. Instale o Node 22 em nodejs.org e rode de novo."; exit 1; fi
if ! "$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  echo "Node muito antigo ($("$NODE" --version)). Precisa ser v22.13 ou mais novo."; exit 1
fi

# ---- .env (só cria se não existir) ----
if [ ! -f "$DIR/.env" ]; then
  echo "Vamos criar o acesso de administrador."
  read -r -p "Seu usuário [brayan]: " AU; AU="${AU:-brayan}"
  read -r -p "Seu nome [Brayan]: " AN; AN="${AN:-Brayan}"
  while true; do
    read -r -s -p "Senha (mínimo 8 caracteres): " AP; echo
    [ "${#AP}" -ge 8 ] && break
    echo "Muito curta, tente de novo."
  done
  read -r -p "Token da consulta de placa/FIPE (Enter para pular e colocar depois): " PT
  umask 077
  cat > "$DIR/.env" <<EOF
ADMIN_USER=$AU
ADMIN_NAME=$AN
ADMIN_PASSWORD=$AP
PORT=80
HOST=0.0.0.0
COOKIE_SECURE=false
TRUST_PROXY=false
PLACA_API_TOKEN=${PT:-}
EOF
  echo ".env criado."
else
  echo ".env já existe, mantido. (Confira se tem PORT=80.)"
fi

mkdir -p "$AGENTS" "$(dirname "$LOG")" "$DIR/data" "$DIR/backups"

# ---- serviço principal ----
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string>
    <string>--env-file=$DIR/.env</string>
    <string>--disable-warning=ExperimentalWarning</string>
    <string>$DIR/server/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF

# ---- backup diário às 03:00 ----
cat > "$PLIST_BKP" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL_BKP</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string>
    <string>--env-file=$DIR/.env</string>
    <string>--disable-warning=ExperimentalWarning</string>
    <string>$DIR/scripts/backup.js</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF

descarregar "$PLIST"; descarregar "$PLIST_BKP"
launchctl bootstrap "gui/$UID_N" "$PLIST"
launchctl bootstrap "gui/$UID_N" "$PLIST_BKP"
launchctl enable "gui/$UID_N/$LABEL" || true

# ---- Mac não pode dormir (na tomada) ----
echo
echo "Agora vou impedir o Mac de dormir quando estiver na tomada (pede sua senha do Mac)."
sudo pmset -c sleep 0 || echo "Não consegui ajustar; faça em Ajustes do Sistema > Bateria/Energia."
sudo pmset -a autorestart 1 || true

sleep 2
if curl -fsS "http://localhost/api/health" >/dev/null 2>&1; then
  echo
  echo "OK! O app está rodando: http://localhost"
else
  echo
  echo "O serviço foi instalado, mas não respondeu ainda. Veja o log:  tail -n 30 $LOG"
fi
echo "Log: $LOG"
