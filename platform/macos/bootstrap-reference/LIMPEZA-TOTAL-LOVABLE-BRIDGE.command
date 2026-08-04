#!/bin/bash
set -euo pipefail
ROOT="$HOME/Library/Application Support/LovableBridgeNative"
printf 'Lovable Bridge - Limpeza total macOS\n\n'
printf 'Esta acao remove a extensao instalada, Companion, ferramentas, configuracoes e perfis locais.\n'
printf 'Os projetos em $HOME/LovableBridgeProjects NAO serao apagados automaticamente.\n\n'
read -r -p 'Digite REMOVER para confirmar: ' answer
[ "$answer" = "REMOVER" ] || { echo 'Cancelado.'; exit 0; }
for dir in \
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" \
  "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts" \
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts" \
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts" \
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"; do
  /bin/rm -f "$dir/com.firmino.lovable_bridge.json"
done
/bin/rm -rf "$ROOT"
echo '[OK] Lovable Bridge removido. Os projetos foram preservados.'
printf '\nPressione Enter para fechar... '
read -r _
