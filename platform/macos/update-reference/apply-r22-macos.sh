#!/bin/bash
set -u

RELEASE="R22-macOS"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_HOST="$SCRIPT_DIR/payload/host/host.js"
SOURCE_SIDEPANEL="$SCRIPT_DIR/payload/extension/sidepanel.js"
SOURCE_SELECTOR="$SCRIPT_DIR/payload/extension/preview-selector.js"
SOURCE_SELECTOR_CSS="$SCRIPT_DIR/payload/extension/preview-selector.css"

ok(){ printf '\033[32m[OK] %s\033[0m\n' "$1"; }
info(){ printf '\033[36m[INFO] %s\033[0m\n' "$1"; }
warn(){ printf '\033[33m[AVISO] %s\033[0m\n' "$1"; }
fail(){ printf '\n\033[31mERRO: %s\033[0m\n' "$1" >&2; return 1; }

find_install_root(){
  local candidate
  for candidate in \
    "$HOME/Library/Application Support/LovableBridgeNative" \
    "$HOME/Library/Application Support/Lovable Bridge Native" \
    "$HOME/.lovable-bridge-native"; do
    if [ -d "$candidate" ]; then printf '%s\n' "$candidate"; return 0; fi
  done
  return 1
}

find_first_file(){
  local candidate
  for candidate in "$@"; do
    if [ -f "$candidate" ]; then printf '%s\n' "$candidate"; return 0; fi
  done
  return 1
}

find_first_executable(){
  local candidate
  for candidate in "$@"; do
    if [ -x "$candidate" ]; then printf '%s\n' "$candidate"; return 0; fi
  done
  return 1
}

find_extension_dir(){
  local root="$1" candidate
  for candidate in "$root/Extension" "$root/extension" "$root/ChromeExtension" "$root/App/Extension"; do
    if [ -f "$candidate/manifest.json" ] && [ -f "$candidate/sidepanel.js" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  candidate="$(/usr/bin/find "$root" -maxdepth 6 -type f -name manifest.json -print 2>/dev/null | /usr/bin/head -n 1)"
  if [ -n "$candidate" ]; then
    candidate="$(dirname "$candidate")"
    if [ -f "$candidate/sidepanel.js" ]; then printf '%s\n' "$candidate"; return 0; fi
  fi
  return 1
}

sha256_file(){
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    /usr/bin/openssl dgst -sha256 "$1" | awk '{print $NF}'
  fi
}

copy_verified(){
  local source="$1" target="$2" source_hash target_hash
  /bin/mkdir -p "$(dirname "$target")" || return 1
  /bin/cp "$source" "$target" || return 1
  source_hash="$(sha256_file "$source")"
  target_hash="$(sha256_file "$target")"
  [ "$source_hash" = "$target_hash" ] || return 1
}

main(){
  printf '\033[36m============================================================\n'
  printf ' Lovable Bridge v1.6.0 - Atualizacao macOS R22\n'
  printf ' Language, Smart Routing and Technical Operations\n'
  printf '============================================================\033[0m\n\n'
  printf 'Esta atualizacao NAO baixa nem reinstala ferramentas.\n'
  printf 'Perfis, projetos, logins, chaves e alteracoes pendentes serao preservados.\n\n'

  /usr/bin/xattr -dr com.apple.quarantine "$SCRIPT_DIR" >/dev/null 2>&1 || true

  local source
  for source in "$SOURCE_HOST" "$SOURCE_SIDEPANEL" "$SOURCE_SELECTOR" "$SOURCE_SELECTOR_CSS"; do
    [ -f "$source" ] || { fail "Arquivo do payload ausente: $source. Extraia o ZIP inteiro."; return 1; }
  done

  local install_root host_target settings_path extension_dir node_exe
  install_root="$(find_install_root)" || { fail "A instalacao existente do Lovable Bridge nao foi localizada."; return 1; }
  info "Instalacao localizada em: $install_root"

  host_target="$(find_first_file \
    "$install_root/Host/host.js" \
    "$install_root/host/host.js" \
    "$install_root/Companion/host.js")" || { fail "host.js instalado nao localizado."; return 1; }

  settings_path="$(find_first_file \
    "$install_root/Config/settings.json" \
    "$install_root/config/settings.json" \
    "$install_root/settings.json")" || { fail "settings.json instalado nao localizado."; return 1; }

  extension_dir="$(find_extension_dir "$install_root")" || { fail "Pasta instalada da extensao nao localizada."; return 1; }

  node_exe="$(find_first_executable \
    "$install_root/Tools/Node/bin/node" \
    "$install_root/tools/node/bin/node" \
    "$install_root/Node/bin/node")" || true
  if [ -z "${node_exe:-}" ] && command -v node >/dev/null 2>&1; then node_exe="$(command -v node)"; fi
  [ -n "${node_exe:-}" ] || { fail "Node.js da instalacao nao localizado."; return 1; }

  info "Validando os arquivos R22..."
  "$node_exe" --check "$SOURCE_HOST" >/dev/null 2>&1 || { fail "host.js R22 invalido."; return 1; }
  "$node_exe" --check "$SOURCE_SIDEPANEL" >/dev/null 2>&1 || { fail "sidepanel.js R22 invalido."; return 1; }
  "$node_exe" --check "$SOURCE_SELECTOR" >/dev/null 2>&1 || { fail "preview-selector.js R22 invalido."; return 1; }

  local stamp backup_dir
  stamp="$(date -u +%Y%m%d%H%M%S)"
  backup_dir="$install_root/Backups/R22-macOS-$stamp"
  /bin/mkdir -p "$backup_dir" || { fail "Nao foi possivel criar o backup."; return 1; }

  /bin/cp "$host_target" "$backup_dir/host-before-R22.js" || { fail "Nao foi possivel salvar o host anterior."; return 1; }
  local name
  for name in sidepanel.js preview-selector.js preview-selector.css; do
    [ -f "$extension_dir/$name" ] && /bin/cp "$extension_dir/$name" "$backup_dir/$name.before-R22" || true
  done
  /bin/cp "$settings_path" "$backup_dir/settings-before-R22.json" || { fail "Nao foi possivel salvar as configuracoes anteriores."; return 1; }
  ok "Backup criado em: $backup_dir"

  copy_verified "$SOURCE_HOST" "$host_target" || { fail "Nao foi possivel atualizar o Companion com verificacao SHA-256."; return 1; }
  copy_verified "$SOURCE_SIDEPANEL" "$extension_dir/sidepanel.js" || { fail "Nao foi possivel atualizar o painel."; return 1; }
  copy_verified "$SOURCE_SELECTOR" "$extension_dir/preview-selector.js" || { fail "Nao foi possivel atualizar o seletor visual."; return 1; }
  copy_verified "$SOURCE_SELECTOR_CSS" "$extension_dir/preview-selector.css" || { fail "Nao foi possivel atualizar o estilo do seletor visual."; return 1; }

  "$node_exe" --check "$host_target" >/dev/null 2>&1 || { fail "Companion instalado invalido. Use o backup: $backup_dir"; return 1; }
  "$node_exe" --check "$extension_dir/sidepanel.js" >/dev/null 2>&1 || { fail "Painel instalado invalido. Use o backup: $backup_dir"; return 1; }
  "$node_exe" --check "$extension_dir/preview-selector.js" >/dev/null 2>&1 || { fail "Seletor instalado invalido. Use o backup: $backup_dir"; return 1; }

  "$node_exe" - "$settings_path" "$RELEASE" <<'NODE'
const fs=require('fs');
const [settingsPath,release]=process.argv.slice(2);
const settings=JSON.parse(fs.readFileSync(settingsPath,'utf8'));
settings.release=settings.release&&typeof settings.release==='object'?settings.release:{};
settings.release.hotfix=release;
settings.release.updatedAt=new Date().toISOString();
fs.writeFileSync(settingsPath,JSON.stringify(settings,null,2),'utf8');
NODE
  [ $? -eq 0 ] || { fail "Nao foi possivel registrar a versao R22."; return 1; }

  cat > "$backup_dir/applied-r22-macos.json" <<EOF
{
  "release":"$RELEASE",
  "appliedAtUtc":"$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "installRoot":"$(printf '%s' "$install_root" | sed 's/"/\\"/g')",
  "extensionDirectory":"$(printf '%s' "$extension_dir" | sed 's/"/\\"/g')",
  "backupDirectory":"$(printf '%s' "$backup_dir" | sed 's/"/\\"/g')"
}
EOF

  printf '\n\033[32m============================================================\n'
  printf ' ATUALIZACAO R22 CONCLUIDA\n'
  printf '============================================================\033[0m\n\n'
  printf 'Agora abra chrome://extensions e clique em Recarregar.\n'
  printf 'Depois feche e abra novamente o painel do Lovable Bridge.\n'
  printf 'Status esperado: Companion 1.6.0 R22 connected/conectado.\n'
  printf 'Backup: %s\n' "$backup_dir"
  return 0
}

main "$@"
exit $?
