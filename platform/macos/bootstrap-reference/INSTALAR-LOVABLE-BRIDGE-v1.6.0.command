#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER="$SCRIPT_DIR/payload/install-lovable-bridge.sh"
/bin/chmod +x "$INSTALLER"
/bin/bash "$INSTALLER"
printf '\nPressione Enter para fechar... '
read -r _
