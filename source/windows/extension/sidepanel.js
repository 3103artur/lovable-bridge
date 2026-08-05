"use strict";

const $ = (id) => document.getElementById(id);


let SYSTEM_LOCALE = String((navigator.languages && navigator.languages[0]) || navigator.language || "en-US").replace("_", "-");
let UI_LOCALE = /^pt(?:-BR)?$/i.test(SYSTEM_LOCALE) ? "pt-BR" : "en-US";
let IS_PT_BR = UI_LOCALE === "pt-BR";
const tx = (pt, en) => IS_PT_BR ? pt : en;
const STATIC_TEXT_SOURCE = new WeakMap();

const EN_STATIC_TEXT = new Map([
  ["LOCAL • PERFIS ISOLADOS • GITHUB", "LOCAL • ISOLATED PROFILES • GITHUB"],
  ["Conectando", "Connecting"], ["Perfil ativo", "Active profile"], ["Gerenciar", "Manage"],
  ["Serviço local indisponível", "Local service unavailable"], ["Inicie o Lovable Bridge no Windows e tente novamente.", "Start Lovable Bridge on Windows and try again."],
  ["Tentar novamente", "Try again"], ["Crie seu primeiro perfil", "Create your first profile"],
  ["Cada perfil terá sua própria conta GitHub e uma pasta separada de projetos.", "Each profile has its own GitHub account and separate project folder."],
  ["Criar perfil", "Create profile"], ["← Voltar", "← Back"], ["Novo perfil", "New profile"],
  ["Use um nome fácil de reconhecer, como User.", "Use an easy-to-recognize name, such as User."],
  ["Nome do perfil", "Profile name"], ["Workspace do Lovable", "Lovable workspace"], ["(opcional)", "(optional)"],
  ["Criar e continuar", "Create and continue"], ["Conecte o GitHub", "Connect GitHub"],
  ["Este perfil ainda não possui uma conta GitHub.", "This profile does not have a GitHub account yet."],
  ["Entrar com GitHub", "Sign in with GitHub"],
  ["A página de autorização será aberta automaticamente e o código será copiado.", "The authorization page will open automatically and the code will be copied."],
  ["GitHub deste perfil", "GitHub for this profile"], ["Meus projetos", "My projects"],
  ["Somente projetos deste perfil.", "Only projects from this profile."], ["+ Adicionar", "+ Add"],
  ["Gerenciar perfil", "Manage profile"], ["Perfil", "Profile"], ["Workspace Lovable", "Lovable workspace"],
  ["Não informado", "Not provided"], ["Conta GitHub", "GitHub account"], ["Trocar conta GitHub", "Change GitHub account"],
  ["Desconectar GitHub", "Disconnect GitHub"], ["+ Adicionar outro perfil", "+ Add another profile"],
  ["Remover perfil", "Remove profile"], ["Os projetos locais e repositórios remotos serão preservados.", "Local projects and remote repositories will be preserved."],
  ["Remover este perfil", "Remove this profile"], ["Adicionar projeto", "Add project"],
  ["Os repositórios abaixo pertencem à conta do perfil ativo.", "The repositories below belong to the active profile account."],
  ["Nome no portfólio", "Portfolio name"], ["Endereço do projeto no Lovable", "Lovable project address"],
  ["Usar aba", "Use tab"], ["Preparar projeto", "Prepare project"], ["← Portfólio", "← Portfolio"],
  ["Branch", "Branch"], ["Alterações", "Changes"], ["Digite seu comando", "Enter your command"], ["O que você quer alterar?", "What do you want to change?"],
  ["▦ Prompts", "▦ Prompts"], ["Motor de edição", "Editing engine"], ["Modo de trabalho", "Work mode"],
  ["Codex usa a conta do ChatGPT conectada neste computador. O Bridge não compra créditos nem ativa recarga.", "Codex uses the ChatGPT account connected on this computer. Bridge does not buy credits or enable auto-recharge."],
  ["Configurar Codex Business", "Configure Codex Business"],
  ["Verificar conexão", "Verify connection"],
  ["Configurar OpenCode / OpenRouter", "Configure OpenCode / OpenRouter"],
  ["Modelo gratuito selecionável via OpenRouter.", "Selectable free model through OpenRouter."],
  ["📎 Anexar imagens ou vídeos", "📎 Attach images or videos"], ["📎 Anexar", "📎 Attach"], ["◎ Selecionar no site", "◎ Select on site"],
  ["Arraste arquivos para cá. Máximo de 10 por comando.", "Drag files here. Maximum 10 per command."],
  ["Enviar comando", "Send command"], ["Aplicar posição", "Apply position"], ["Usar no comando", "Use in command"],
  ["O motor selecionado edita somente a pasta deste projeto. O envio ao Lovable exige confirmação.", "The selected engine edits only this project folder. Sending to Lovable requires confirmation."],
  ["Preview local", "Local preview"], ["▶ Preview", "▶ Preview"], ["Mais ações", "More actions"], ["▶ Iniciar", "▶ Start"], ["↗ Abrir", "↗ Open"], ["■ Parar", "■ Stop"],
  ["🖼 Sincronizar imagens do Lovable", "🖼 Sync Lovable images"], ["Verificando mídias do projeto...", "Checking project media..."],
  ["Preview parado.", "Preview stopped."], ["Projeto", "Project"], ["✓ Build", "✓ Build"], ["↓ Atualizar", "↓ Update"],
  ["Ver alterações", "Review changes"], ["Enviar ao Lovable", "Send to Lovable"],
  ["O projeto será verificado e enviado com segurança pelo GitHub.", "The project will be verified and sent securely through GitHub."],
  ["Atalhos", "Shortcuts"], ["Publicar", "Publish"], ["Abrir Lovable", "Open Lovable"], ["Vincular aba", "Link tab"],
  ["Recuperação", "Recovery"], ["Descartar alterações locais", "Discard local changes"], ["Remover do perfil", "Remove from profile"],
  ["Resultado", "Result"], ["Limpar", "Clear"], ["Processando...", "Processing..."],
  ["Cancelar execução", "Cancel execution"], ["Cancelando...", "Cancelling..."],
  ["Prompts salvos", "Saved prompts"], ["Clique para inserir no campo de comando.", "Click to insert into the command field."],
  ["+ Criar novo prompt", "+ Create new prompt"], ["Nome", "Name"], ["Texto do prompt", "Prompt text"], ["Salvar prompt", "Save prompt"],
  ["Alterações por comando", "Changes by command"],
  ["Revise, refaça ou remova uma alteração antes de enviar ao Lovable.", "Review, redo, or remove a change before sending it to Lovable."],
  ["Fechar", "Close"],
  ["Verificando o Companion...", "Checking Companion..."], ["A interface funcional aparece acima; os detalhes técnicos ficam recolhidos.", "The functional interface appears above; technical details stay collapsed."],
  ["Configuração e diagnóstico", "Setup and diagnostics"], ["Testar conexão", "Test connection"], ["Executar diagnóstico", "Run diagnostics"], ["Ainda não executado.", "Not run yet."]
]);

const EN_PLACEHOLDERS = new Map([
  ["Ex.: User", "E.g.: User"], ["Ex.: User's Portfolio", "E.g.: User's Portfolio"],
  ["Buscar repositório...", "Search repository..."], ["Nome do site", "Website name"],
  ["Descrição da alteração", "Change description"], ["Buscar prompt...", "Search prompt..."],
  ["Ex.: Trocar imagem da hero", "E.g.: Replace hero image"],
  ["Escreva o comando que será reutilizado.", "Write the command to reuse."],
  ["Ex.: troque o overlay verde da hero por azul, sem alterar outros elementos.", "E.g.: change the green hero overlay to blue without changing other elements."], ["Descreva a alteração desejada...", "Describe the requested change..."]
]);

function setUiLocale(locale) {
  UI_LOCALE = /^pt(?:-BR)?$/i.test(String(locale || "")) ? "pt-BR" : "en-US";
  IS_PT_BR = UI_LOCALE === "pt-BR";
  document.documentElement.lang = UI_LOCALE;
}

function applyUiLocale() {
  document.documentElement.lang = UI_LOCALE;
  const reverse = new Map([...EN_STATIC_TEXT.entries()].map(([pt, en]) => [en, pt]));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const trimmed = node.nodeValue.trim();
    let source = STATIC_TEXT_SOURCE.get(node);
    if (!source) {
      source = EN_STATIC_TEXT.has(trimmed) ? trimmed : reverse.get(trimmed);
      if (source) STATIC_TEXT_SOURCE.set(node, source);
    }
    if (!source) continue;
    const leading = node.nodeValue.match(/^\s*/)?.[0] || "";
    const trailing = node.nodeValue.match(/\s*$/)?.[0] || "";
    node.nodeValue = `${leading}${IS_PT_BR ? source : (EN_STATIC_TEXT.get(source) || source)}${trailing}`;
  }
  document.querySelectorAll("[placeholder]").forEach((element) => {
    if (!element.dataset.lbPtPlaceholder) {
      const current = element.getAttribute("placeholder") || "";
      const source = EN_PLACEHOLDERS.has(current) ? current : [...EN_PLACEHOLDERS.entries()].find(([, en]) => en === current)?.[0];
      if (source) element.dataset.lbPtPlaceholder = source;
    }
    const source = element.dataset.lbPtPlaceholder;
    if (source) element.setAttribute("placeholder", IS_PT_BR ? source : (EN_PLACEHOLDERS.get(source) || source));
  });
  document.title = "Lovable Bridge";
}

function languageStorageKey(profileId = state.activeProfile?.id) {
  return profileId ? `lovableBridgeUiLocaleV2:${profileId}` : "lovableBridgeUiLocaleV2:global";
}

async function loadLanguagePreference() {
  const globalKey = languageStorageKey(null);
  const profileKey = state.activeProfile?.id ? languageStorageKey(state.activeProfile.id) : null;
  const keys = profileKey ? [globalKey, profileKey] : [globalKey];
  const stored = await chrome.storage.local.get(keys);
  const selected = stored[profileKey] || stored[globalKey] || UI_LOCALE;
  setUiLocale(selected);
  applyUiLocale();
  updateLanguageUi();
}

async function saveLanguagePreference(locale) {
  setUiLocale(locale);
  const values = { [languageStorageKey(null)]: UI_LOCALE };
  if (state.activeProfile?.id) values[languageStorageKey(state.activeProfile.id)] = UI_LOCALE;
  await chrome.storage.local.set(values);
  applyUiLocale();
  window.location.reload();
}

function ensureLanguageUi() {
  let select = $("languageSelect");
  if (select) return select;
  const actions = document.querySelector(".topbar-actions");
  if (!actions) return null;
  const wrapper = document.createElement("div");
  wrapper.id = "languagePicker";
  wrapper.title = tx("Idioma da interface", "Interface language");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "4px";
  select = document.createElement("select");
  select.id = "languageSelect";
  select.setAttribute("aria-label", tx("Idioma da interface", "Interface language"));
  select.style.minWidth = "52px";
  select.style.padding = "4px 5px";
  select.style.borderRadius = "8px";
  select.style.border = "1px solid rgba(255,255,255,.10)";
  select.style.background = "#111a27";
  select.style.color = "#f5f7fb";
  select.style.fontSize = "9px";
  select.style.fontWeight = "800";
  for (const [value, label] of [["pt-BR", "POR"], ["en-US", "ENG"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  select.addEventListener("change", () => saveLanguagePreference(select.value).catch((error) => log(tx("Erro ao alterar idioma", "Language change error"), error.message)));
  wrapper.appendChild(select);
  actions.insertBefore(wrapper, actions.firstChild);
  updateLanguageUi();
  return select;
}

function updateLanguageUi() {
  const select = $("languageSelect");
  if (select) select.value = UI_LOCALE;
}

const state = {
  health: null,
  profiles: [],
  activeProfile: null,
  projects: [],
  repos: [],
  selectedRepo: null,
  currentProject: null,
  mediaFiles: [],
  historyAttachments: [],
  changeHistory: null,
  editingHistoryDraft: false,
  promptTemplates: [],
  engine: "codex",
  workMode: "auto",
  uiLocale: UI_LOCALE,
  codexModelPreference: "auto",
  codexModels: [],
  codexResolvedModel: "gpt-5.6-terra",
  codexModelReason: "",
  codexModelsLoaded: false,
  openCodeModels: [],
  openCodeModel: "",
  openCodeModelName: "",
  openCodeModelsLoaded: false,
  openCodeModelsLoading: false,
  visualSelections: [],
  visualSelectionActive: false,
  useVisualSelectionForCommand: false,
  visualSelectionTabId: null,
  visualSelectionSessionId: null,
  visualSelectionRoute: "",
  visualSelectionPreviewUrl: "",
  activeJobId: null,
  activeJobCancelable: false,
  cancelRequestPending: false
};

function normalizeEngine(value) {
  return ["codex", "antigravity", "opencode"].includes(String(value || "").toLowerCase())
    ? String(value).toLowerCase()
    : "codex";
}

function engineLabel(engine) {
  const value = normalizeEngine(engine);
  if (value === "antigravity") return "Antigravity";
  if (value === "opencode") return "OpenCode";
  return "Codex Business";
}

function normalizeWorkMode(value) {
  const mode = String(value || "auto").toLowerCase().replace(/[-_\s]+/g, "");
  if (["visual", "frontend", "front", "ui", "content"].includes(mode)) return "visual";
  if (["seo", "sitehealth", "technicalseo", "audit"].includes(mode)) return "seo";
  if (["forms", "form", "email", "formsandemail"].includes(mode)) return "forms";
  if (["advanced", "backend", "back", "server", "fullstack", "full", "both"].includes(mode)) return "advanced";
  return "auto";
}

function workModeLabel(mode) {
  const value = normalizeWorkMode(mode);
  if (value === "visual") return tx("Visual e conteúdo", "Visual & content");
  if (value === "seo") return tx("SEO e saúde do site", "SEO & site health");
  if (value === "forms") return tx("Formulários e e-mail", "Forms & email");
  if (value === "advanced") return tx("Avançado", "Advanced");
  return tx("Automático", "Automatic");
}

function ensureWorkModeUi() {
  let select = $("workModeSelect");
  if (select) return select;
  const engineSelect = $("engineSelect");
  const engineRow = engineSelect?.closest(".engine-compact-row") || engineSelect?.parentElement;
  if (!engineRow?.parentElement) return null;
  const row = document.createElement("div");
  row.id = "workModeRow";
  row.className = "engine-compact-row lovable-bridge-work-mode-row";
  row.style.marginTop = "8px";
  const label = document.createElement("label");
  label.htmlFor = "workModeSelect";
  label.textContent = tx("Modo", "Mode");
  select = document.createElement("select");
  select.id = "workModeSelect";
  select.className = "engine-select";
  for (const [value, pt, en] of [
    ["auto", "Automático", "Automatic"],
    ["visual", "Visual e conteúdo", "Visual & content"],
    ["seo", "SEO e saúde do site", "SEO & site health"],
    ["forms", "Formulários e e-mail", "Forms & email"],
    ["advanced", "Avançado", "Advanced"]
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = tx(pt, en);
    select.appendChild(option);
  }
  row.append(label, select);
  const hint = document.createElement("p");
  hint.id = "workModeHint";
  hint.className = "engine-hint compact-engine-hint";
  hint.style.marginTop = "4px";
  engineRow.insertAdjacentElement("afterend", row);
  row.insertAdjacentElement("afterend", hint);
  select.addEventListener("change", async () => {
    state.workMode = normalizeWorkMode(select.value);
    await chrome.storage.local.set({ lovableBridgeWorkModeV2: state.workMode });
    updateWorkModeUi();
    if (state.editingHistoryDraft) saveEditDraft().catch(() => {});
  });
  return select;
}

function updateWorkModeUi() {
  const select = ensureWorkModeUi();
  if (!select) return;
  select.value = normalizeWorkMode(state.workMode);
  const hint = $("workModeHint");
  const visualButton = $("selectPreviewBtn");
  if (state.workMode === "seo") {
    if (hint) hint.textContent = tx("Auditorias e correções de links, redirects, canonicals, titles, metas, imagens, sitemap, robots, schema, performance e mobile.", "Audits and fixes for links, redirects, canonicals, titles, meta, images, sitemap, robots, schema, performance, and mobile.");
  } else if (state.workMode === "forms") {
    if (hint) hint.textContent = tx("Formulários, Supabase, destinatários, reply-to, domínio de envio, logs e testes de entrega.", "Forms, Supabase, recipients, reply-to, sending domain, logs, and delivery tests.");
  } else if (state.workMode === "advanced") {
    if (hint) hint.textContent = tx("APIs, autenticação, banco, migrations, RLS, webhooks, Storage e outras tarefas técnicas. Operações sensíveis continuam protegidas.", "APIs, authentication, database, migrations, RLS, webhooks, Storage, and other technical work. Sensitive operations remain protected.");
  } else if (state.workMode === "visual") {
    if (hint) hint.textContent = tx("Páginas, textos, imagens, estilos, layout, acessibilidade e responsividade.", "Pages, content, images, styles, layout, accessibility, and responsive behavior.");
  } else {
    if (hint) hint.textContent = tx("O Bridge identifica automaticamente o fluxo mais adequado sem consumir o Codex para classificar o pedido.", "Bridge identifies the best workflow locally without using Codex to classify the request.");
  }
  if (visualButton) visualButton.hidden = false;
}

function normalizeCodexModelPreference(value) {
  const model = String(value || "auto").trim().toLowerCase();
  if (["gpt-5.6-luna", "luna"].includes(model)) return "luna";
  if (["gpt-5.6-terra", "terra"].includes(model)) return "terra";
  if (["gpt-5.6-sol", "sol"].includes(model)) return "sol";
  return "auto";
}

function codexModelLabel(value) {
  const model = normalizeCodexModelPreference(value);
  if (model === "luna") return "GPT-5.6 Luna";
  if (model === "terra") return "GPT-5.6 Terra";
  if (model === "sol") return "GPT-5.6 Sol";
  return tx("Automático — economia inteligente", "Automatic — smart savings");
}

function ensureCodexModelUi() {
  let select = $("codexModelSelect");
  if (select) return select;
  const modeHint = $("workModeHint");
  const anchor = modeHint || $("workModeRow");
  if (!anchor?.parentElement) return null;
  const row = document.createElement("div");
  row.id = "codexModelRow";
  row.className = "engine-compact-row lovable-bridge-codex-model-row";
  row.style.marginTop = "7px";
  const label = document.createElement("label");
  label.htmlFor = "codexModelSelect";
  label.textContent = tx("Modelo Codex", "Codex model");
  select = document.createElement("select");
  select.id = "codexModelSelect";
  select.className = "engine-select";
  row.append(label, select);
  const hint = document.createElement("p");
  hint.id = "codexModelHint";
  hint.className = "engine-hint compact-engine-hint";
  hint.style.marginTop = "3px";
  anchor.insertAdjacentElement("afterend", row);
  row.insertAdjacentElement("afterend", hint);
  select.addEventListener("change", async () => {
    state.codexModelPreference = normalizeCodexModelPreference(select.value);
    await chrome.storage.local.set({ lovableBridgeCodexModelPreferenceV1: state.codexModelPreference });
    updateCodexModelUi();
  });
  return select;
}

function updateCodexModelUi() {
  const select = ensureCodexModelUi();
  const row = $("codexModelRow");
  const hint = $("codexModelHint");
  if (!select || !row) return;
  const hidden = state.engine !== "codex";
  row.hidden = hidden;
  if (hint) hint.hidden = hidden;
  select.innerHTML = "";
  const available = Array.isArray(state.codexModels) && state.codexModels.length
    ? state.codexModels
    : [{ preference: "terra", id: "gpt-5.6-terra", name: "GPT-5.6 Terra" }];
  const automatic = document.createElement("option");
  automatic.value = "auto";
  automatic.textContent = codexModelLabel("auto");
  select.appendChild(automatic);
  for (const item of available) {
    const option = document.createElement("option");
    option.value = item.preference || String(item.id || "").split("-").pop();
    option.textContent = item.name || item.id;
    select.appendChild(option);
  }
  select.value = normalizeCodexModelPreference(state.codexModelPreference);
  if (!select.value) select.value = "auto";
  if (hint) hint.textContent = state.codexModelReason
    ? state.codexModelReason
    : tx("No automático, tarefas simples usam Luna; tarefas médias, amplas ou sensíveis usam Terra. Sol é somente manual.", "Automatic uses Luna for simple tasks and Terra for medium, broad, or sensitive tasks. Sol is manual only.");
}

async function loadCodexModels(options = {}) {
  try {
    const data = await api("/api/codex/models");
    state.codexModels = Array.isArray(data.models) ? data.models : [];
    state.codexModelsLoaded = true;
    state.codexResolvedModel = data.defaultModel || "gpt-5.6-terra";
    updateCodexModelUi();
    return data;
  } catch (error) {
    state.codexModelsLoaded = false;
    updateCodexModelUi();
    if (!options.silent) log(tx("Não foi possível consultar os modelos do Codex", "Could not check Codex models"), error.message);
    return null;
  }
}

const views = {
  offline: $("offlineView"),
  onboarding: $("onboardingView"),
  createProfile: $("createProfileView"),
  connect: $("connectView"),
  portfolio: $("portfolioView"),
  manageProfile: $("manageProfileView"),
  add: $("addView"),
  project: $("projectView")
};

function showView(name) {
  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle("hidden", key !== name);
  });
}

function runtimeText(value) {
  const text = String(value ?? "");
  if (IS_PT_BR || !text) return text;
  const replacements = [
    [/Lovable Bridge pronto/g, "Lovable Bridge ready"],
    [/Companion indisponível/g, "Companion unavailable"],
    [/Desconectado/g, "Disconnected"],
    [/desconectado/g, "disconnected"],
    [/conectado/g, "connected"],
    [/Verificando a conta Codex Business/g, "Checking Codex Business account"],
    [/Localizando os arquivos e preparando a alteração/g, "Locating files and preparing the change"],
    [/Codex Business localizando os arquivos/g, "Codex Business locating files"],
    [/Codex Business rebaseando o patch/g, "Codex Business rebasing the patch"],
    [/Patch incompatível; tentando edição direta segura/g, "Patch mismatch; trying safe direct editing"],
    [/Executando Safety Guard/g, "Running Safety Guard"],
    [/Executando build automático/g, "Running automatic build"],
    [/Executando auditoria com/g, "Running audit with"],
    [/Auditando o projeto/g, "Auditing the project"],
    [/Aguardando\.\.\./g, "Waiting..."],
    [/Execução cancelada pelo usuário/g, "Execution cancelled by the user"],
    [/Execução cancelada/g, "Execution cancelled"],
    [/A tarefa falhou/g, "The task failed"],
    [/O Safety Guard rejeitou a alteração e restaurou o projeto/g, "Safety Guard rejected the change and restored the project"],
    [/Diff preservado em:/g, "Preserved diff:"],
    [/O pedido de ([^\n;]+) alterou (\d+) arquivos; o limite adaptativo é (\d+)\./g, "The $1 request changed $2 files; the adaptive limit is $3."],
    [/A alteração modificou (\d+) linhas; o limite seguro para este pedido é (\d+)\./g, "The change modified $1 lines; the safe limit for this request is $2."],
    [/A alteração removeu (\d+) linhas; o limite seguro para este pedido é (\d+)\./g, "The change removed $1 lines; the safe limit for this request is $2."],
    [/Nenhum arquivo foi modificado/g, "No files were modified"],
    [/Auditoria concluída com/g, "Audit completed with"],
    [/Modelo utilizado:/g, "Model used:"],
    [/Modo de trabalho:/g, "Work mode:"],
    [/Arquivos validados:/g, "Validated files:"],
    [/linhas alteradas:/g, "changed lines:"],
    [/Alteração concluída com Codex Business/g, "Change completed with Codex Business"],
    [/O limite de uso do Codex Business foi atingido/g, "The Codex Business usage limit has been reached"],
    [/O login do Codex Business expirou/g, "The Codex Business sign-in has expired"],
    [/Não foi possível/g, "Could not"],
    [/Erro ao/g, "Error while"],
    [/Nenhum perfil ativo/g, "No active profile"],
    [/Nenhum projeto/g, "No project"],
    [/Projeto preparado/g, "Project prepared"],
    [/GitHub conectado/g, "GitHub connected"],
    [/GitHub desconectado/g, "GitHub disconnected"]
  ];
  return replacements.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

function log(title, content = "") {
  const time = new Date().toLocaleTimeString(UI_LOCALE);
  const text = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  $("logOutput").textContent = `[${time}] ${runtimeText(title)}${text ? `\n\n${runtimeText(text)}` : ""}`;
}

function setConnected(value) {
  const badge = $("connectionBadge");
  badge.textContent = value ? tx("Conectado", "Connected") : tx("Desconectado", "Disconnected");
  badge.className = `badge ${value ? "badge-on" : "badge-off"}`;
}

function updateSystemReady(ready, data = {}) {
  const dot = $("systemReadyDot");
  const text = $("systemReadyText");
  const subtext = $("systemReadySubtext");
  if (!dot || !text || !subtext) return;
  dot.className = `system-ready-dot ${ready ? "ok" : "error"}`;
  text.textContent = ready ? tx("Lovable Bridge pronto", "Lovable Bridge ready") : tx("Companion indisponível", "Companion unavailable");
  subtext.textContent = ready
    ? tx(`Companion ${data.version || ""} conectado.`, `Companion ${data.version || ""} connected.`)
    : String(data.error || tx("Abra o diagnóstico para mais detalhes.", "Open diagnostics for details."));
}

async function runNativeConnectionTest() {
  const output = $("nativeDiagnosticsOutput");
  try {
    const data = await nativeRequest("ping");
    output.textContent = tx(`Conexão aprovada: Companion ${data.version} em ${data.os}/${data.arch}.`, `Connection approved: Companion ${data.version} on ${data.os}/${data.arch}.`);
    updateSystemReady(true, data);
  } catch (error) {
    output.textContent = error.message;
    updateSystemReady(false, { error: error.message });
  }
}

async function runNativeDiagnostics() {
  const output = $("nativeDiagnosticsOutput");
  output.textContent = tx("Executando diagnóstico...", "Running diagnostics...");
  try {
    const data = await nativeRequest("diagnostics");
    output.textContent = (data.tools || []).map((tool) => {
      const auth = typeof tool.authenticated === "boolean" ? ` | ${tool.authenticated ? tx("conectado", "signed in") : tx("login pendente", "sign-in required")}` : "";
      return `${tool.name}: ${tool.installed ? tx("instalado", "installed") : tx("ausente", "missing")}${auth}\n${tool.version || ""}\n${tool.path || ""}`;
    }).join("\n\n");
  } catch (error) { output.textContent = error.message; }
}

async function nativeRequest(command, args = {}, timeoutMs = 20 * 60 * 1000) {
  const response = await chrome.runtime.sendMessage({ type: "native-request", command, args, timeoutMs });
  if (!response?.ok) throw new Error(response?.error || "Falha na comunicação com o Companion.");
  return response.data || {};
}

async function api(path, options = {}) {
  const data = await nativeRequest("api", {
    method: options.method || "GET",
    path,
    body: options.body || {}
  });
  if (!data.ok) throw new Error(data.error || "Erro do Companion.");
  return data;
}

function bytesToBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + step, bytes.length)));
  }
  return btoa(binary);
}

async function uploadFileNative(path, file, extra = {}) {
  const begin = await nativeRequest("upload_begin", {
    path,
    filename: file.name || "media",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    ...extra
  });
  const chunkSize = 512 * 1024;
  try {
    let index = 0;
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const buffer = await file.slice(offset, Math.min(offset + chunkSize, file.size)).arrayBuffer();
      await nativeRequest("upload_chunk", {
        uploadId: begin.uploadId,
        index: index++,
        data: bytesToBase64(new Uint8Array(buffer))
      });
    }
    return await nativeRequest("upload_finish", { uploadId: begin.uploadId });
  } catch (error) {
    nativeRequest("upload_abort", { uploadId: begin.uploadId }).catch(() => {});
    throw error;
  }
}

async function apiForm(path, formData) {
  const files = formData.getAll("files").filter((item) => item instanceof File);
  const attachments = [];
  for (const file of files) {
    const result = await uploadFileNative(path, file);
    if (result.attachment) attachments.push(result.attachment);
  }
  return { ok: true, attachments };
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function profilePath(suffix = "") {
  if (!state.activeProfile) throw new Error(tx("Nenhum perfil ativo.", "No active profile."));
  return `/api/profiles/${state.activeProfile.id}${suffix}`;
}

function editDraftStorageKey() {
  if (!state.activeProfile || !state.currentProject) return "";
  return `lovableBridgeEditDraftV1:${state.activeProfile.id}:${state.currentProject.id}`;
}

async function saveEditDraft() {
  const key = editDraftStorageKey();
  if (!key || !state.editingHistoryDraft) return;
  await chrome.storage.local.set({
    [key]: {
      prompt: $("agentPrompt").value,
      engine: state.engine,
      workMode: state.workMode,
      codexModelPreference: state.codexModelPreference,
      attachments: state.historyAttachments,
      savedAt: Date.now()
    }
  });
}

async function clearEditDraft() {
  const key = editDraftStorageKey();
  if (key) await chrome.storage.local.remove(key);
  state.editingHistoryDraft = false;
}

async function restoreEditDraft() {
  const key = editDraftStorageKey();
  if (!key) return;
  const stored = await chrome.storage.local.get(key);
  const draft = stored[key];
  if (!draft) return;
  state.editingHistoryDraft = true;
  $("agentPrompt").value = String(draft.prompt || "");
  state.engine = normalizeEngine(draft.engine);
  state.workMode = normalizeWorkMode(draft.workMode || state.workMode);
  state.codexModelPreference = normalizeCodexModelPreference(draft.codexModelPreference || state.codexModelPreference);
  $("engineSelect").value = state.engine;
  updateEngineUi();
  updateWorkModeUi();
  updateCodexModelUi();
  state.historyAttachments = Array.isArray(draft.attachments) ? draft.attachments : [];
  renderMediaFiles();
  log(tx("Rascunho de edição restaurado", "Edit draft restored"), tx("O comando removido anteriormente está pronto para ser revisado e enviado novamente.", "The previously removed command is ready to review and send again."));
}

async function loadHealth() {
  try {
    state.health = await api("/api/health");
    updateEngineUi();
    if (state.health.systemLocale) SYSTEM_LOCALE = String(state.health.systemLocale).replace("_", "-");
    setConnected(true);
    updateSystemReady(true, state.health);
    if (state.health.openCodeInstalled && state.engine === "opencode") {
      loadOpenCodeModels({ silent: true }).catch(() => {});
    }
    return true;
  } catch (error) {
    setConnected(false);
    updateSystemReady(false, { error: error.message });
    $("profileBar").classList.add("hidden");
    showView("offline");
    log(tx("Serviço local indisponível", "Local service unavailable"), error.message);
    return false;
  }
}

async function loadProfiles(preferredId = null) {
  const data = await api("/api/profiles");
  state.profiles = data.profiles;
  const activeId = preferredId || data.activeProfileId;
  state.activeProfile = state.profiles.find((item) => item.id === activeId) || state.profiles[0] || null;
  await loadLanguagePreference().catch(() => {});
  ensureLanguageUi();
  renderProfileSelector();
  return state.profiles;
}

function renderProfileSelector() {
  const bar = $("profileBar");
  const select = $("profileSelect");
  select.innerHTML = "";

  if (!state.profiles.length) {
    bar.classList.add("hidden");
    return;
  }

  for (const profile of state.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.github.connected
      ? `${profile.displayName} • ${profile.github.login}`
      : `${profile.displayName} • ${tx("GitHub pendente", "GitHub pending")}`;
    option.selected = profile.id === state.activeProfile?.id;
    select.appendChild(option);
  }
  bar.classList.remove("hidden");
}

async function activateProfile(profileId) {
  await api(`/api/profiles/${profileId}/activate`, { method: "POST" });
  await loadProfiles(profileId);
  state.projects = [];
  state.currentProject = null;
  state.mediaFiles = [];
  state.historyAttachments = [];
  renderMediaFiles();
  await openHome();
}

async function openHome() {
  if (!(await loadHealth())) return;
  await loadProfiles(state.activeProfile?.id);

  if (!state.profiles.length) {
    showView("onboarding");
    return;
  }

  if (!state.activeProfile.github.connected) {
    $("connectProfileLabel").textContent = tx(`O perfil ${state.activeProfile.displayName} ainda não possui uma conta GitHub.`, `Profile ${state.activeProfile.displayName} does not have a GitHub account yet.`);
    showView("connect");
    return;
  }

  await loadProjects();
  showView("portfolio");
}

async function createProfile() {
  const displayName = $("profileNameInput").value.trim();
  const lovableWorkspace = $("workspaceNameInput").value.trim();
  try {
    const data = await api("/api/profiles", {
      method: "POST",
      body: { displayName, lovableWorkspace }
    });
    $("profileNameInput").value = "";
    $("workspaceNameInput").value = "";
    await loadProfiles(data.profile.id);
    $("connectProfileLabel").textContent = tx(`Conecte a conta GitHub que pertence ao perfil ${data.profile.displayName}.`, `Connect the GitHub account that belongs to profile ${data.profile.displayName}.`);
    showView("connect");
  } catch (error) {
    log(tx("Erro ao criar perfil", "Profile creation error"), error.message);
  }
}

async function connectGithub() {
  try {
    const data = await api(profilePath("/github/connect"), { method: "POST" });
    const result = await pollJob(data.jobId);
    log(tx("GitHub conectado", "GitHub connected"), result.profile?.github || result);
    await loadProfiles(state.activeProfile.id);
    await openHome();
  } catch (error) {
    log(tx("Erro no login do GitHub", "GitHub sign-in error"), error.message);
  }
}

async function disconnectGithub({ reconnect = false } = {}) {
  if (!state.activeProfile) return;
  const message = state.activeProfile.projectCount
    ? "Este perfil possui projetos. Eles continuarão salvos, mas ficarão bloqueados até a conta correta ser conectada novamente. Continuar?"
    : "Desconectar a conta GitHub deste perfil?";
  if (!confirm(message)) return;

  try {
    await api(profilePath("/github/disconnect"), { method: "POST" });
    await loadProfiles(state.activeProfile.id);
    log(tx("GitHub desconectado", "GitHub disconnected"), tx(`Perfil: ${state.activeProfile.displayName}`, `Profile: ${state.activeProfile.displayName}`));
    if (reconnect) await connectGithub();
    else await openHome();
  } catch (error) {
    log(tx("Erro ao desconectar GitHub", "GitHub disconnect error"), error.message);
  }
}

async function openManageProfile() {
  if (!state.activeProfile) return;
  $("manageProfileName").textContent = state.activeProfile.displayName;
  $("manageWorkspaceName").textContent = state.activeProfile.lovable?.workspaceName || tx("Não informado", "Not provided");
  $("manageGithubStatus").textContent = state.activeProfile.github.connected
    ? tx(`Conectado como ${state.activeProfile.github.login}`, `Connected as ${state.activeProfile.github.login}`)
    : tx("Nenhuma conta conectada", "No account connected");
  $("changeGithubBtn").textContent = state.activeProfile.github.connected
    ? "Trocar conta GitHub"
    : "Conectar GitHub";
  $("disconnectGithubBtn").disabled = !state.activeProfile.github.connected;
  showView("manageProfile");
}

async function deleteProfile() {
  if (!state.activeProfile) return;
  if (!confirm(`Remover o perfil ${state.activeProfile.displayName}? As pastas locais e os repositórios remotos serão preservados.`)) return;
  try {
    await api(`/api/profiles/${state.activeProfile.id}`, { method: "DELETE" });
    state.activeProfile = null;
    await loadProfiles();
    await openHome();
  } catch (error) {
    log("Erro ao remover perfil", error.message);
  }
}

async function loadProjects() {
  const data = await api(profilePath("/projects"));
  state.projects = data.projects;
  renderProjects();
}

function renderProjects() {
  const container = $("projectList");
  container.innerHTML = "";
  $("githubAccount").textContent = state.activeProfile.github.login;

  if (!state.projects.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-icon">+</div>
      <h2>Nenhum projeto neste perfil</h2>
      <p>Adicione um repositório da conta ${escapeHtml(state.activeProfile.github.login)}.</p>
    `;
    const button = document.createElement("button");
    button.className = "button primary";
    button.textContent = tx("Adicionar projeto", "Add project");
    button.addEventListener("click", openAddView);
    empty.appendChild(button);
    container.appendChild(empty);
    return;
  }

  for (const project of state.projects) {
    const card = document.createElement("article");
    card.className = "project-card";
    const sync = project.status.behind > 0
      ? tx(`${project.status.behind} atrás`, `${project.status.behind} behind`)
      : project.status.ahead > 0
        ? tx(`${project.status.ahead} à frente`, `${project.status.ahead} ahead`)
        : tx("Sincronizado", "Synced");
    card.innerHTML = `
      <span class="small-label">${escapeHtml(project.repo)}</span>
      <h3>${escapeHtml(project.displayName)}</h3>
      <div class="project-meta">
        <span>${project.status.changedCount} ${tx("alteração(ões)", "change(s)")}</span>
        <span>${escapeHtml(sync)}</span>
      </div>
    `;
    card.addEventListener("click", () => openProject(project.id));
    container.appendChild(card);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function openAddView() {
  showView("add");
  $("repoList").innerHTML = `<p class="subtext">Carregando repositórios de ${escapeHtml(state.activeProfile.github.login)}...</p>`;
  $("projectForm").classList.add("hidden");
  state.selectedRepo = null;
  try {
    const data = await api(profilePath("/repos"));
    state.repos = data.repos;
    renderRepos("");
  } catch (error) {
    log(tx("Erro ao listar repositórios", "Repository list error"), error.message);
    $("repoList").innerHTML = `<p class="subtext">Não foi possível carregar os repositórios.</p>`;
  }
}

function renderRepos(search) {
  const query = String(search || "").toLowerCase().trim();
  const container = $("repoList");
  container.innerHTML = "";
  const registered = new Set(state.projects.map((item) => item.repo.toLowerCase()));
  const repos = state.repos.filter((repo) => {
    const haystack = `${repo.nameWithOwner} ${repo.description}`.toLowerCase();
    return (!query || haystack.includes(query)) && !registered.has(repo.nameWithOwner.toLowerCase());
  });
  for (const repo of repos) {
    const item = document.createElement("div");
    item.className = "repo-item";
    item.innerHTML = `
      <strong>${escapeHtml(repo.nameWithOwner)}</strong>
      <p>${escapeHtml(repo.description || (repo.isPrivate ? "Repositório privado" : "Repositório público"))}</p>
    `;
    item.addEventListener("click", () => selectRepo(repo));
    container.appendChild(item);
  }
  if (!repos.length) container.innerHTML = `<p class="subtext">Nenhum repositório disponível.</p>`;
}

function selectRepo(repo) {
  state.selectedRepo = repo;
  $("displayNameInput").value = repo.name;
  $("projectForm").classList.remove("hidden");
  $("projectForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function pollJob(jobId, options = {}) {
  const cancelable = Boolean(options.cancelable);
  state.activeJobId = jobId;
  state.activeJobCancelable = cancelable;
  state.cancelRequestPending = false;
  $("jobOverlay").classList.remove("hidden");
  $("jobProgress").style.width = "0%";
  const cancelButton = $("cancelJobBtn");
  cancelButton.classList.toggle("hidden", !cancelable);
  cancelButton.disabled = false;
  cancelButton.textContent = tx("Cancelar execução", "Cancel execution");

  const cleanup = () => {
    state.activeJobId = null;
    state.activeJobCancelable = false;
    state.cancelRequestPending = false;
    cancelButton.classList.add("hidden");
    cancelButton.disabled = false;
    cancelButton.textContent = tx("Cancelar execução", "Cancel execution");
    $("jobOverlay").classList.add("hidden");
  };

  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      try {
        const data = await api(`/api/jobs/${jobId}`);
        const job = data.job;
        $("jobStage").textContent = runtimeText(job.stage);
        $("jobProgress").style.width = `${job.progress}%`;
        $("jobLog").textContent = runtimeText(job.log || tx("Aguardando...", "Waiting..."));
        if (typeof options.onUpdate === "function") {
          try { options.onUpdate(job); } catch {}
        }
        if (job.status === "cancelling") {
          cancelButton.disabled = true;
          cancelButton.textContent = tx("Cancelando...", "Cancelling...");
        } else if (job.status === "completed") {
          clearInterval(timer);
          cleanup();
          resolve(job.result);
        } else if (job.status === "failed" || job.status === "cancelled") {
          clearInterval(timer);
          cleanup();
          reject(new Error(runtimeText(job.error || (job.status === "cancelled" ? tx("Execução cancelada.", "Execution cancelled.") : tx("A tarefa falhou.", "The task failed.")))));
        }
      } catch (error) {
        clearInterval(timer);
        cleanup();
        reject(error);
      }
    }, 500);
  });
}

async function cancelActiveJob() {
  if (!state.activeJobId || !state.activeJobCancelable || state.cancelRequestPending) return;
  state.cancelRequestPending = true;
  const button = $("cancelJobBtn");
  button.disabled = true;
  button.textContent = tx("Cancelando...", "Cancelling...");
  $("jobStage").textContent = tx("Cancelando e restaurando...", "Cancelling and restoring...");
  try {
    await api(`/api/jobs/${state.activeJobId}/cancel`, { method: "POST", body: {} });
  } catch (error) {
    state.cancelRequestPending = false;
    button.disabled = false;
    button.textContent = tx("Cancelar execução", "Cancel execution");
    log(tx("Não foi possível cancelar", "Could not cancel"), error.message);
  }
}

async function prepareSelectedRepo() {
  if (!state.selectedRepo) return;
  try {
    const data = await api(profilePath("/projects"), {
      method: "POST",
      body: {
        repo: state.selectedRepo.nameWithOwner,
        defaultBranch: state.selectedRepo.defaultBranch,
        displayName: $("displayNameInput").value.trim(),
        lovableUrl: $("lovableUrlInput").value.trim()
      }
    });
    const result = await pollJob(data.jobId);

    // Best-effort automatic media cache. The current Lovable tab may contain
    // the /__l5e/assets-v1/ resources required by local preview. Failure here
    // never invalidates the prepared project; the manual sync button remains.
    let mediaNote = "";
    if (result?.project?.id) {
      await openProject(result.project.id);
      const mediaResult = await syncLovableAssets({ automatic: true });
      if (mediaResult?.details) mediaNote = `\n\n${mediaResult.details}`;
    }

    log(tx("Projeto preparado", "Project prepared"), `${JSON.stringify(result, null, 2)}${mediaNote}`);
    await openHome();
  } catch (error) {
    log(tx("Erro ao preparar projeto", "Project preparation error"), error.message);
  }
}

async function openProject(id) {
  try {
    const data = await api(profilePath(`/projects/${id}`));
    state.currentProject = data.project;
    state.historyAttachments = [];
    renderMediaFiles();
    renderCurrentProject();
    await loadVisualSelections();
    await restoreEditDraft();
    showView("project");
  } catch (error) {
    log(tx("Erro ao abrir projeto", "Project open error"), error.message);
  }
}


function visualProjectKey() {
  if (!state.activeProfile?.id || !state.currentProject?.id) return "";
  return `${state.activeProfile.id}:${state.currentProject.id}`;
}

async function saveVisualSelections() {
  const key = visualProjectKey();
  if (!key) return;
  const stored = await chrome.storage.local.get("lovableBridgeVisualSelectionsV2");
  const all = stored.lovableBridgeVisualSelectionsV2 || {};
  all[key] = {
    selections: state.visualSelections,
    previewUrl: state.currentProject?.preview?.url || "",
    active: state.visualSelectionActive,
    route: state.visualSelectionRoute || "",
    previewUrlActual: state.visualSelectionPreviewUrl || "",
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ lovableBridgeVisualSelectionsV2: all });
}

async function loadVisualSelections() {
  const key = visualProjectKey();
  state.visualSelections = [];
  state.visualSelectionActive = false;
  state.useVisualSelectionForCommand = false;
  state.visualSelectionRoute = "";
  state.visualSelectionPreviewUrl = "";
  if (key) {
    const stored = await chrome.storage.local.get("lovableBridgeVisualSelectionsV2");
    const saved = stored.lovableBridgeVisualSelectionsV2?.[key];
    state.visualSelections = Array.isArray(saved?.selections) ? saved.selections.slice(0, 10) : [];
    state.useVisualSelectionForCommand = state.visualSelections.length > 0;
    state.visualSelectionRoute = String(saved?.route || state.visualSelections[0]?.route || "");
    state.visualSelectionPreviewUrl = String(saved?.previewUrlActual || saved?.previewUrl || "");
  }
  renderVisualSelections();
}

function visualSelectionAttachmentCount() {
  return totalAttachmentCount();
}

function updateVisualCommandModeUi() {
  const count = state.visualSelections.length;
  if (!count) state.useVisualSelectionForCommand = false;
  const enabled = Boolean(count && state.useVisualSelectionForCommand);
  const checkbox = $("useVisualSelectionCheckbox");
  const status = $("visualCommandModeStatus");
  const sendButton = $("sendAgentBtn");
  const applyButton = $("applyVisualPositionBtn");
  if (checkbox) {
    checkbox.disabled = !count;
    checkbox.checked = enabled;
  }
  if (status) {
    status.textContent = enabled
      ? tx("A seleção será usada como alvo do próximo comando. O texto do comando define a ação.", "The selection will be used as the target of the next command. The command text defines the action.")
      : tx("A seleção está guardada, mas será ignorada neste comando.", "The selection is saved but will be ignored for this command.");
    status.classList.toggle("is-enabled", enabled);
  }
  if (sendButton) sendButton.textContent = enabled ? tx("Enviar com seleção", "Send with selection") : tx("Enviar comando", "Send command");
  if (applyButton) {
    applyButton.disabled = !count;
    const hasDelete = state.visualSelections.some((item) => item.deleteRequested);
    const hasMove = state.visualSelections.some((item) => item.move && (Number(item.move.dx) || Number(item.move.dy)));
    applyButton.textContent = hasDelete
      ? tx("Aplicar exclusão", "Apply deletion")
      : hasMove
        ? tx("Aplicar movimento", "Apply movement")
        : tx("Aplicar posição", "Apply position");
  }
}

function compactVisualSource(selection) {
  const raw = String(selection.source || "");
  if (/^data:/i.test(raw)) return `[imagem inline; arquivo ${selection.sourceFile || "não identificado"}]`;
  if (/^blob:/i.test(raw)) return `[imagem temporária; arquivo ${selection.sourceFile || "não identificado"}]`;
  return raw.length > 500 ? `${raw.slice(0, 497)}...` : raw;
}

function isMediaSelection(selection) {
  return ["img", "background", "image"].includes(String(selection?.type || selection?.elementKind || "").toLowerCase());
}

function selectedElementLabel(selection) {
  const kind = String(selection?.elementKind || selection?.type || "elemento").toLowerCase();
  const labels = {
    img: "imagem", image: "imagem", background: "imagem de fundo", text: "texto", heading: "título",
    button: "botão", link: "link", icon: "ícone", container: "container", section: "seção",
    header: "header", footer: "footer", navigation: "menu", form: "formulário", field: "campo",
    main: "conteúdo principal", article: "artigo", aside: "bloco lateral"
  };
  return labels[kind] || kind || "elemento";
}

function inferVisualOperation(promptText = $("agentPrompt")?.value || "") {
  const prompt = String(promptText || "").toLowerCase();
  const selected = state.visualSelections.length;
  const attachments = visualSelectionAttachmentCount();
  if (state.visualSelections.some((item) => item.deleteRequested)) {
    return { mode: "delete", label: tx("Modo interpretado: exclusão do elemento selecionado.", "Interpreted mode: delete selected element.") };
  }
  if (state.visualSelections.some((item) => item.move && (Number(item.move.dx) || Number(item.move.dy)))) {
    return { mode: "move", label: tx("Modo interpretado: movimento visual responsivo do elemento selecionado.", "Interpreted mode: responsive visual movement of the selected element.") };
  }
  if (/slide|slideshow|slider|carrossel|carousel|altern(ar|e)|rotativ/.test(prompt) && selected >= 1 && attachments >= 2) {
    return { mode: "slideshow", label: `Modo interpretado: slideshow com ${attachments} anexos no elemento selecionado.` };
  }
  if (/mover|mov(a|e)|desloc|reposicion|acima|abaixo|antes|depois|lado/.test(prompt) && selected >= 1) {
    return { mode: "move", label: "Modo interpretado: reorganização do elemento selecionado." };
  }
  if (attachments === selected && attachments > 0) return { mode: "paired", label: `${attachments} anexo(s) disponíveis em ordem para ${selected} elemento(s).` };
  if (selected === 1 && attachments > 1) return { mode: "multi-resource", label: `${attachments} anexos disponíveis para transformar o elemento selecionado conforme o comando.` };
  if (attachments > 0) return { mode: "resources", label: `${attachments} anexo(s) disponíveis. O Codex seguirá o comando, sem exigir correspondência numérica.` };
  return { mode: "structure", label: "Elemento selecionado como alvo. O comando pode mover, editar, remover ou reorganizar esse elemento." };
}

function renderVisualSelections() {
  const panel = $("visualSelectionPanel");
  const list = $("visualSelectionList");
  if (!panel || !list) return;
  const count = state.visualSelections.length;
  panel.classList.toggle("hidden", count === 0);
  $("visualSelectionCount").textContent = tx(
    `${count} ${count === 1 ? "item selecionado" : "itens selecionados"}`,
    `${count} ${count === 1 ? "item selected" : "items selected"}`
  );
  const attachments = visualSelectionAttachmentCount();
  const pairStatus = $("visualSelectionPairStatus");
  const routeStatus = $("visualSelectionRouteStatus");
  const routes = [...new Set(state.visualSelections.map((item) => item.route).filter(Boolean))];
  const selectedRoute = routes.length === 1 ? routes[0] : (state.visualSelectionRoute || "");
  if (routeStatus) {
    routeStatus.textContent = selectedRoute ? `Página selecionada: ${selectedRoute}` : tx("Página: não identificada", "Page: not identified");
    routeStatus.classList.toggle("is-ok", routes.length === 1);
    routeStatus.classList.toggle("is-error", routes.length > 1);
  }
  panel.classList.remove("pair-error", "pair-ok");
  if (!count) {
    pairStatus.textContent = tx("Selecione qualquer elemento no preview.", "Select any element in the preview.");
  } else {
    pairStatus.textContent = inferVisualOperation().label;
    panel.classList.add("pair-ok");
  }
  $("selectPreviewBtn")?.classList.toggle("is-active", state.visualSelectionActive);
  list.innerHTML = "";
  state.visualSelections.forEach((selection, index) => {
    const item = document.createElement("div");
    item.className = "visual-selection-item";
    const order = document.createElement("span");
    order.className = "visual-selection-order";
    order.textContent = String(index + 1);
    const thumb = selection.source ? document.createElement("img") : document.createElement("div");
    thumb.className = `visual-selection-thumb${selection.source ? "" : " visual-selection-placeholder"}`;
    if (selection.source) { thumb.src = selection.source; thumb.alt = ""; }
    else thumb.textContent = selectedElementLabel(selection).slice(0, 2).toUpperCase();
    const info = document.createElement("div");
    info.className = "visual-selection-info";
    const name = document.createElement("strong");
    name.textContent = selection.alt || selection.directText || selection.nearestHeading || selection.nearbyText || selection.sourceFile || `${selectedElementLabel(selection)} selecionado`;
    const crop = selection.crop || null;
    const move = selection.move || null;
    const meta = document.createElement("span");
    if (selection.deleteRequested) {
      meta.textContent = `${selectedElementLabel(selection)} • ${selection.route || "rota desconhecida"} • ${tx("marcado para exclusão", "marked for deletion")}`;
    } else if (move && (Number(move.dx) || Number(move.dy))) {
      const alignment = move.alignment?.reference ? ` • ${tx("alinhado com", "aligned with")} ${move.alignment.reference}` : "";
      meta.textContent = `${selectedElementLabel(selection)} • ΔX ${Math.round(move.dx || 0)}px • ΔY ${Math.round(move.dy || 0)}px${alignment}`;
    } else {
      meta.textContent = crop
        ? `${selectedElementLabel(selection)} • ${selection.route || "rota desconhecida"} • X ${Math.round(crop.x ?? 50)}% • Y ${Math.round(crop.y ?? 50)}% • ${Math.round((crop.zoom || 1) * 100)}% • ${Math.round(crop.rotation || 0)}°`
        : `${selectedElementLabel(selection)} • ${selection.tagName || "elemento"} • ${selection.route || "rota desconhecida"} • ${selection.width || 0}×${selection.height || 0}`;
    }
    info.append(name, meta);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "visual-crop-button";
    edit.textContent = isMediaSelection(selection) ? tx("Ajustar", "Adjust") : tx("Selecionado", "Selected");
    edit.disabled = !isMediaSelection(selection);
    if (isMediaSelection(selection)) edit.addEventListener("click", () => editVisualSelection(selection.key));
    item.append(order, thumb, info, edit);
    list.appendChild(item);
  });
  updateVisualCommandModeUi();
}

async function ensurePreviewPermission(previewUrl) {
  const parsed = new URL(previewUrl);
  const origin = `${parsed.protocol}//${parsed.hostname}/*`;
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return await chrome.permissions.request({ origins: [origin] });
}

async function focusOrOpenProjectPreview({ refresh = false, focus = true, silent = false } = {}) {
  if (!state.currentProject) return null;
  const data = await simpleProjectAction("preview/start", tx("Preview verificado", "Preview verified"), { silent });
  let previewUrl = data?.preview?.url || state.currentProject?.preview?.url;
  if (!previewUrl) throw new Error(tx("Não foi possível iniciar o preview local.", "Could not start the local preview."));
  const granted = await ensurePreviewPermission(previewUrl);
  if (!granted) throw new Error(tx("O Chrome não autorizou acesso ao preview local.", "Chrome did not grant access to the local preview."));
  const result = await chrome.runtime.sendMessage({
    type: refresh ? "preview-refresh" : "preview-focus-or-open",
    previewUrl,
    projectKey: visualProjectKey(),
    tabId: state.visualSelectionTabId,
    focus,
    cleanupDuplicates: true
  });
  if (!result?.ok) throw new Error(result?.error || tx("Não foi possível atualizar o preview.", "Could not update preview."));
  state.visualSelectionTabId = result.tabId || state.visualSelectionTabId;
  state.visualSelectionPreviewUrl = String(result.actualUrl || state.visualSelectionPreviewUrl || previewUrl);
  if (!silent && Number(result.closedDuplicates || 0) > 0) {
    log(tx("Preview unificado", "Preview unified"), tx(
      `${result.closedDuplicates} aba(s) duplicada(s) do preview foram fechadas.`,
      `${result.closedDuplicates} duplicate preview tab(s) were closed.`
    ));
  }
  return result;
}

async function startVisualSelection() {
  if (!state.currentProject) return;
  const data = await simpleProjectAction("preview/start", tx("Preview verificado", "Preview verified"));
  let previewUrl = data?.preview?.url || state.currentProject?.preview?.url;
  if (!previewUrl) throw new Error(tx("Não foi possível iniciar o preview local.", "Could not start the local preview."));
  const granted = await ensurePreviewPermission(previewUrl);
  if (!granted) throw new Error(tx("O Chrome não autorizou acesso ao preview local.", "Chrome did not grant access to the local preview."));
  state.visualSelectionSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await chrome.runtime.sendMessage({
    type: "visual-selection-start",
    previewUrl,
    projectKey: visualProjectKey(),
    sessionId: state.visualSelectionSessionId,
    selections: state.visualSelections
  });
  if (!result?.ok) throw new Error(result?.error || tx("Falha ao iniciar a seleção.", "Failed to start selection."));
  state.visualSelectionActive = true;
  state.visualSelectionTabId = result.tabId;
  state.visualSelectionRoute = String(result.actualRoute || "");
  state.visualSelectionPreviewUrl = String(result.actualUrl || previewUrl);
  renderVisualSelections();
  const discarded = Number(result.discardedSelections || 0);
  const note = discarded ? ` ${discarded} seleção(ões) de outra página foram descartadas.` : "";
  log(tx("Seleção visual ativada", "Visual selection enabled"), `Página vinculada: ${state.visualSelectionRoute || "não identificada"}.${note} Clique em qualquer elemento; Ctrl/Cmd adiciona outros. Em imagens, duplo clique ajusta posição, zoom e rotação.`);
}

async function sendVisualCommand(payload) {
  const previewUrl = state.currentProject?.preview?.url;
  if (!previewUrl) throw new Error(tx("Preview local indisponível.", "Local preview unavailable."));
  const result = await chrome.runtime.sendMessage({ type: "visual-selection-command", previewUrl, projectKey: visualProjectKey(), tabId: state.visualSelectionTabId, payload });
  if (!result?.ok) throw new Error(result?.error || tx("Falha na comunicação com o preview.", "Preview communication failed."));
  return result.data;
}

async function clearVisualSelections() {
  state.visualSelections = [];
  state.visualSelectionActive = false;
  state.useVisualSelectionForCommand = false;
  state.visualSelectionRoute = "";
  state.visualSelectionPreviewUrl = "";
  renderVisualSelections();
  await saveVisualSelections();
  try { await sendVisualCommand({ type: "lb-visual-selection-clear" }); } catch {}
}

async function editVisualSelection(key) {
  try { await sendVisualCommand({ type: "lb-visual-selection-edit", key }); }
  catch (error) { log(tx("Ajuste de imagem", "Image adjustment"), error.message); }
}

async function recoverVisualPreviewAfterFailure() {
  if (!state.visualSelections.length || !state.currentProject?.preview?.url) return;
  const response = await chrome.runtime.sendMessage({
    type: "visual-selection-recover",
    previewUrl: state.currentProject.preview.url,
    projectKey: visualProjectKey(),
    sessionId: state.visualSelectionSessionId || `${Date.now()}-recovery`,
    tabId: state.visualSelectionTabId,
    selections: state.visualSelections
  });
  if (!response?.ok) throw new Error(response?.error || tx("Não foi possível recuperar a seleção.", "Could not recover selection."));
  state.visualSelectionActive = true;
  state.visualSelectionTabId = response.tabId || state.visualSelectionTabId;
  state.visualSelectionRoute = String(response.actualRoute || state.visualSelectionRoute || "");
  state.visualSelectionPreviewUrl = String(response.actualUrl || state.visualSelectionPreviewUrl || "");
  renderVisualSelections();
}

async function validateVisualSelectionRoute({ silent = false } = {}) {
  if (!state.visualSelections.length) throw new Error(tx("Nenhum elemento está selecionado.", "No image is selected."));
  let live = await sendVisualCommand({ type: "lb-visual-selection-get" });
  const firstLiveCount = Array.isArray(live?.selections) ? live.selections.length : 0;
  if (firstLiveCount === 0 && state.visualSelections.length > 0) {
    await recoverVisualPreviewAfterFailure();
    live = await sendVisualCommand({ type: "lb-visual-selection-get" });
  }
  const selectedRoutes = [...new Set(state.visualSelections.map((item) => item.route).filter(Boolean))];
  const liveRoute = String(live?.route || "");
  const expectedRoute = selectedRoutes.length === 1 ? selectedRoutes[0] : "";
  if (!expectedRoute) throw new Error(tx("A seleção não possui uma rota única. Limpe e selecione novamente na página correta.", "The selection does not have one unique route. Clear it and select again on the correct page."));
  if (!liveRoute || liveRoute !== expectedRoute) {
    throw new Error(`Seleção bloqueada antes de usar IA: os itens pertencem a ${expectedRoute}, mas a aba vinculada está em ${liveRoute || "rota desconhecida"}. Abra a página correta e selecione novamente.`);
  }
  if (Array.isArray(live?.selections) && live.selections.length !== state.visualSelections.length) {
    throw new Error(`Seleção bloqueada: o painel registra ${state.visualSelections.length} item(ns), mas a página vinculada confirma ${live.selections.length}. Reative a seleção antes de enviar.`);
  }
  state.visualSelectionRoute = liveRoute;
  state.visualSelectionPreviewUrl = String(live?.previewUrl || state.visualSelectionPreviewUrl || "");
  renderVisualSelections();
  await saveVisualSelections();
  if (!silent) log("Seleção validada sem usar IA", `Página: ${liveRoute}
Aba: ${state.visualSelectionPreviewUrl}
Itens: ${state.visualSelections.length}
Nenhum token do Codex foi consumido.`);
  return live;
}

function visualSelectionContext(userPrompt) {
  if (!state.visualSelections.length) return userPrompt;
  const attachments = visualSelectionAttachmentCount();
  const operation = inferVisualOperation(userPrompt);
  const instruction = userPrompt || tx("Aplique somente a alteração visual configurada no elemento selecionado.", "Apply only the configured visual change to the selected element.");
  const targets = state.visualSelections.map((selection, index) => {
    const crop = selection.crop || null;
    const lines = [
      `Item ${index + 1}`,
      `Rota atual: ${selection.route || "/"}`,
      `Tipo semântico: ${selectedElementLabel(selection)}`,
      `Tag HTML: ${selection.tagName || selection.type || "não informada"}`,
      `Role: ${selection.role || "não informado"}`,
      `Dimensões no preview: ${selection.width || 0} x ${selection.height || 0}px`,
      `Seletor DOM do preview: ${selection.selector || "não informado"}`,
      `Hierarquia visual: ${selection.hierarchy || "não informada"}`,
      `ID: ${selection.elementId || "não informado"}`,
      `Classes: ${selection.className || "não informadas"}`,
      `Pista do componente: ${selection.sourceLocationHint || "não informada"}`,
      `Título próximo: ${selection.nearestHeading || ""}`,
      `Texto direto: ${selection.directText || ""}`,
      `Texto próximo: ${selection.nearbyText || ""}`
    ];
    if (selection.source) lines.push(
      `Arquivo provável: ${selection.sourcePathHint || selection.sourceFile || "não identificado"}`,
      `Nome do arquivo: ${selection.sourceFile || "não identificado"}`,
      `Atributo src original: ${selection.sourceAttribute || "não informado"}`,
      `Fonte exibida: ${compactVisualSource(selection) || "não informada"}`,
      `Alt: ${selection.alt || ""}`
    );
    if (crop) lines.push(`Enquadramento: X ${Math.round(crop.x ?? 50)}%; Y ${Math.round(crop.y ?? 50)}%; zoom ${Math.round((crop.zoom || 1) * 100)}%; rotação ${Math.round(crop.rotation || 0)} graus.`);
    if (selection.move && (Number(selection.move.dx) || Number(selection.move.dy))) {
      lines.push(
        `Movimento visual solicitado: ΔX ${Math.round(selection.move.dx || 0)}px; ΔY ${Math.round(selection.move.dy || 0)}px.`,
        `Viewport usado como referência: ${selection.move.viewportWidth || 0} x ${selection.move.viewportHeight || 0}px.`,
        `Retângulo original: ${JSON.stringify(selection.move.originalRect || {})}.`,
        `Retângulo visual final: ${JSON.stringify(selection.move.finalRect || {})}.`,
        `Alinhamento detectado: ${JSON.stringify(selection.move.alignment || {})}.`,
        "Interprete o deslocamento como intenção de layout. Use Grid, Flexbox, ordem, margem, gap ou hierarquia; não grave translate/position:absolute como solução permanente, salvo se o componente já usar posicionamento livre."
      );
    }
    if (selection.deleteRequested) lines.push("AÇÃO PENDENTE: remover definitivamente este elemento do código, sem criar placeholder vazio.");
    return lines.join("\n");
  }).join("\n\n");
  return `${instruction}\n\n--- CONTEXTO VISUAL UNIVERSAL DO LOVABLE BRIDGE ---\nModo interpretado: ${operation.mode}\nElementos selecionados: ${state.visualSelections.length}\nAnexos disponíveis: ${attachments}\n${targets}\n\nREGRAS OBRIGATÓRIAS:\n- Use os elementos selecionados como alvos exatos do pedido.\n- A ação é definida pelo texto do usuário: substituir, mover, reorganizar, estilizar, remover, adicionar conteúdo ou transformar o componente.\n- Os anexos são recursos ordenados disponíveis para o comando e NÃO precisam ter a mesma quantidade dos elementos.\n- Se o usuário pedir slideshow, slider ou carrossel em um único elemento, use todos os anexos nesse elemento, na ordem recebida, preservando o tamanho e a proporção do container.\n- Se o usuário pedir substituições individuais em lote, associe os anexos aos elementos pela ordem somente quando isso fizer sentido no pedido.\n- Se o pedido mover um elemento, trate ΔX/ΔY como referência visual e altere a estrutura do layout com a menor mudança segura, usando Grid, Flexbox, ordem, margem, gap ou hierarquia e preservando responsividade.\n- Se o item estiver marcado para exclusão, remova apenas o elemento selecionado e ajuste o layout resultante sem deixar espaços artificiais.\n- Preserve páginas, elementos e ocorrências não selecionadas, salvo quando uma alteração direta no container pai for indispensável para cumprir o pedido.\n- O seletor DOM é uma pista do preview; localize no código por rota, hierarquia, classes, texto próximo, arquivo e componente.\n- Para imagens, preserve object-fit/object-position e o enquadramento configurado quando aplicável.\n- Não modifique elementos semelhantes em outras páginas.\n--- FIM DO CONTEXTO VISUAL ---`;
}

async function applyVisualPosition() {
  if (!state.visualSelections.length) return;
  if (totalAttachmentCount() > 0) {
    log(tx("Alteração visual", "Visual change"), tx("Remova os anexos antes de aplicar somente movimento, exclusão ou enquadramento.", "Remove attachments before applying only movement, deletion, or framing."));
    return;
  }
  const hasDelete = state.visualSelections.some((item) => item.deleteRequested);
  const hasMove = state.visualSelections.some((item) => item.move && (Number(item.move.dx) || Number(item.move.dy)));
  const onlyMedia = state.visualSelections.every((item) => isMediaSelection(item));
  const previousPrompt = $("agentPrompt").value;
  state.useVisualSelectionForCommand = true;
  updateVisualCommandModeUi();
  if (hasDelete) {
    $("agentPrompt").value = tx(
      "Remova definitivamente do código somente os elementos selecionados marcados para exclusão. Não crie placeholders vazios. Ajuste o layout ao redor e preserve todos os outros elementos, conteúdo e páginas.",
      "Permanently remove from code only the selected elements marked for deletion. Do not create empty placeholders. Adjust the surrounding layout and preserve every other element, content, and page."
    );
  } else if (hasMove) {
    $("agentPrompt").value = tx(
      "Reposicione os elementos selecionados conforme o movimento visual registrado no preview. Use o deslocamento e as linhas de alinhamento como referência de intenção. Converta o resultado em layout responsivo com Grid, Flexbox, ordem, margens, gap ou hierarquia correta. Não use translate ou position:absolute como solução permanente, a menos que o componente original já use posicionamento livre. Preserve mobile e tablet.",
      "Reposition the selected elements according to the visual movement recorded in the preview. Use displacement and alignment guides as intent references. Convert the result into a responsive layout using Grid, Flexbox, order, margins, gap, or the correct hierarchy. Do not use translate or position:absolute as the permanent solution unless the original component already uses free positioning. Preserve mobile and tablet."
    );
  } else if (onlyMedia) {
    $("agentPrompt").value = tx(
      "Aplique somente a posição, o enquadramento, o zoom e a rotação configurados nas imagens selecionadas. Não substitua as imagens e não altere outros elementos.",
      "Apply only the configured position, framing, zoom, and rotation to the selected images. Do not replace images or change other elements."
    );
  } else {
    log(tx("Aplicar posição", "Apply position"), tx("Ative Mover no preview, use as setas ou marque um elemento para exclusão antes de aplicar.", "Enable Move in the preview, use the arrow keys, or mark an element for deletion before applying."));
    return;
  }
  let completed = false;
  try { completed = await runAgent(); }
  finally {
    if (!completed) $("agentPrompt").value = previousPrompt;
  }
}

function renderCurrentProject() {
  const project = state.currentProject;
  $("projectRepo").textContent = project.repo;
  $("projectTitle").textContent = project.displayName;
  $("projectBranch").textContent = project.status.branch;
  $("projectChanges").textContent = String(project.status.changedCount);
  $("projectSync").textContent = project.status.behind > 0
    ? tx(`${project.status.behind} atrás`, `${project.status.behind} behind`)
    : project.status.ahead > 0
      ? tx(`${project.status.ahead} à frente`, `${project.status.ahead} ahead`)
      : tx("Sincronizado", "Synced");
  $("previewLabel").textContent = project.preview.running
    ? tx(`Preview ativo: ${project.preview.url}`, `Preview active: ${project.preview.url}`)
    : tx("Preview parado.", "Preview stopped.");
  $("assetSyncLabel").textContent = tx("Verificando mídias do projeto...", "Checking project media...");
  loadLovableAssetStatus().catch((error) => {
    $("assetSyncLabel").textContent = `Não foi possível verificar as mídias: ${error.message}`;
  });
  $("commitInput").value = `${tx("Atualizar", "Update")} ${project.displayName}`;
}


async function loadLovableAssetStatus() {
  if (!state.currentProject) return null;
  const data = await api(profilePath(`/projects/${state.currentProject.id}/lovable-assets`));
  const label = $("assetSyncLabel");
  if (!data.total) {
    label.textContent = "Este projeto não usa mídias armazenadas pelo Lovable.";
  } else if (!data.missing) {
    label.textContent = `${data.cached}/${data.total} mídias disponíveis no preview local.`;
  } else {
    label.textContent = `${data.missing} de ${data.total} mídias ainda precisam ser sincronizadas.`;
  }
  return data;
}

async function syncLovableAssets(options = {}) {
  if (!state.currentProject) return;
  try {
    const manifest = await loadLovableAssetStatus();
    if (!manifest?.total) {
      if (!options.automatic) log("Sincronização de imagens", "Este projeto não possui arquivos .asset.json do Lovable.");
      return { ok: true, skipped: true, details: "O projeto não usa mídias .asset.json do Lovable." };
    }
    if (!manifest.missing) {
      if (!options.automatic) log("Sincronização de imagens", "Todas as mídias já estão disponíveis no preview local.");
      return { ok: true, skipped: true, details: `${manifest.cached}/${manifest.total} mídias já estavam disponíveis.` };
    }

    const tab = await currentTab();
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
      if (options.automatic) return { ok: false, skipped: true, details: "Sincronização automática de mídias adiada: nenhuma página online compatível estava ativa." };
      throw new Error("Abra a versão online do site ou o preview do Lovable nesta aba antes de sincronizar.");
    }

    const sourceOrigin = new URL(tab.url).origin + "/*";
    const hasSourceAccess = await chrome.permissions.contains({ origins: [sourceOrigin] });
    if (!hasSourceAccess) {
      const granted = await chrome.permissions.request({ origins: [sourceOrigin] });
      if (!granted) {
        if (options.automatic) return { ok: false, skipped: true, details: "Sincronização automática de mídias adiada: permissão da página não concedida." };
        throw new Error("O Chrome não autorizou a leitura das imagens desta página.");
      }
    }

    $("jobOverlay").classList.remove("hidden");
    $("jobStage").textContent = "Sincronizando imagens do Lovable...";
    $("jobProgress").style.width = "10%";
    $("jobLog").textContent = `Procurando ${manifest.missing} mídia(s) na aba atual...`;

    const result = await chrome.runtime.sendMessage({
      type: "sync-lovable-assets",
      tabId: tab.id,
      tabUrl: tab.url,
      assets: manifest.assets.filter((item) => !item.cached),
      localApi: {
        profileId: state.activeProfile.id,
        projectId: state.currentProject.id
      }
    });

    if (!result?.ok) throw new Error(result?.error || "A sincronização falhou.");
    $("jobProgress").style.width = "100%";
    $("jobLog").textContent = result.details || `${result.synced} mídia(s) sincronizada(s).`;
    await new Promise((resolve) => setTimeout(resolve, 500));
    $("jobOverlay").classList.add("hidden");
    await loadLovableAssetStatus();
    const details = result.details || `${result.synced} mídia(s) copiadas para o cache local.`;
    if (!options.automatic) log("Imagens sincronizadas", details);
    return { ...result, details };
  } catch (error) {
    $("jobOverlay").classList.add("hidden");
    if (!options.automatic) log("Erro ao sincronizar imagens", error.message);
    return { ok: false, error: error.message, details: `Sincronização automática de mídias adiada: ${error.message}` };
  }
}

async function refreshCurrentProject() {
  if (state.currentProject) await openProject(state.currentProject.id);
}

async function simpleProjectAction(action, title, options = {}) {
  if (!state.currentProject) return null;
  try {
    const data = await api(profilePath(`/projects/${state.currentProject.id}/${action}`), {
      method: "POST",
      body: options.body
    });
    if (!options.silent) log(title, data);
    await refreshCurrentProject();
    return data;
  } catch (error) {
    log(options.errorTitle || `Erro: ${title}`, error.message);
    throw error;
  }
}

function getDefaultPromptTemplates() {
  return [
  {
    id: "default-hero-image",
    name: tx("Trocar imagem da hero", "Replace hero image"),
    text: tx(
      "Substitua apenas a imagem principal da hero section pela imagem anexada. Mantenha os textos, botões, espaçamentos, cores, overlay, altura da seção e responsividade. Não altere nenhuma outra seção ou página.",
      "Replace only the main hero section image with the attached image. Keep all text, buttons, spacing, colors, overlay, section height, and responsive behavior. Do not change any other section or page."
    )
  },
  {
    id: "default-font",
    name: tx("Alterar fonte sem mudar o layout", "Change font without changing layout"),
    text: tx(
      "Altere somente a fonte indicada no pedido. Preserve tamanhos, pesos, cores, espaçamentos, quebras de linha, responsividade e todos os demais elementos do layout.",
      "Change only the font specified in the request. Preserve sizes, weights, colors, spacing, line breaks, responsive behavior, and every other layout element."
    )
  },
  {
    id: "default-mobile",
    name: tx("Corrigir versão mobile", "Fix mobile layout"),
    text: tx(
      "Corrija somente a responsividade da seção indicada para celular. Preserve a aparência no desktop, os textos, imagens, cores e demais seções.",
      "Fix only the mobile responsiveness of the specified section. Preserve the desktop appearance, text, images, colors, and all other sections."
    )
  },
  {
    id: "default-logo",
    name: tx("Substituir logo", "Replace logo"),
    text: tx(
      "Substitua a logo atual pela imagem anexada em todos os locais onde a logo principal aparece. Preserve proporção, nitidez, espaçamentos e responsividade. Não altere outros elementos da marca.",
      "Replace the current logo with the attached image everywhere the main logo appears. Preserve proportions, sharpness, spacing, and responsive behavior. Do not change other brand elements."
    )
  },
  {
    id: "default-seo-links",
    name: tx("Auditar links e redirects", "Audit links and redirects"),
    text: tx(
      "Audite todas as rotas e links internos. Liste links quebrados, códigos 404/410/500/503, redirects 301/302/307/308, cadeias, loops e canonicals inconsistentes. Não altere arquivos; entregue primeiro um relatório organizado com a rota, o problema e a correção recomendada.",
      "Audit every route and internal link. List broken links, 404/410/500/503 responses, 301/302/307/308 redirects, chains, loops, and inconsistent canonicals. Do not modify files; first provide an organized report with the route, issue, and recommended fix."
    )
  },
  {
    id: "default-seo-pages",
    name: tx("Auditar SEO de todas as páginas", "Audit SEO on every page"),
    text: tx(
      "Audite titles, meta descriptions, canonical, og:url, headings, URLs, robots.txt, sitemap.xml e dados estruturados de todas as rotas públicas. Não faça alterações. Liste duplicados, ausentes, tamanhos inadequados e recomendações exatas por página.",
      "Audit titles, meta descriptions, canonical, og:url, headings, URLs, robots.txt, sitemap.xml, and structured data across all public routes. Do not make changes. List duplicates, missing items, unsuitable lengths, and exact recommendations for each page."
    )
  },
  {
    id: "default-performance",
    name: tx("Auditar performance e mobile", "Audit performance and mobile"),
    text: tx(
      "Analise performance e versão mobile. Verifique LCP, CLS, INP, recursos que bloqueiam renderização, JavaScript e CSS não utilizados, imagens e fontes grandes, overflow, tamanhos de toque, espaçamento e navegação. Não altere arquivos; entregue relatório com prioridade, causa e correção sugerida.",
      "Analyze performance and the mobile experience. Check LCP, CLS, INP, render-blocking resources, unused JavaScript and CSS, large images and fonts, overflow, tap targets, spacing, and navigation. Do not modify files; provide a report with priority, cause, and suggested fix."
    )
  },
  {
    id: "default-forms-email",
    name: tx("Configurar formulários e e-mail", "Configure forms and email"),
    text: tx(
      "Analise todos os formulários do site e conecte os envios ao back-end existente. Salve os dados quando aplicável, envie notificações aos destinatários informados, defina reply-to como o e-mail do cliente, adicione logs de envio e preserve o design atual. Nunca grave segredos reais no código ou em arquivos .env versionados.",
      "Analyze every form on the site and connect submissions to the existing backend. Store data when applicable, send notifications to the provided recipients, set reply-to to the customer's email, add send logs, and preserve the current design. Never write real secrets into code or versioned .env files."
    )
  }
];
}

async function loadPromptTemplates() {
  const stored = await chrome.storage.local.get("lovableBridgePromptTemplatesV1");
  const templates = stored.lovableBridgePromptTemplatesV1;
  const defaults = getDefaultPromptTemplates();
  if (Array.isArray(templates) && templates.length) {
    state.promptTemplates = templates.map((item) => {
      const localized = defaults.find((defaultItem) => defaultItem.id === item.id);
      return localized ? { ...item, name: localized.name, text: localized.text } : item;
    });
    for (const defaultItem of defaults) {
      if (!state.promptTemplates.some((item) => item.id === defaultItem.id)) state.promptTemplates.push({ ...defaultItem });
    }
    await savePromptTemplates();
  } else {
    state.promptTemplates = defaults.map((item) => ({ ...item }));
    await savePromptTemplates();
  }
}

async function savePromptTemplates() {
  await chrome.storage.local.set({ lovableBridgePromptTemplatesV1: state.promptTemplates });
}

function renderPromptTemplates(query = "") {
  const container = $("promptTemplateList");
  const normalized = query.trim().toLowerCase();
  const items = state.promptTemplates.filter((item) =>
    !normalized || item.name.toLowerCase().includes(normalized) || item.text.toLowerCase().includes(normalized)
  );
  container.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "prompt-empty";
    empty.textContent = tx("Nenhum prompt encontrado.", "No prompts found.");
    container.appendChild(empty);
    return;
  }
  for (const template of items) {
    const item = document.createElement("div");
    item.className = "prompt-template-item";
    const main = document.createElement("div");
    main.className = "prompt-template-main";
    const name = document.createElement("strong");
    name.textContent = template.name;
    const preview = document.createElement("span");
    preview.textContent = template.text;
    main.append(name, preview);
    main.addEventListener("click", () => {
      $("agentPrompt").value = template.text;
      $("promptModal").classList.add("hidden");
      $("agentPrompt").focus();
    });
    const remove = document.createElement("button");
    remove.className = "prompt-template-delete";
    remove.type = "button";
    remove.title = tx("Excluir prompt", "Delete prompt");
    remove.textContent = "×";
    remove.addEventListener("click", async () => {
      if (!confirm(tx(`Excluir o prompt "${template.name}"?`, `Delete prompt "${template.name}"?`))) return;
      state.promptTemplates = state.promptTemplates.filter((item) => item.id !== template.id);
      await savePromptTemplates();
      renderPromptTemplates($("promptSearchInput").value);
    });
    item.append(main, remove);
    container.appendChild(item);
  }
}

async function openPromptLibrary() {
  await loadPromptTemplates();
  $("promptSearchInput").value = "";
  renderPromptTemplates();
  $("promptModal").classList.remove("hidden");
}

async function createPromptTemplate() {
  const name = $("newPromptName").value.trim();
  const text = $("newPromptText").value.trim();
  if (name.length < 2 || text.length < 4) {
    log(tx("Preencha o nome e o texto do prompt.", "Enter a prompt name and text."));
    return;
  }
  state.promptTemplates.unshift({ id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, text });
  await savePromptTemplates();
  $("newPromptName").value = "";
  $("newPromptText").value = "";
  renderPromptTemplates();
}

const ALLOWED_MEDIA_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "svg", "avif",
  "mp4", "mov", "webm", "avi"
]);

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function totalAttachmentCount() {
  return state.mediaFiles.length + state.historyAttachments.length;
}

function addMediaFiles(fileList) {
  const incoming = Array.from(fileList || []);
  const available = 10 - totalAttachmentCount();
  if (available <= 0) {
    log(tx("Limite de anexos", "Attachment limit"), tx("O máximo é de 10 imagens ou vídeos por comando.", "The maximum is 10 images or videos per command."));
    return;
  }
  const accepted = [];
  for (const file of incoming) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_MEDIA_EXTENSIONS.has(extension)) {
      log(tx("Formato não permitido", "Unsupported format"), file.name);
      continue;
    }
    accepted.push(file);
    if (accepted.length >= available) break;
  }
  state.mediaFiles.push(...accepted);
  if (incoming.length > available) {
    log(tx("Limite de anexos", "Attachment limit"), tx("Somente os primeiros arquivos até o limite de 10 foram adicionados.", "Only the first files up to the limit of 10 were added."));
  }
  renderMediaFiles();
}

function renderMediaFiles() {
  const container = $("mediaList");
  container.innerHTML = "";
  $("mediaCounter").textContent = `${totalAttachmentCount()}/10`;

  state.historyAttachments.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "media-item history-media";
    const thumb = document.createElement("div");
    thumb.className = "media-thumb";
    thumb.textContent = String(file.mimeType || "").startsWith("video/") ? "▶" : "IMG";
    const info = document.createElement("div");
    info.className = "media-info";
    const name = document.createElement("strong");
    name.textContent = file.originalName || file.archiveName;
    const size = document.createElement("span");
    size.className = "media-saved";
    size.textContent = `${formatBytes(Number(file.size || 0))} • ${tx("anexo salvo", "saved attachment")}`;
    info.append(name, size);
    const remove = document.createElement("button");
    remove.className = "media-remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.title = tx("Remover anexo", "Remove attachment");
    remove.addEventListener("click", () => {
      state.historyAttachments.splice(index, 1);
      renderMediaFiles();
      if (state.editingHistoryDraft) saveEditDraft().catch(() => {});
    });
    item.append(thumb, info, remove);
    container.appendChild(item);
  });

  state.mediaFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "media-item";
    const thumb = document.createElement("div");
    thumb.className = "media-thumb";
    if (file.type.startsWith("image/") && file.type !== "image/svg+xml") {
      const image = document.createElement("img");
      const url = URL.createObjectURL(file);
      image.src = url;
      image.onload = () => URL.revokeObjectURL(url);
      thumb.appendChild(image);
    } else {
      thumb.textContent = file.type.startsWith("video/") ? "▶" : "IMG";
    }
    const info = document.createElement("div");
    info.className = "media-info";
    const name = document.createElement("strong");
    name.textContent = file.name;
    const size = document.createElement("span");
    size.textContent = formatBytes(file.size);
    info.append(name, size);
    const remove = document.createElement("button");
    remove.className = "media-remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.title = tx("Remover anexo", "Remove attachment");
    remove.addEventListener("click", () => {
      state.mediaFiles.splice(index, 1);
      renderMediaFiles();
    });
    item.append(thumb, info, remove);
    container.appendChild(item);
  });
  renderVisualSelections();
}

async function uploadMediaFiles() {
  if (!state.mediaFiles.length) return [];
  const form = new FormData();
  state.mediaFiles.forEach((file) => form.append("files", file, file.name));
  $("jobOverlay").classList.remove("hidden");
  $("jobStage").textContent = tx("Copiando imagens e vídeos para o projeto...", "Copying images and videos to the project...");
  $("jobProgress").style.width = "8%";
  $("jobLog").textContent = `${state.mediaFiles.length} arquivo(s)`;
  const result = await apiForm(profilePath(`/projects/${state.currentProject.id}/media`), form);
  return result.attachments || [];
}

function shortOpenCodeModelLabel(model, fallbackName = "") {
  if (fallbackName) return String(fallbackName).replace(/\s*\(grátis\)\s*$/i, "");
  const raw = String(model || "").replace(/^openrouter\//, "").replace(/:free$/i, "");
  if (!raw) return tx("modelo gratuito", "free model");
  return raw.split("/").pop().replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderOpenCodeModels(data = {}) {
  const select = $("openCodeModelSelect");
  if (!select) return;
  const models = Array.isArray(data.models) ? data.models : state.openCodeModels;
  const selected = String(data.selected || state.openCodeModel || state.health?.openCodeModel || "");
  state.openCodeModels = models;
  state.openCodeModel = selected;
  state.openCodeModelName = String(data.selectedName || state.openCodeModelName || state.health?.openCodeModelName || "");
  state.openCodeModelsLoaded = Boolean(models.length);

  select.innerHTML = "";
  if (!models.length) {
    const option = document.createElement("option");
    option.value = selected;
    option.textContent = tx("Nenhum modelo carregado", "No model loaded");
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  for (const model of models) {
    const option = document.createElement("option");
    option.value = String(model.id || "");
    const recommended = model.recommended ? "★ " : "";
    option.textContent = `${recommended}${String(model.name || model.id || "").replace(/\s*\(free\)\s*$/i, " (grátis)")}`;
    option.selected = option.value === selected;
    select.appendChild(option);
  }
  select.disabled = false;
  if (selected && [...select.options].some((option) => option.value === selected)) select.value = selected;
  select.title = data.warning
    ? data.warning
    : tx("Escolha um modelo gratuito com suporte a ferramentas de edição.", "Choose a free model with editing-tool support.");
}

async function loadOpenCodeModels({ force = false, silent = true } = {}) {
  if (state.openCodeModelsLoading) return;
  state.openCodeModelsLoading = true;
  const select = $("openCodeModelSelect");
  const refresh = $("openCodeRefreshModelsBtn");
  if (select) select.disabled = true;
  if (refresh) refresh.disabled = true;
  try {
    const path = force ? "/api/opencode/models/refresh" : "/api/opencode/models";
    const data = await api(path, force ? { method: "POST", body: {} } : {});
    renderOpenCodeModels(data);
    state.health = {
      ...(state.health || {}),
      openCodeModel: data.selected,
      openCodeModelName: data.selectedName
    };
    updateEngineUi();
    if (!silent) {
      const detail = data.warning
        ? `${data.models.length} ${tx("modelos de fallback disponíveis", "fallback models available")}. ${data.warning}`
        : `${data.models.length} ${tx("modelos gratuitos com ferramentas disponíveis", "free tool-capable models available")}.`;
      log(tx("Modelos do OpenCode atualizados", "OpenCode models updated"), detail);
    }
  } catch (error) {
    if (!silent) log(tx("Não foi possível carregar os modelos do OpenCode", "Could not load OpenCode models"), error.message);
  } finally {
    state.openCodeModelsLoading = false;
    if (select) select.disabled = !state.openCodeModels.length;
    if (refresh) refresh.disabled = false;
  }
}

async function saveOpenCodeModel(model) {
  const select = $("openCodeModelSelect");
  if (!model || state.openCodeModelsLoading) return;
  if (select) select.disabled = true;
  try {
    const data = await api("/api/opencode/model", { method: "POST", body: { model } });
    renderOpenCodeModels(data);
    state.health = {
      ...(state.health || {}),
      openCodeModel: data.selected,
      openCodeModelName: data.selectedName
    };
    updateEngineUi();
    log(tx("Modelo do OpenCode selecionado", "OpenCode model selected"), `${data.selectedName}\n${data.selected}`);
  } catch (error) {
    log(tx("Não foi possível trocar o modelo do OpenCode", "Could not change the OpenCode model"), error.message);
    await loadOpenCodeModels({ silent: true }).catch(() => {});
  } finally {
    if (select) select.disabled = false;
  }
}

function updateEngineUi() {
  const select = $("engineSelect");
  const antigravityOption = select.querySelector('option[value="antigravity"]');
  const openCodeOption = select.querySelector('option[value="opencode"]');
  if (antigravityOption) {
    const available = Boolean(state.health?.antigravityInstalled);
    antigravityOption.disabled = !available;
    antigravityOption.textContent = available
      ? "Antigravity (Google)"
      : tx("Antigravity (não instalado)", "Antigravity (not installed)");
  }
  if (openCodeOption) {
    const available = Boolean(state.health?.openCodeInstalled);
    openCodeOption.disabled = !available;
    openCodeOption.textContent = available
      ? "OpenCode (experimental)"
      : tx("OpenCode (não instalado)", "OpenCode (not installed)");
  }
  if (select.value === "antigravity" && !state.health?.antigravityInstalled) select.value = "codex";
  if (select.value === "opencode" && !state.health?.openCodeInstalled) select.value = "codex";
  state.engine = normalizeEngine(select.value);
  const codexSetupRow = $("codexSetupRow");
  const openCodeSetupRow = $("openCodeSetupRow");
  if (codexSetupRow) {
    const hidden = state.engine !== "codex";
    codexSetupRow.classList.toggle("hidden", hidden);
    codexSetupRow.hidden = hidden;
  }
  if (openCodeSetupRow) {
    const hidden = state.engine !== "opencode";
    openCodeSetupRow.classList.toggle("hidden", hidden);
    openCodeSetupRow.hidden = hidden;
  }
  const codexConfigured = Boolean(state.health?.codexBusinessConfigured);
  const codexSetupBtn = $("codexSetupBtn");
  if (codexSetupBtn) {
    codexSetupBtn.textContent = codexConfigured
      ? tx("↻ Reconfigurar Codex Business", "↻ Reconfigure Codex Business")
      : tx("⚙ Configurar Codex Business", "⚙ Configure Codex Business");
  }
  const openCodeModelHint = $("openCodeModelHint");
  const selectedOpenCodeName = shortOpenCodeModelLabel(
    state.openCodeModel || state.health?.openCodeModel,
    state.openCodeModelName || state.health?.openCodeModelName
  );
  if (openCodeModelHint) openCodeModelHint.textContent = tx(
    `Modelo selecionado: ${selectedOpenCodeName}. Até 60s para iniciar; segunda tentativa automática quando responder sem editar.`,
    `Selected model: ${selectedOpenCodeName}. Up to 60s to start; automatic second attempt when it responds without editing.`
  );
  if (state.engine === "codex") {
    $("engineHint").textContent = codexConfigured
      ? tx("Codex Business configurado • patch seguro • build automático", "Codex Business configured • safe patch • automatic build")
      : tx("Codex Business precisa ser configurado antes do primeiro comando", "Codex Business must be configured before the first command");
    $("engineHint").classList.toggle("warning", !codexConfigured);
  } else if (state.engine === "antigravity") {
    $("engineHint").textContent = tx("Google conectado • sujeito à cota da conta", "Google connected • subject to account quota");
    $("engineHint").classList.add("warning");
  } else {
    $("engineHint").textContent = tx(
      `${selectedOpenCodeName} • grátis via OpenRouter • segunda tentativa se não editar`,
      `${selectedOpenCodeName} • free via OpenRouter • second attempt if no edit`
    );
    $("engineHint").classList.remove("warning");
  }
  chrome.storage.local.set({ lovableBridgeEngineV4: state.engine }).catch(() => {});
  updateWorkModeUi();
  updateCodexModelUi();
  if (state.engine === "codex" && !state.codexModelsLoaded) loadCodexModels({ silent: true }).catch(() => {});
}

async function loadEnginePreference() {
  ensureWorkModeUi();
  ensureCodexModelUi();
  const stored = await chrome.storage.local.get(["lovableBridgeEngineV4", "lovableBridgeWorkModeV2", "lovableBridgeWorkModeV1", "lovableBridgeCodexModelPreferenceV1"]);
  const preference = stored.lovableBridgeEngineV4 || "codex";
  state.engine = normalizeEngine(preference);
  state.workMode = normalizeWorkMode(stored.lovableBridgeWorkModeV2 || stored.lovableBridgeWorkModeV1 || "auto");
  state.codexModelPreference = normalizeCodexModelPreference(stored.lovableBridgeCodexModelPreferenceV1 || "auto");
  $("engineSelect").value = state.engine;
  updateEngineUi();
  updateWorkModeUi();
  updateCodexModelUi();
  if (state.engine === "codex") await loadCodexModels({ silent: true }).catch(() => {});
}

async function runAgent() {
  const userPrompt = $("agentPrompt").value.trim();
  const useVisualSelection = Boolean(state.useVisualSelectionForCommand && state.visualSelections.length);
  if (userPrompt.length < 4 && !useVisualSelection) {
    log(tx("Descreva a alteração desejada.", "Describe the requested change."));
    return;
  }
  let prompt;
  try {
    if (useVisualSelection) await validateVisualSelectionRoute({ silent: true });
    prompt = useVisualSelection ? visualSelectionContext(userPrompt) : userPrompt;
  }
  catch (error) { log(tx("Seleção visual", "Visual selection"), error.message); return; }
  if (state.engine === "codex") {
    try {
      const status = await api("/api/codex/status");
      state.health = { ...(state.health || {}), codexBusinessConfigured: status.configured, codexBusinessVerified: status.verified };
      updateEngineUi();
      if (!status.authenticated) {
        log(tx("Codex Business não conectado", "Codex Business not connected"), tx("Clique em ‘Configurar Codex Business’, conclua o login e depois clique em ‘Verificar conexão’. Nenhum token foi consumido.", "Click ‘Configure Codex Business’, finish sign-in, then click ‘Verify connection’. No tokens were used."));
        return;
      }
    } catch (error) {
      log(tx("Não foi possível verificar o Codex Business", "Could not verify Codex Business"), error.message);
      return;
    }
    const stored = await chrome.storage.local.get("lovableBridgeCodexNoticeAcceptedV1");
    if (!stored.lovableBridgeCodexNoticeAcceptedV1) {
      const accepted = confirm(tx(
        "O Codex Business usa a cota ou os créditos do workspace Firmino conectado. O Bridge aplica apenas patches validados, executa Safety Guard e build antes de manter a alteração. Continuar?",
        "Codex Business uses the quota or credits of the connected Firmino workspace. Bridge applies only validated patches and runs Safety Guard and build before keeping a change. Continue?"
      ));
      if (!accepted) return;
      await chrome.storage.local.set({ lovableBridgeCodexNoticeAcceptedV1: true });
    }
  }
  if (state.engine === "opencode") {
    if (!state.openCodeModelsLoaded) await loadOpenCodeModels({ silent: true }).catch(() => {});
    const selectedName = shortOpenCodeModelLabel(
      state.openCodeModel || state.health?.openCodeModel,
      state.openCodeModelName || state.health?.openCodeModelName
    );
    const stored = await chrome.storage.local.get("lovableBridgeOpenCodeNoticeAcceptedV2");
    if (!stored.lovableBridgeOpenCodeNoticeAcceptedV2) {
      const accepted = confirm(tx(
        `O OpenCode usará o modelo gratuito “${selectedName}” pelo OpenRouter. Ele terá até 60 segundos para iniciar e fará uma segunda tentativa automática se responder sem editar arquivos. Você pode cancelar a qualquer momento. Continuar?`,
        `OpenCode will use the free “${selectedName}” model through OpenRouter. It has up to 60 seconds to start and will automatically try once more if it responds without editing files. You can cancel at any time. Continue?`
      ));
      if (!accepted) return;
      await chrome.storage.local.set({ lovableBridgeOpenCodeNoticeAcceptedV2: true });
    }
  }
  try {
    const attachments = await uploadMediaFiles();
    const data = await api(profilePath(`/projects/${state.currentProject.id}/agent`), {
      method: "POST",
      body: {
        prompt,
        attachments,
        historyAttachments: state.historyAttachments,
        engine: state.engine,
        workMode: state.workMode,
        uiLocale: UI_LOCALE,
        codexModelPreference: state.engine === "codex" ? state.codexModelPreference : "auto",
        openCodeModel: state.engine === "opencode" ? (state.openCodeModel || state.health?.openCodeModel || "") : "",
        useVisualSelection,
        visualSelections: useVisualSelection ? state.visualSelections : []
      }
    });
    const result = await pollJob(data.jobId, { cancelable: state.engine === "opencode" || state.engine === "codex" });
    const successTitle = tx(`Alteração concluída com ${engineLabel(state.engine)}`, `Change completed with ${engineLabel(state.engine)}`);
    const successContent = result.agentOutput || result;
    state.mediaFiles = [];
    state.historyAttachments = [];
    renderMediaFiles();
    await clearEditDraft();
    $("agentPrompt").value = "";
    if (useVisualSelection) await clearVisualSelections();
    await refreshCurrentProject();
    let previewWarning = "";
    if (result.preview?.url) {
      try {
        await focusOrOpenProjectPreview({ refresh: true, focus: false, silent: true });
      } catch (previewError) {
        previewWarning = tx(
          `A alteração foi mantida, mas a atualização automática do preview falhou: ${previewError.message}`,
          `The change was kept, but the automatic preview refresh failed: ${previewError.message}`
        );
      }
    }
    const finalContent = typeof successContent === "string"
      ? [successContent, previewWarning].filter(Boolean).join("\n\n")
      : previewWarning
        ? `${JSON.stringify(successContent, null, 2)}\n\n${previewWarning}`
        : successContent;
    log(successTitle, finalContent);
    return true;
  } catch (error) {
    $("jobOverlay").classList.add("hidden");
    const label = state.engine === "opencode" ? tx("Erro do OpenCode", "OpenCode error") : (state.engine === "codex" ? tx("Erro do Codex", "Codex error") : tx("Erro do Antigravity", "Antigravity error"));
    log(label, error.message);
    if (useVisualSelection && state.visualSelections.length) {
      try {
        await recoverVisualPreviewAfterFailure();
        log(tx("Seleção preservada", "Selection preserved"), tx("O projeto foi restaurado e a seleção continua disponível para uma nova tentativa.", "The project was restored and the selection remains available for another attempt."));
      } catch (recoveryError) {
        log(tx("Recuperação da seleção", "Selection recovery"), recoveryError.message);
      }
    }
    return false;
  }
}

function historyDate(value) {
  try { return new Date(value).toLocaleString(UI_LOCALE, { dateStyle: "short", timeStyle: "short" }); }
  catch { return String(value || ""); }
}

function renderCommandHistory(history) {
  state.changeHistory = history;
  const list = $("commandHistoryList");
  const notice = $("changesNotice");
  list.innerHTML = "";
  notice.classList.add("hidden");

  if (history.existingUntrackedChanges && !history.entries.length) {
    notice.textContent = tx(
      "Existem alterações locais criadas antes desta versão. Elas continuam preservadas, mas não podem ser separadas por comando. Os próximos comandos serão registrados individualmente.",
      "There are local changes created before this version. They remain preserved, but cannot be separated by command. Future commands will be tracked individually."
    );
    notice.classList.remove("hidden");
  } else if (history.valid === false) {
    notice.textContent = tx(
      "O histórico pertence a uma versão anterior do Git. Envie, descarte ou atualize o projeto antes de gerenciar comandos individuais.",
      "The history belongs to an earlier Git state. Send, discard, or update the project before managing individual commands."
    );
    notice.classList.remove("hidden");
  }

  if (!history.entries.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = history.existingUntrackedChanges
      ? tx("Nenhum comando desta versão foi registrado ainda.", "No command from this version has been recorded yet.")
      : tx("Nenhuma alteração registrada por comando.", "No command-level changes recorded.");
    list.appendChild(empty);
    return;
  }

  history.entries.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "history-card";
    const header = document.createElement("div");
    header.className = "history-card-header";
    const title = document.createElement("strong");
    title.textContent = tx(`Comando ${entry.number}`, `Command ${entry.number}`);
    const meta = document.createElement("span");
    meta.textContent = `${engineLabel(entry.engine)} • ${historyDate(entry.createdAt)}`;
    header.append(title, meta);

    const prompt = document.createElement("div");
    prompt.className = "history-prompt";
    prompt.textContent = entry.prompt;

    const details = document.createElement("div");
    details.className = "history-meta";
    if (entry.attachments?.length) {
      const attachmentDetails = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = tx(`${entry.attachments.length} anexo(s)`, `${entry.attachments.length} attachment(s)`);
      const ul = document.createElement("ul");
      entry.attachments.forEach((file) => {
        const li = document.createElement("li");
        li.textContent = file.originalName || file.archiveName;
        ul.appendChild(li);
      });
      attachmentDetails.append(summary, ul);
      details.appendChild(attachmentDetails);
    }
    if (entry.changedFiles?.length) {
      const fileDetails = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = tx(`${entry.changedFiles.length} arquivo(s) alterado(s)`, `${entry.changedFiles.length} changed file(s)`);
      const ul = document.createElement("ul");
      entry.changedFiles.forEach((file) => {
        const li = document.createElement("li");
        li.textContent = `${file.status} ${file.path}`;
        ul.appendChild(li);
      });
      fileDetails.append(summary, ul);
      details.appendChild(fileDetails);
    }
    if (!entry.buildOk) {
      const warning = document.createElement("div");
      warning.className = "history-build-warning";
      warning.textContent = tx("O build deste comando falhou em uma versão anterior do Bridge.", "The build for this command completed with a warning or error.");
      details.appendChild(warning);
    }

    const actions = document.createElement("div");
    actions.className = "history-actions";
    const edit = document.createElement("button");
    edit.className = "button";
    edit.textContent = tx("Editar e refazer", "Edit and redo");
    edit.disabled = history.valid === false;
    edit.addEventListener("click", () => editTrackedChange(entry));
    const remove = document.createElement("button");
    remove.className = "button danger-soft";
    remove.textContent = tx("Excluir alteração", "Delete change");
    remove.disabled = history.valid === false;
    remove.addEventListener("click", () => deleteTrackedChange(entry));
    actions.append(edit, remove);
    card.append(header, prompt, details, actions);
    list.appendChild(card);
  });
}

async function openChangesModal() {
  if (!state.currentProject) return;
  try {
    const data = await api(profilePath(`/projects/${state.currentProject.id}/changes`));
    renderCommandHistory(data.history);
    $("changesModal").classList.remove("hidden");
  } catch (error) {
    log(tx("Erro ao carregar alterações", "Error loading changes"), error.message);
  }
}

async function deleteTrackedChange(entry) {
  const accepted = confirm(tx(
    `Excluir a alteração do comando ${entry.number}? As outras alterações serão preservadas sempre que puderem ser reaplicadas com segurança.`,
    `Delete the change from command ${entry.number}? Other changes will be preserved whenever they can be reapplied safely.`
  ));
  if (!accepted) return;
  try {
    const data = await api(profilePath(`/projects/${state.currentProject.id}/changes/${entry.id}`), { method: "DELETE" });
    const result = await pollJob(data.jobId);
    renderCommandHistory(result.history);
    await refreshCurrentProject();
    log(tx("Alteração excluída", "Change deleted"), tx("O projeto foi reconstruído sem esse comando.", "The project was rebuilt without that command."));
    if (result.preview?.url) await focusOrOpenProjectPreview({ refresh: true, focus: false });
  } catch (error) {
    log(tx("Não foi possível excluir", "Could not delete"), error.message);
  }
}

async function editTrackedChange(entry) {
  const accepted = confirm(tx(
    `Remover a alteração do comando ${entry.number} e carregar o texto e os anexos para edição? Você precisará enviar o comando novamente.`,
    `Remove the change from command ${entry.number} and load its text and attachments for editing? You will need to send the command again.`
  ));
  if (!accepted) return;
  try {
    const data = await api(profilePath(`/projects/${state.currentProject.id}/changes/${entry.id}/edit`), { method: "POST" });
    const result = await pollJob(data.jobId);
    $("agentPrompt").value = result.draft?.prompt || entry.prompt;
    state.engine = normalizeEngine(result.draft?.engine || entry.engine);
    $("engineSelect").value = state.engine;
    updateEngineUi();
    state.historyAttachments = Array.isArray(result.draft?.attachments) ? result.draft.attachments : [];
    state.editingHistoryDraft = true;
    state.mediaFiles = [];
    renderMediaFiles();
    await saveEditDraft();
    $("changesModal").classList.add("hidden");
    await refreshCurrentProject();
    $("agentPrompt").focus();
    $("agentPrompt").scrollIntoView({ behavior: "smooth", block: "center" });
    log(tx("Comando pronto para edição", "Command ready to edit"), tx("A alteração antiga foi removida. Edite o texto ou substitua os anexos e envie novamente.", "The previous change was removed. Edit the text or replace the attachments, then send it again."));
  } catch (error) {
    log(tx("Não foi possível editar", "Could not edit"), error.message);
  }
}

async function commitPush() {
  const button = $("commitPushBtn");
  const input = $("commitInput");
  const idleLabel = tx("Enviar ao Lovable", "Send to Lovable");
  try {
    if (!state.activeProfile) throw new Error(tx("Nenhum perfil ativo.", "No active profile."));
    if (!state.activeProfile.github?.connected || !state.activeProfile.github?.login) {
      throw new Error(tx("Conecte uma conta GitHub a este perfil antes de publicar.", "Connect a GitHub account to this profile before publishing."));
    }
    if (!state.currentProject?.id) throw new Error(tx("Nenhum projeto está selecionado.", "No project is selected."));

    const message = String(input?.value || "").trim();
    if (message.length < 3 || message.length > 160) {
      throw new Error(tx("A descrição deve ter entre 3 e 160 caracteres.", "The description must be between 3 and 160 characters."));
    }

    button.disabled = true;
    button.classList.add("is-busy");
    button.textContent = tx("Preparando...", "Preparing...");
    log(
      tx("Preparando envio ao Lovable", "Preparing Lovable publish"),
      tx(
        `Validando o projeto ${state.currentProject.displayName || state.currentProject.name || state.currentProject.id} e a conta ${state.activeProfile.github.login}.`,
        `Validating project ${state.currentProject.displayName || state.currentProject.name || state.currentProject.id} and account ${state.activeProfile.github.login}.`
      )
    );

    const data = await api(profilePath(`/projects/${state.currentProject.id}/commit-push`), {
      method: "POST",
      body: { message }
    });
    if (!data.jobId) throw new Error(tx("O Companion não iniciou a publicação.", "The Companion did not start the publish job."));

    button.textContent = tx("Enviando...", "Sending...");
    const result = await pollJob(data.jobId, {
      onUpdate(job) {
        const stage = String(job?.stage || "").trim();
        if (stage) button.textContent = stage.length > 24 ? tx("Enviando...", "Sending...") : stage;
      }
    });
    if (result?.conflictResolved) {
      const files = Array.isArray(result.conflictFiles) && result.conflictFiles.length
        ? `\n\n${tx("Arquivos conciliados", "Reconciled files")}:\n- ${result.conflictFiles.join("\n- ")}`
        : "";
      const backup = result.backupBranch
        ? `\n\n${tx("Backup local de segurança", "Local safety backup")}: ${result.backupBranch}`
        : "";
      log(
        tx("Enviado ao Lovable com conflito resolvido", "Sent to Lovable with conflict resolved"),
        `${result.message || ""}${files}${backup}`
      );
    } else {
      log(tx("Enviado ao Lovable", "Sent to Lovable"), result);
    }
    state.historyAttachments = [];
    renderMediaFiles();
    await clearEditDraft();
    await refreshCurrentProject();
  } catch (error) {
    log(tx("Erro ao enviar", "Send error"), error?.message || String(error));
  } finally {
    button.disabled = false;
    button.classList.remove("is-busy");
    button.textContent = idleLabel;
  }
}

async function useCurrentTab() {
  const tab = await currentTab();
  if (!tab?.url || !tab.url.includes("lovable.dev")) {
    log("A aba atual não é do Lovable.");
    return;
  }
  $("lovableUrlInput").value = tab.url;
}

async function linkCurrentTab() {
  const tab = await currentTab();
  if (!tab?.url || !tab.url.includes("lovable.dev")) {
    log("Abra primeiro o projeto no Lovable.");
    return;
  }
  await simpleProjectAction("link-lovable", "Projeto vinculado ao Lovable", { body: { url: tab.url } });
}

$("cancelJobBtn")?.addEventListener("click", cancelActiveJob);
$("retryBtn").addEventListener("click", openHome);
$("firstProfileBtn").addEventListener("click", () => showView("createProfile"));
$("createProfileBtn").addEventListener("click", createProfile);
$("connectGithubBtn").addEventListener("click", connectGithub);
$("manageProfileBtn").addEventListener("click", openManageProfile);
$("changeGithubBtn").addEventListener("click", () => {
  if (state.activeProfile.github.connected) disconnectGithub({ reconnect: true });
  else connectGithub();
});
$("disconnectGithubBtn").addEventListener("click", () => disconnectGithub());
$("addAnotherProfileBtn").addEventListener("click", () => showView("createProfile"));
$("deleteProfileBtn").addEventListener("click", deleteProfile);
$("profileSelect").addEventListener("change", (event) => activateProfile(event.target.value));
$("refreshPortfolioBtn").addEventListener("click", openHome);
$("addProjectBtn").addEventListener("click", openAddView);
$("repoSearch").addEventListener("input", (event) => renderRepos(event.target.value));
$("prepareProjectBtn").addEventListener("click", prepareSelectedRepo);
$("useCurrentTabBtn").addEventListener("click", useCurrentTab);
$("projectRefreshBtn").addEventListener("click", refreshCurrentProject);
$("agentPrompt").addEventListener("input", () => { if (state.visualSelections.length) renderVisualSelections(); });
$("sendAgentBtn").addEventListener("click", runAgent);
$("commitPushBtn").addEventListener("click", commitPush);
$("buildBtn").addEventListener("click", () => simpleProjectAction("build", "Build concluído", { errorTitle: tx("Build falhou", "Build failed") }));
$("pullBtn").addEventListener("click", () => simpleProjectAction("pull", "Projeto atualizado"));
$("showChangesBtn").addEventListener("click", openChangesModal);
$("syncLovableAssetsBtn").addEventListener("click", syncLovableAssets);
$("previewStartBtn").addEventListener("click", async () => {
  try { await focusOrOpenProjectPreview({ refresh: false, focus: true }); }
  catch (error) { log(tx("Preview", "Preview"), error.message); }
});
$("previewOpenBtn").addEventListener("click", async () => {
  try { await focusOrOpenProjectPreview({ refresh: false, focus: true }); }
  catch (error) { log(tx("Preview", "Preview"), error.message); }
});
$("previewStopBtn").addEventListener("click", () => simpleProjectAction("preview/stop", "Preview parado"));
$("openLovableBtn").addEventListener("click", () => {
  if (state.currentProject?.lovableUrl) chrome.tabs.create({ url: state.currentProject.lovableUrl });
  else log("Este projeto ainda não possui endereço do Lovable vinculado.");
});
$("linkLovableBtn").addEventListener("click", linkCurrentTab);
$("discardBtn").addEventListener("click", async () => {
  if (confirm("Descartar as alterações locais deste projeto?")) {
    await simpleProjectAction("discard", tx("Alterações descartadas", "Changes discarded"));
    state.historyAttachments = [];
    renderMediaFiles();
    await clearEditDraft();
  }
});
$("removeProjectBtn").addEventListener("click", async () => {
  if (!confirm("Remover este projeto do perfil? Os arquivos locais serão preservados.")) return;
  try {
    await api(profilePath(`/projects/${state.currentProject.id}`), { method: "DELETE" });
    state.currentProject = null;
    await openHome();
  } catch (error) {
    log(tx("Erro ao remover projeto", "Project removal error"), error.message);
  }
});
$("clearLogBtn").addEventListener("click", () => { $("logOutput").textContent = tx("Resultado limpo.", "Result cleared."); });

document.querySelectorAll("[data-back='home']").forEach((button) => {
  button.addEventListener("click", openHome);
});

$("collapsePanelBtn").addEventListener("click", async () => {
  const result = await chrome.runtime.sendMessage({ type: "close-panel" });
  if (!result?.ok) log("Não foi possível recolher o painel", result?.error || "Erro desconhecido");
});

$("selectPreviewBtn")?.addEventListener("click", () => startVisualSelection().catch((error) => log(tx("Seleção visual", "Visual selection"), error.message)));
$("clearVisualSelectionBtn")?.addEventListener("click", () => clearVisualSelections().catch((error) => log(tx("Seleção visual", "Visual selection"), error.message)));
$("validateVisualSelectionBtn")?.addEventListener("click", () => validateVisualSelectionRoute().catch((error) => log("Validação da página", error.message)));
$("applyVisualPositionBtn")?.addEventListener("click", () => applyVisualPosition().catch((error) => log(tx("Posição da imagem", "Image position"), error.message)));
$("useVisualSelectionCheckbox")?.addEventListener("change", (event) => {
  state.useVisualSelectionForCommand = Boolean(event.target.checked && state.visualSelections.length);
  updateVisualCommandModeUi();
});

$("attachMediaBtn").addEventListener("click", () => $("mediaInput").click());
$("mediaInput").addEventListener("change", (event) => {
  addMediaFiles(event.target.files);
  event.target.value = "";
});
const dropZone = $("mediaDropZone");
["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
});
dropZone.addEventListener("drop", (event) => addMediaFiles(event.dataTransfer.files));

$("codexSetupBtn")?.addEventListener("click", async () => {
  try {
    const reset = Boolean(state.health?.codexBusinessConfigured);
    if (reset && !confirm(tx(
      "Reconfigurar o Codex Business? O login isolado atual sera guardado como backup e uma nova autorizacao sera iniciada.",
      "Reconfigure Codex Business? The current isolated sign-in will be backed up and a new authorization will start."
    ))) return;

    const started = await api("/api/codex/setup", { method: "POST", body: { reset } });
    if (!started?.jobId) throw new Error(tx("O Companion nao iniciou o login.", "The Companion did not start sign-in."));

    let openedUrl = "";
    const result = await pollJob(started.jobId, {
      cancelable: true,
      onUpdate(job) {
        const clean = String(job?.log || "").replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
        const matches = clean.match(/https?:\/\/[^\s<>"']+/gi) || [];
        const url = matches
          .map((value) => value.replace(/[),.;]+$/, ""))
          .find((value) => {
            try {
              const parsed = new URL(value);
              return parsed.protocol === "https:"
                && (parsed.hostname === "auth.openai.com" || parsed.hostname.endsWith(".openai.com"));
            } catch {
              return false;
            }
          }) || "";
        if (url && url !== openedUrl) {
          openedUrl = url;
          setTimeout(() => {
            chrome.tabs.query({}).then((tabs) => {
              const existing = tabs.find((tab) => {
                try {
                  return tab?.url && new URL(tab.url).hostname === "auth.openai.com";
                } catch {
                  return false;
                }
              });
              if (existing?.id) {
                chrome.tabs.update(existing.id, { active: true }).catch(() => {});
              } else {
                chrome.tabs.create({ url }).catch(() => {});
              }
            }).catch(() => chrome.tabs.create({ url }).catch(() => {}));
          }, 1200);
        }
      }
    });

    state.health = {
      ...(state.health || {}),
      codexBusinessConfigured: Boolean(result?.configured),
      codexBusinessVerified: Boolean(result?.verified)
    };
    updateEngineUi();
    log(
      tx("Codex Business conectado", "Codex Business connected"),
      result?.detail || tx("Login confirmado.", "Sign-in confirmed.")
    );
  } catch (error) {
    log(tx("Falha ao configurar o Codex Business.", "Failed to configure Codex Business."), error.message);
  }
});

$("codexVerifyBtn")?.addEventListener("click", async () => {
  try {
    const status = await api("/api/codex/status");
    state.health = { ...(state.health || {}), codexBusinessConfigured: status.configured, codexBusinessVerified: status.verified };
    updateEngineUi();
    if (status.authenticated) {
      log(tx("Codex Business conectado", "Codex Business connected"), status.detail || tx("Login confirmado.", "Sign-in confirmed."));
    } else {
      log(tx("Codex Business ainda não conectado", "Codex Business is not connected yet"), tx("Conclua o login normal do ChatGPT na pagina oficial aberta e tente verificar novamente.", "Finish the standard ChatGPT sign-in on the official page that opened and verify again."));
    }
  } catch (error) {
    log(tx("Falha ao verificar o Codex Business.", "Failed to verify Codex Business."), error.message);
  }
});

$("openCodeSetupBtn")?.addEventListener("click", async () => {
  try {
    await api("/api/opencode/setup", { method: "POST", body: {} });
    log(tx(
      "O configurador do OpenCode foi aberto em uma nova janela. Crie ou copie sua chave no OpenRouter e conclua o login no terminal.",
      "The OpenCode setup was opened in a new window. Create or copy your OpenRouter key and finish login in the terminal."
    ));
  } catch (error) {
    log(tx("Não foi possível abrir o configurador do OpenCode.", "Could not open OpenCode setup."), error.message);
  }
});
$("openCodeModelSelect")?.addEventListener("change", (event) => saveOpenCodeModel(event.target.value));
$("openCodeRefreshModelsBtn")?.addEventListener("click", () => loadOpenCodeModels({ force: true, silent: false }));
$("engineSelect").addEventListener("change", () => {
  updateEngineUi();
  if (state.engine === "opencode") loadOpenCodeModels({ silent: true }).catch(() => {});
  if (state.engine === "codex") loadCodexModels({ silent: true }).catch(() => {});
  if (state.editingHistoryDraft) saveEditDraft().catch(() => {});
});
$("agentPrompt").addEventListener("input", () => { if (state.editingHistoryDraft) saveEditDraft().catch(() => {}); });

$("promptLibraryBtn").addEventListener("click", openPromptLibrary);
$("closePromptModalBtn").addEventListener("click", () => $("promptModal").classList.add("hidden"));
$("promptSearchInput").addEventListener("input", (event) => renderPromptTemplates(event.target.value));
$("savePromptTemplateBtn").addEventListener("click", createPromptTemplate);
$("promptModal").addEventListener("click", (event) => { if (event.target === $("promptModal")) $("promptModal").classList.add("hidden"); });

$("closeChangesModalBtn").addEventListener("click", () => $("changesModal").classList.add("hidden"));
$("changesModal").addEventListener("click", (event) => { if (event.target === $("changesModal")) $("changesModal").classList.add("hidden"); });

$("nativeConnectionBtn")?.addEventListener("click", runNativeConnectionTest);
$("nativeDiagnosticsBtn")?.addEventListener("click", runNativeDiagnostics);

(async () => {
  await loadLanguagePreference().catch(() => {});
  applyUiLocale();
  ensureLanguageUi();
  await loadHealth().catch(() => false);

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "visual-selection-update") return;
  if (message.projectKey !== visualProjectKey()) return;
  state.visualSelections = Array.isArray(message.selections) ? message.selections.slice(0, 10) : [];
  state.visualSelectionActive = Boolean(message.active);
  state.visualSelectionRoute = String(message.currentRoute || state.visualSelections[0]?.route || "");
  state.visualSelectionPreviewUrl = String(message.previewUrl || "");
  if (sender?.tab?.id) state.visualSelectionTabId = sender.tab.id;
  if (!state.visualSelections.length) state.useVisualSelectionForCommand = false;
  else state.useVisualSelectionForCommand = true;
  renderVisualSelections();
  saveVisualSelections().catch(() => {});
});

  chrome.runtime.sendMessage({ type: "panel-opened" }).catch(() => {});
  renderMediaFiles();
  await loadPromptTemplates().catch(() => {});
  await loadEnginePreference().catch(() => {});
  await openHome();
})();
