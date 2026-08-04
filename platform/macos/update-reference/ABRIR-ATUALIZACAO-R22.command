#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UPDATER="$SCRIPT_DIR/apply-r22-macos.sh"
LOG="$HOME/Desktop/LovableBridge-R22-Update.log"

clear
printf 'Lovable Bridge R22 - Atualizacao cumulativa para macOS\n\n'
printf 'A janela permanecera aberta mesmo se ocorrer algum erro.\n'
printf 'Log: %s\n\n' "$LOG"

/usr/bin/xattr -dr com.apple.quarantine "$SCRIPT_DIR" >/dev/null 2>&1 || true
/bin/chmod +x "$UPDATER" "$0" >/dev/null 2>&1 || true

if [ ! -f "$UPDATER" ]; then
  printf 'ERRO: O atualizador nao foi encontrado. Extraia o ZIP inteiro antes de executar.\n' | /usr/bin/tee "$LOG"
  STATUS=1
else
  /bin/bash "$UPDATER" 2>&1 | /usr/bin/tee "$LOG"
  STATUS=${PIPESTATUS[0]}
fi

printf '\n'
if [ "$STATUS" -eq 0 ]; then
  printf '\033[32mAtualizacao R22 concluida com sucesso.\033[0m\n'
  /usr/bin/osascript -e 'display notification "Atualizacao R22 concluida" with title "Lovable Bridge"' >/dev/null 2>&1 || true
else
  printf '\033[31mA atualizacao encontrou um erro. O log foi salvo na Mesa.\033[0m\n'
  /usr/bin/osascript -e 'display dialog "A atualizacao encontrou um erro. O arquivo LovableBridge-R22-Update.log foi salvo na Mesa." with title "Lovable Bridge" buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1 || true
fi

printf '\nPressione Enter para fechar esta janela... '
read -r _
exit "$STATUS"
