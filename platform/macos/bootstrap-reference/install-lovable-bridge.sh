#!/bin/bash
set -euo pipefail

VERSION="1.6.0"
RELEASE="R13-macOS"
NATIVE_HOST_NAME="com.firmino.lovable_bridge"
EXTENSION_ID="jfnajhhcpdepijomgiiiflmphgcohmgm"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_HOST="$SCRIPT_DIR/host"
SOURCE_EXTENSION="$SCRIPT_DIR/extension"
INSTALL_ROOT="$HOME/Library/Application Support/LovableBridgeNative"
TOOLS_ROOT="$INSTALL_ROOT/Tools"
HOST_ROOT="$INSTALL_ROOT/Host"
EXTENSION_ROOT="$INSTALL_ROOT/Extension"
CONFIG_ROOT="$INSTALL_ROOT/Config"
TEMP_ROOT="$INSTALL_ROOT/Temp/Installer"
PROFILES_ROOT="$INSTALL_ROOT/Profiles"
PROJECTS_ROOT="$HOME/LovableBridgeProjects"
HELPERS_ROOT="$INSTALL_ROOT/Helpers"
LOG_ROOT="$INSTALL_ROOT/Logs"
SETTINGS_PATH="$CONFIG_ROOT/settings.json"
INSTALL_LOG="$LOG_ROOT/install-v1.6.0-macos.log"

mkdir -p "$LOG_ROOT"
exec > >(tee -a "$INSTALL_LOG") 2>&1

step() { printf '\n\033[36m==> %s\033[0m\n' "$1" >&2; }
ok() { printf '\033[32m[OK] %s\033[0m\n' "$1" >&2; }
info() { printf '\033[33m[INFO] %s\033[0m\n' "$1" >&2; }
fail() { printf '\n\033[31mERRO: %s\033[0m\n' "$1" >&2; printf 'Log: %s\n' "$INSTALL_LOG" >&2; exit 1; }
ensure_dir() { /bin/mkdir -p "$1"; }
download() {
  local url="$1" destination="$2"
  ensure_dir "$(dirname "$destination")"
  /usr/bin/curl -fL --connect-timeout 25 --retry 3 --retry-delay 2 -A "LovableBridge-macOS-Installer" "$url" -o "$destination"
  [ -s "$destination" ] || fail "O download nao foi concluido: $url"
}

ARCH="$(/usr/bin/uname -m)"
case "$ARCH" in
  arm64)
    NODE_ARCH="arm64"; GH_ARCH="arm64"; BUN_ARCH="aarch64"
    CODEX_PATTERN='^codex-aarch64-apple-darwin\.tar\.gz$'
    OPENCODE_PATTERN='^opencode-darwin-arm64\.zip$'
    RIPGREP_PATTERN='^ripgrep-[0-9.]+-aarch64-apple-darwin\.tar\.gz$'
    ;;
  x86_64)
    NODE_ARCH="x64"; GH_ARCH="amd64"; BUN_ARCH="x64"
    CODEX_PATTERN='^codex-x86_64-apple-darwin\.tar\.gz$'
    OPENCODE_PATTERN='^opencode-darwin-x64\.zip$'
    RIPGREP_PATTERN='^ripgrep-[0-9.]+-x86_64-apple-darwin\.tar\.gz$'
    ;;
  *) fail "Arquitetura do Mac nao suportada: $ARCH" ;;
esac

for dir in "$INSTALL_ROOT" "$TOOLS_ROOT" "$HOST_ROOT" "$EXTENSION_ROOT" "$CONFIG_ROOT" "$TEMP_ROOT" "$PROFILES_ROOT" "$PROJECTS_ROOT" "$HELPERS_ROOT"; do
  ensure_dir "$dir"
done

printf '\033[36m============================================================\n'
printf ' Lovable Bridge v1.6.0 R13 - Instalacao completa macOS\n'
printf '============================================================\033[0m\n\n'
printf 'Arquitetura detectada: %s\n' "$ARCH"
printf 'O instalador prepara extensao, Companion, Codex, Antigravity, OpenCode, Ripgrep, Bun e GitHub CLI.\n'
printf 'Nenhum projeto sera apagado ou enviado durante a instalacao.\n'

install_node() {
  local root="$TOOLS_ROOT/Node" node="$TOOLS_ROOT/Node/bin/node"
  if [ -x "$node" ] && "$node" --version >/dev/null 2>&1; then ok "Node.js ja esta pronto"; printf '%s\n' "$node"; return; fi
  step "Instalando Node.js LTS portatil"
  local version archive stage extracted
  version="$(/usr/bin/curl -fsSL https://nodejs.org/dist/index.tab | /usr/bin/awk -F '\t' 'NR > 1 && $10 != "-" && $10 != "" { print $1; exit }')"
  [ -n "$version" ] || fail "Nao foi encontrada uma versao LTS do Node.js."
  archive="$TEMP_ROOT/node-$version.tar.gz"
  download "https://nodejs.org/dist/$version/node-$version-darwin-$NODE_ARCH.tar.gz" "$archive"
  stage="$TEMP_ROOT/node-extract"; /bin/rm -rf "$root" "$stage"; ensure_dir "$stage"
  /usr/bin/tar -xzf "$archive" -C "$stage"
  extracted="$(/usr/bin/find "$stage" -mindepth 1 -maxdepth 1 -type d | /usr/bin/head -n 1)"
  [ -n "$extracted" ] || fail "O pacote do Node.js nao foi extraido."
  /bin/mv "$extracted" "$root"
  "$node" --version >/dev/null 2>&1 || fail "Node.js foi instalado, mas nao iniciou."
  ok "Node.js $version"; printf '%s\n' "$node"
}

NODE_EXE="$(install_node | /usr/bin/tail -n 1)"
NODE_ROOT="$(dirname "$(dirname "$NODE_EXE")")"
NPM_EXE="$NODE_ROOT/bin/npm"
export PATH="$NODE_ROOT/bin:$TOOLS_ROOT/Ripgrep:$TOOLS_ROOT/OpenCode:$TOOLS_ROOT/Codex:$TOOLS_ROOT/AntigravityCLI:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

get_github_asset() {
  local repository="$1" pattern="$2" json="$TEMP_ROOT/release-$(echo "$repository" | tr '/' '-').json"
  /usr/bin/curl -fsSL -H "User-Agent: LovableBridge-Installer" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$repository/releases/latest" -o "$json"
  "$NODE_EXE" - "$json" "$pattern" <<'NODE'
const fs = require('fs');
const [file, pattern] = process.argv.slice(2);
const release = JSON.parse(fs.readFileSync(file, 'utf8'));
const rx = new RegExp(pattern);
const asset = (release.assets || []).find((item) => rx.test(item.name));
if (!asset) process.exit(2);
process.stdout.write(asset.browser_download_url + '\n' + asset.name);
NODE
}

install_git() {
  step "Verificando Git"
  if /usr/bin/xcode-select -p >/dev/null 2>&1 && /usr/bin/git --version >/dev/null 2>&1; then
    ok "Git das Command Line Tools esta pronto"; printf '%s\n' "/usr/bin/git"; return
  fi
  info "O macOS abrira a instalacao oficial das Command Line Tools da Apple."
  /usr/bin/xcode-select --install >/dev/null 2>&1 || true
  fail "Conclua a instalacao das Command Line Tools e execute este instalador novamente. Essa etapa e controlada pelo macOS."
}

install_zip_asset() {
  local repo="$1" pattern="$2" target="$3" wanted="$4" label="$5"
  local result url name archive stage extracted
  result="$(get_github_asset "$repo" "$pattern")" || fail "Nao foi encontrado o pacote de $label compativel com este Mac."
  url="$(printf '%s\n' "$result" | /usr/bin/head -n 1)"; name="$(printf '%s\n' "$result" | /usr/bin/tail -n 1)"
  archive="$TEMP_ROOT/$name"; download "$url" "$archive"
  stage="$TEMP_ROOT/extract-$(echo "$label" | tr ' ' '-')"; /bin/rm -rf "$stage"; ensure_dir "$stage"
  /usr/bin/unzip -q "$archive" -d "$stage"
  extracted="$(/usr/bin/find "$stage" -type f -name "$wanted" | /usr/bin/head -n 1 || true)"
  [ -n "$extracted" ] || fail "O executavel $wanted nao foi localizado no pacote de $label."
  ensure_dir "$(dirname "$target")"; /bin/cp "$extracted" "$target"; /bin/chmod +x "$target"
}

install_gh() {
  local exe="$TOOLS_ROOT/GitHubCLI/bin/gh"
  if [ -x "$exe" ] && "$exe" --version >/dev/null 2>&1; then ok "GitHub CLI ja esta pronto"; printf '%s\n' "$exe"; return; fi
  step "Instalando GitHub CLI"
  install_zip_asset cli/cli "^gh_.+_macOS_${GH_ARCH}\\.zip$" "$exe" gh "GitHub CLI"
  "$exe" --version >/dev/null 2>&1 || fail "GitHub CLI nao iniciou."
  ok "GitHub CLI instalado"; printf '%s\n' "$exe"
}

install_bun() {
  local exe="$TOOLS_ROOT/Bun/bin/bun"
  if [ -x "$exe" ] && "$exe" --version >/dev/null 2>&1; then ok "Bun ja esta pronto"; printf '%s\n' "$exe"; return; fi
  step "Instalando Bun portatil"
  install_zip_asset oven-sh/bun "^bun-darwin-${BUN_ARCH}\\.zip$" "$exe" bun "Bun"
  "$exe" --version >/dev/null 2>&1 || fail "Bun nao iniciou."
  ok "Bun instalado"; printf '%s\n' "$exe"
}

install_tar_asset() {
  local repo="$1" pattern="$2" target="$3" wanted_pattern="$4" label="$5"
  local result url name archive stage extracted
  result="$(get_github_asset "$repo" "$pattern")" || fail "Nao foi encontrado o pacote de $label compativel com este Mac."
  url="$(printf '%s\n' "$result" | /usr/bin/head -n 1)"; name="$(printf '%s\n' "$result" | /usr/bin/tail -n 1)"
  archive="$TEMP_ROOT/$name"; download "$url" "$archive"
  stage="$TEMP_ROOT/extract-$(echo "$label" | tr ' ' '-')"; /bin/rm -rf "$stage"; ensure_dir "$stage"
  /usr/bin/tar -xzf "$archive" -C "$stage"
  extracted="$(/usr/bin/find "$stage" -type f | /usr/bin/grep -E "$wanted_pattern" | /usr/bin/head -n 1 || true)"
  [ -n "$extracted" ] || fail "O executavel de $label nao foi localizado no pacote."
  ensure_dir "$(dirname "$target")"; /bin/cp "$extracted" "$target"; /bin/chmod +x "$target"
}

install_codex() {
  local exe="$TOOLS_ROOT/Codex/codex"
  if [ -x "$exe" ] && "$exe" --version >/dev/null 2>&1; then ok "Codex CLI ja esta pronto"; printf '%s\n' "$exe"; return; fi
  step "Instalando Codex CLI oficial"
  install_tar_asset openai/codex "$CODEX_PATTERN" "$exe" '/codex(-[^/]*)?$' "Codex CLI"
  "$exe" --version >/dev/null 2>&1 || fail "Codex CLI foi instalado, mas nao iniciou."
  ok "Codex CLI instalado"; printf '%s\n' "$exe"
}

install_antigravity() {
  local exe="$TOOLS_ROOT/AntigravityCLI/agy" source="$HOME/.local/bin/agy" installer="$TEMP_ROOT/install-antigravity.sh"
  if [ -x "$exe" ] && "$exe" --version >/dev/null 2>&1; then ok "Antigravity CLI ja esta pronto"; printf '%s\n' "$exe"; return; fi
  step "Instalando Antigravity CLI oficial"
  download "https://antigravity.google/cli/install.sh" "$installer"
  /bin/chmod +x "$installer"
  /bin/bash "$installer" || fail "O instalador oficial do Antigravity retornou erro."
  if [ ! -x "$source" ]; then source="$(/usr/bin/find "$HOME/.local" -type f -name agy -perm -111 2>/dev/null | /usr/bin/head -n 1 || true)"; fi
  [ -n "$source" ] && [ -x "$source" ] || fail "O executavel agy nao foi localizado apos a instalacao oficial."
  ensure_dir "$(dirname "$exe")"; /bin/cp "$source" "$exe"; /bin/chmod +x "$exe"
  "$exe" --version >/dev/null 2>&1 || fail "Antigravity CLI nao iniciou."
  ok "Antigravity CLI instalado"; printf '%s\n' "$exe"
}

install_opencode() {
  local exe="$TOOLS_ROOT/OpenCode/opencode"
  if [ -x "$exe" ] && "$exe" --version >/dev/null 2>&1; then ok "OpenCode CLI ja esta pronto"; printf '%s\n' "$exe"; return; fi
  step "Instalando OpenCode CLI oficial"
  install_zip_asset anomalyco/opencode "$OPENCODE_PATTERN" "$exe" opencode "OpenCode CLI"
  "$exe" --version >/dev/null 2>&1 || fail "OpenCode CLI nao iniciou."
  ok "OpenCode CLI instalado"; printf '%s\n' "$exe"
}

install_ripgrep() {
  local exe="$TOOLS_ROOT/Ripgrep/rg"
  if [ -x "$exe" ] && "$exe" --version >/dev/null 2>&1; then ok "Ripgrep ja esta pronto"; printf '%s\n' "$exe"; return; fi
  step "Instalando Ripgrep oficial"
  install_tar_asset BurntSushi/ripgrep "$RIPGREP_PATTERN" "$exe" '/rg$' "Ripgrep"
  "$exe" --version >/dev/null 2>&1 || fail "Ripgrep nao iniciou."
  ok "Ripgrep instalado"; printf '%s\n' "$exe"
}

step "Copiando Lovable Bridge v1.6.0 R13"
/bin/rm -rf "$HOST_ROOT" "$EXTENSION_ROOT"
ensure_dir "$HOST_ROOT"; ensure_dir "$EXTENSION_ROOT"
/bin/cp -R "$SOURCE_HOST/." "$HOST_ROOT/"
/bin/cp -R "$SOURCE_EXTENSION/." "$EXTENSION_ROOT/"
ok "Extensao e Companion copiados"

GIT_EXE="$(install_git | /usr/bin/tail -n 1)"
GH_EXE="$(install_gh | /usr/bin/tail -n 1)"
BUN_EXE="$(install_bun | /usr/bin/tail -n 1)"
CODEX_EXE="$(install_codex | /usr/bin/tail -n 1)"
AGY_EXE="$(install_antigravity | /usr/bin/tail -n 1)"
OPENCODE_EXE="$(install_opencode | /usr/bin/tail -n 1)"
RG_EXE="$(install_ripgrep | /usr/bin/tail -n 1)"

step "Gravando configuracao das ferramentas"
"$NODE_EXE" - "$SETTINGS_PATH" "$VERSION" "$PROFILES_ROOT" "$PROJECTS_ROOT" "$GIT_EXE" "$GH_EXE" "$NODE_EXE" "$NPM_EXE" "$BUN_EXE" "$CODEX_EXE" "$AGY_EXE" "$OPENCODE_EXE" "$RG_EXE" "$CONFIG_ROOT" <<'NODE'
const fs = require('fs');
const path = require('path');
const [settingsPath, version, profilesRoot, projectsRoot, git, gh, node, npm, bun, codex, agy, opencode, rg, configRoot] = process.argv.slice(2);
let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}
settings.version = version;
if (!Array.isArray(settings.profiles)) settings.profiles = [];
if (!('activeProfileId' in settings)) settings.activeProfileId = null;
settings.profilesRoot ||= profilesRoot;
settings.defaultProjectsRoot ||= projectsRoot;
settings.engine ||= 'codex';
settings.tools = { ...(settings.tools || {}), git, githubCli: gh, node, npm, bun, codexCli: codex, antigravityCli: agy, openCodeCli: opencode, ripgrep: rg, rg };
settings.antigravity = { ...(settings.antigravity || {}), installed: true, signedIn: Boolean(settings.antigravity?.signedIn) };
settings.openCode = {
  ...(settings.openCode || {}), installed: true, provider: 'openrouter',
  model: settings.openCode?.model || 'openrouter/deepseek/deepseek-v4-flash:free',
  modelCatalogVersion: 2,
  configPath: settings.openCode?.configPath || path.join(configRoot, 'OpenCode', 'opencode-bridge.json')
};
fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
NODE
ok "Configuracao registrada"

step "Criando assistentes de configuracao"
OPENCODE_HELPER="$HELPERS_ROOT/CONFIGURAR-OPENCODE-OPENROUTER.command"
cat > "$OPENCODE_HELPER" <<EOF
#!/bin/bash
clear
printf 'Lovable Bridge - Configurar OpenCode com OpenRouter\\n\\n'
printf '1. Quando o OpenCode abrir, digite /connect\\n'
printf '2. Procure OpenRouter\\n'
printf '3. Cole sua API key\\n'
printf '4. Feche o OpenCode quando a conexao estiver concluida.\\n\\n'
read -r -p 'Pressione Enter para abrir o OpenCode... '
export PATH="$(dirname "$OPENCODE_EXE"):$NODE_ROOT/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$HOME"
exec "$OPENCODE_EXE"
EOF
/bin/chmod +x "$OPENCODE_HELPER"

step "Registrando o Companion nativo"
LAUNCHER="$HOST_ROOT/lovable_bridge_host"
cat > "$LAUNCHER" <<EOF
#!/bin/sh
export HOME="$HOME"
export PATH="$(dirname "$NODE_EXE"):$(dirname "$GIT_EXE"):$(dirname "$GH_EXE"):$(dirname "$BUN_EXE"):$(dirname "$CODEX_EXE"):$(dirname "$AGY_EXE"):$(dirname "$OPENCODE_EXE"):$(dirname "$RG_EXE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec "$NODE_EXE" "$HOST_ROOT/host.js"
EOF
/bin/chmod +x "$LAUNCHER"

write_native_manifest() {
  local directory="$1"
  ensure_dir "$directory"
  "$NODE_EXE" - "$directory/$NATIVE_HOST_NAME.json" "$NATIVE_HOST_NAME" "$LAUNCHER" "$EXTENSION_ID" "$VERSION" <<'NODE'
const fs = require('fs');
const [file, name, launcher, extensionId, version] = process.argv.slice(2);
const manifest = { name, description: `Lovable Bridge Companion ${version} macOS R13`, path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${extensionId}/`] };
fs.writeFileSync(file, JSON.stringify(manifest, null, 2), 'utf8');
NODE
}

write_native_manifest "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
write_native_manifest "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
write_native_manifest "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
write_native_manifest "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
write_native_manifest "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
ok "Native Messaging registrado"

step "Validacao final"
for required in "$EXTENSION_ROOT/manifest.json" "$EXTENSION_ROOT/sidepanel.html" "$EXTENSION_ROOT/sidepanel.js" "$HOST_ROOT/host.js" "$LAUNCHER" "$SETTINGS_PATH" "$CODEX_EXE" "$AGY_EXE" "$OPENCODE_EXE" "$RG_EXE"; do
  [ -f "$required" ] || fail "Arquivo obrigatorio ausente: $required"
done
"$NODE_EXE" --check "$HOST_ROOT/host.js" >/dev/null
"$NODE_EXE" --check "$EXTENSION_ROOT/sidepanel.js" >/dev/null
"$NODE_EXE" --check "$EXTENSION_ROOT/service-worker.js" >/dev/null
"$CODEX_EXE" --version >/dev/null
"$AGY_EXE" --version >/dev/null
"$OPENCODE_EXE" --version >/dev/null
"$RG_EXE" --version >/dev/null
ok "Instalacao verificada"

printf '\n\033[32m============================================================\n'
printf ' INSTALACAO CONCLUIDA - macOS R13\n'
printf '============================================================\033[0m\n\n'
printf 'Ultima etapa no Chrome:\n'
printf '1. Abra chrome://extensions\n'
printf '2. Ative o Modo do desenvolvedor\n'
printf '3. Clique em Carregar sem compactacao\n'
printf '4. Selecione esta pasta:\n'
printf '\033[33m   %s\033[0m\n' "$EXTENSION_ROOT"
printf '5. Abra o painel Lovable Bridge.\n\n'
printf 'OpenCode: use o botao Configurar OpenRouter quando selecionar esse motor.\n'
printf 'Codex e Antigravity pedirao login na primeira utilizacao.\n'
printf 'Log da instalacao: %s\n' "$INSTALL_LOG"
/usr/bin/open "$EXTENSION_ROOT" >/dev/null 2>&1 || true
/usr/bin/open -a "Google Chrome" "chrome://extensions" >/dev/null 2>&1 || /usr/bin/open "chrome://extensions" >/dev/null 2>&1 || true
