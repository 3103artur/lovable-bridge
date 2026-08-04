"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");
const http = require("http");
const crypto = require("crypto");
const os = require("os");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const APP_DIR = __dirname;
const IS_WINDOWS = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const USER_HOME = process.env.USERPROFILE || process.env.HOME || os.homedir();
const USER_ROOT = IS_WINDOWS
  ? path.join(process.env.LOCALAPPDATA || path.join(USER_HOME, "AppData", "Local"), "LovableBridgeNative")
  : path.join(USER_HOME, "Library", "Application Support", "LovableBridgeNative");
const SETTINGS_PATH = path.join(USER_ROOT, "Config", "settings.json");
const LOG_DIR = path.join(USER_ROOT, "Logs");
const LOG_PATH = path.join(LOG_DIR, "companion-v1.6.0.log");
const AGENT_USAGE_PATH = path.join(LOG_DIR, "agent-usage.jsonl");
const HISTORY_ROOT = path.join(USER_ROOT, "History");
const SYSTEM_ROOT = IS_WINDOWS ? (process.env.SystemRoot || process.env.WINDIR || "C:\\Windows") : "/";
const SYSTEM32_DIR = IS_WINDOWS ? path.join(SYSTEM_ROOT, "System32") : "/usr/bin";
const EXPLORER_EXE = IS_WINDOWS ? path.join(SYSTEM_ROOT, "explorer.exe") : "/usr/bin/open";
const CMD_EXE = IS_WINDOWS ? path.join(SYSTEM32_DIR, "cmd.exe") : null;
const TASKKILL_EXE = IS_WINDOWS ? path.join(SYSTEM32_DIR, "taskkill.exe") : null;
const HOST_PLATFORM_BUILD = "R22-macOS";
const MEDIA_LIMIT = 10;
const MAX_MEDIA_BYTES = 150 * 1024 * 1024;
const ALLOWED_MEDIA_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif",
  ".mp4", ".mov", ".webm", ".avi"
]);

fs.mkdirSync(LOG_DIR, { recursive: true });

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temp, filePath);
}

function now() {
  return new Date().toISOString();
}

function trim(value, max = 30000) {
  const text = String(value || "");
  return text.length <= max ? text : text.slice(-max);
}

function stripAnsi(value) {
  return String(value || "").replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function summarizeBuildFailure(error, project = null) {
  const raw = stripAnsi(error?.message || error || "O build falhou.").replace(/\r/g, "");
  let file = "";
  let line = null;
  let column = null;
  let detail = "";

  const routeMatch = raw.match(/Error transforming route file\s+(.+?):\s*(SyntaxError:\s*[^\n]+?)\s*\((\d+):(\d+)\)/i);
  if (routeMatch) {
    file = routeMatch[1].trim();
    detail = routeMatch[2].trim();
    line = Number(routeMatch[3]);
    column = Number(routeMatch[4]);
  }

  if (!file) {
    const locationMatch = raw.match(/((?:[A-Za-z]:[\\/]|\/)[^\n]+?\.(?:tsx?|jsx?|mjs|cjs|css|scss|json))(?::|\()(\d+):(\d+)\)?/i);
    if (locationMatch) {
      file = locationMatch[1].trim();
      line = Number(locationMatch[2]);
      column = Number(locationMatch[3]);
    }
  }

  if (!detail) {
    const syntaxMatch = raw.match(/SyntaxError:\s*([^\n]+)/i);
    const errorMatch = raw.match(/(?:^|\n)(?:Error:\s*)?([^\n]*(?:Unexpected token|failed|error)[^\n]*)/i);
    detail = (syntaxMatch?.[1] || errorMatch?.[1] || "O código gerado não passou no build.").trim();
  }

  if (file && project?.path) {
    try {
      const relative = path.relative(project.path, file);
      if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) file = relative.replace(/\\/g, "/");
    } catch {}
  }

  return { raw, file, line, column, detail: trim(detail, 500) };
}

function buildFailureUserMessage(summary, options = {}) {
  const lines = [options.heading || "O build falhou."];
  if (summary.file) lines.push(`Arquivo: ${summary.file}`);
  if (summary.line) lines.push(`Linha ${summary.line}${summary.column ? `, coluna ${summary.column}` : ""}`);
  if (summary.detail) lines.push(`Erro: ${summary.detail}`);
  if (options.rollback) lines.push("", "A alteração deste comando foi desfeita automaticamente. As alterações anteriores foram preservadas.");
  if (options.patchPath) lines.push("", `O diff rejeitado foi salvo em:\n${options.patchPath}`);
  if (options.restoreBuildError) lines.push("", `A versão anterior foi restaurada, mas a verificação posterior também falhou:\n${trim(stripAnsi(options.restoreBuildError), 1800)}`);
  return lines.join("\n");
}

function log(message) {
  const line = `[${now()}] ${message}`;
  fs.appendFileSync(LOG_PATH, `${line}\n`, "utf8");
}

function recordAgentUsage(entry) {
  try {
    fs.appendFileSync(AGENT_USAGE_PATH, `${JSON.stringify({ timestamp: now(), ...entry })}\n`, "utf8");
  } catch (error) {
    log(`Falha ao registrar uso do agente: ${error.message}`);
  }
}

function antigravityQuotaReached(output) {
  return /individual quota reached|quota reached|rate limit|resource exhausted|resets in/i.test(String(output || ""));
}

function sanitizeFolderName(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return cleaned || `item-${Date.now()}`;
}

function slug(value) {
  return sanitizeFolderName(value).toLowerCase();
}

function normalizeSettings(settings) {
  if (!Array.isArray(settings.profiles)) settings.profiles = [];
  if (!settings.activeProfileId) settings.activeProfileId = null;
  if (!settings.profilesRoot) settings.profilesRoot = path.join(USER_ROOT, "Profiles");
  if (!settings.defaultProjectsRoot) {
    settings.defaultProjectsRoot = path.join(USER_HOME, "LovableBridgeProjects");
  }
  if (!settings.antigravity || typeof settings.antigravity !== "object") {
    settings.antigravity = { installed: true, signedIn: false };
  }
  if (!settings.openCode || typeof settings.openCode !== "object") {
    settings.openCode = {
      installed: false,
      provider: "openrouter",
      model: "openrouter/deepseek/deepseek-v4-flash:free",
      modelCatalogVersion: 2,
      configPath: path.join(USER_ROOT, "Config", "OpenCode", "opencode-bridge.json")
    };
  }
  if (!settings.openCode.provider) settings.openCode.provider = "openrouter";
  if (!settings.openCode.model) {
    settings.openCode.model = "openrouter/deepseek/deepseek-v4-flash:free";
  }
  // R6 migration: older installers fixed the OpenCode engine to NVIDIA.
  // On the first R6 load, prefer DeepSeek V4 Flash while keeping NVIDIA in the picker.
  if (Number(settings.openCode.modelCatalogVersion || 0) < 2) {
    if (settings.openCode.model === "openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free") {
      settings.openCode.model = "openrouter/deepseek/deepseek-v4-flash:free";
    }
    settings.openCode.modelCatalogVersion = 2;
  }
  if (!settings.openCode.configPath) {
    settings.openCode.configPath = path.join(USER_ROOT, "Config", "OpenCode", "opencode-bridge.json");
  }
  for (const profile of settings.profiles) {
    if (!Array.isArray(profile.projects)) profile.projects = [];
    if (!profile.github || typeof profile.github !== "object") {
      profile.github = { connected: false };
    }
    if (!profile.githubConfigDir) {
      profile.githubConfigDir = path.join(settings.profilesRoot, profile.id, "GitHub");
    }
    if (!profile.projectsRoot) {
      profile.projectsRoot = path.join(settings.defaultProjectsRoot, "Profiles", profile.id, "Projects");
    }
    if (!profile.lovable || typeof profile.lovable !== "object") {
      profile.lovable = { workspaceName: "" };
    }
  }
  return settings;
}

function loadSettings() {
  return normalizeSettings(readJson(SETTINGS_PATH));
}

function saveSettings(settings) {
  writeJson(SETTINGS_PATH, normalizeSettings(settings));
}

const jobs = new Map();
const previewProcesses = new Map();

function assertFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} não foi encontrado: ${filePath || "(não configurado)"}`);
  }
}

function firstExistingFile(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function executableFromPath(fileNames) {
  const entries = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const candidates = [];
  for (const entry of entries) {
    for (const fileName of fileNames) candidates.push(path.join(entry, fileName));
  }
  return firstExistingFile(candidates);
}

function resolveRipgrep(settings) {
  const tools = settings.tools || {};
  const standardDir = path.join(USER_ROOT, "Tools", "Ripgrep");
  const expected = path.join(standardDir, IS_WINDOWS ? "rg.exe" : "rg");
  return firstExistingFile([
    tools.ripgrep,
    tools.rg,
    expected,
    ...(IS_WINDOWS ? [path.join(standardDir, "rg.cmd"), path.join(APP_DIR, "rg.exe")] : [path.join(APP_DIR, "rg")]),
    executableFromPath(IS_WINDOWS ? ["rg.exe", "rg.cmd", "rg.bat"] : ["rg"])
  ]) || expected;
}

function getTools(settings) {
  const tools = settings.tools || {};
  const resolved = {
    git: tools.git,
    gh: tools.githubCli,
    node: tools.node,
    npm: tools.npm,
    bun: tools.bun,
    rg: resolveRipgrep(settings),
    agy: tools.antigravityCli || tools.antigravity || null,
    codex: tools.codexCli || tools.codex,
    opencode: tools.openCodeCli || tools.opencodeCli || tools.opencode || null
  };
  assertFile(resolved.git, "Git");
  assertFile(resolved.gh, "GitHub CLI");
  assertFile(resolved.node, "Node.js");
  assertFile(resolved.npm, "NPM");
  assertFile(resolved.bun, "Bun");
  assertFile(resolved.codex, "Codex CLI");
  if (resolved.agy && !fs.existsSync(resolved.agy)) resolved.agy = null;
  if (resolved.opencode && !fs.existsSync(resolved.opencode)) resolved.opencode = null;
  return resolved;
}

function configureProcessEnvironment() {
  const settings = loadSettings();
  const tools = getTools(settings);
  let candidates = [];

  if (IS_WINDOWS) {
    const gitCmd = path.dirname(tools.git);
    const gitRoot = path.dirname(gitCmd);
    const gitCore = path.join(gitRoot, "mingw64", "libexec", "git-core");
    candidates = [
      SYSTEM32_DIR,
      SYSTEM_ROOT,
      path.join(SYSTEM32_DIR, "Wbem"),
      path.join(SYSTEM32_DIR, "WindowsPowerShell", "v1.0"),
      gitCmd,
      path.join(gitRoot, "bin"),
      path.join(gitRoot, "mingw64", "bin"),
      gitCore,
      path.dirname(tools.gh),
      path.dirname(tools.node),
      path.dirname(tools.bun),
      ...(tools.rg ? [path.dirname(tools.rg)] : []),
      APP_DIR,
      ...(tools.agy ? [path.dirname(tools.agy)] : []),
      ...(tools.opencode ? [path.dirname(tools.opencode)] : []),
      path.dirname(tools.codex)
    ];
    if (fs.existsSync(gitCore)) process.env.GIT_EXEC_PATH = gitCore;
  } else {
    candidates = [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      path.join(USER_HOME, ".local", "bin"),
      path.join(USER_HOME, "bin"),
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      path.dirname(tools.git),
      path.dirname(tools.gh),
      path.dirname(tools.node),
      path.dirname(tools.bun),
      ...(tools.rg ? [path.dirname(tools.rg)] : []),
      APP_DIR,
      ...(tools.agy ? [path.dirname(tools.agy)] : []),
      ...(tools.opencode ? [path.dirname(tools.opencode)] : []),
      path.dirname(tools.codex)
    ];
  }

  const existing = [...new Set(candidates.filter((entry) => entry && fs.existsSync(entry)))];
  process.env.PATH = `${existing.join(path.delimiter)}${path.delimiter}${process.env.PATH || ""}`;
}

configureProcessEnvironment();

function getProfile(settings, profileId) {
  const profile = settings.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error("Perfil não encontrado.");
  return profile;
}

function getActiveProfile(settings) {
  if (!settings.activeProfileId) return null;
  return settings.profiles.find((item) => item.id === settings.activeProfileId) || null;
}

function profileEnv(profile) {
  return { GH_CONFIG_DIR: profile.githubConfigDir };
}

function projectKey(profileId, projectId) {
  return `${profileId}:${projectId}`;
}

function getProject(profile, projectId) {
  const project = profile.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Projeto não encontrado neste perfil.");
  return project;
}

function run(command, args, options = {}) {
  const cwd = options.cwd || APP_DIR;
  const timeoutMs = options.timeoutMs || 10 * 60 * 1000;
  const env = { ...process.env, ...(options.env || {}), NO_COLOR: "1" };
  for (const key of options.unsetEnv || []) delete env[key];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true });
    const externalSignal = options.signal || null;
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortListener);
    };
    const killTree = () => {
      try { child.kill(); } catch {}
      if (IS_WINDOWS && fs.existsSync(TASKKILL_EXE) && child.pid) {
        try {
          const killer = spawn(TASKKILL_EXE, ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore"
          });
          killer.unref();
        } catch {}
      }
    };
    const finishWithError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      killTree();
      reject(error);
    };
    const abortListener = () => {
      const reason = externalSignal?.reason;
      finishWithError(createCancelledError(reason?.message || reason || "Execução cancelada pelo usuário."));
    };

    if (options.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    timer = setTimeout(() => {
      finishWithError(new Error(`O comando excedeu ${Math.round(timeoutMs / 1000)} segundos.`));
    }, timeoutMs);

    if (externalSignal?.aborted) abortListener();
    else externalSignal?.addEventListener("abort", abortListener, { once: true });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (options.onOutput) options.onOutput(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (options.onOutput) options.onOutput(text);
    });
    child.on("error", (error) => finishWithError(error));
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      const result = {
        code,
        stdout: trim(stdout),
        stderr: trim(stderr),
        output: trim(`${stdout}${stderr}`)
      };
      if (code === 0 || options.allowFailure) resolve(result);
      else reject(new Error(result.output || `Código de saída ${code}`));
    });
  });
}

function openExternal(url) {
  let executable = null;
  let args = [];

  if (IS_WINDOWS) {
    executable = fs.existsSync(EXPLORER_EXE)
      ? EXPLORER_EXE
      : (CMD_EXE && fs.existsSync(CMD_EXE) ? CMD_EXE : null);
    args = executable === EXPLORER_EXE ? [url] : ["/d", "/c", "start", "", url];
  } else if (IS_MAC) {
    executable = "/usr/bin/open";
    args = [url];
  } else {
    return false;
  }

  if (!executable || !fs.existsSync(executable)) {
    log(`Nao foi possivel abrir o navegador: executavel do sistema nao encontrado para ${url}`);
    return false;
  }

  try {
    const child = spawn(executable, args, {
      detached: true,
      windowsHide: true,
      stdio: "ignore"
    });
    child.once("error", (error) => log(`Falha ao abrir URL ${url}: ${error.message}`));
    child.unref();
    return true;
  } catch (error) {
    log(`Falha imediata ao abrir URL ${url}: ${error.message}`);
    return false;
  }
}

function launchOpenCodeSetup() {
  const helper = path.join(USER_ROOT, "Helpers", IS_WINDOWS
    ? "CONFIGURAR-OPENCODE-OPENROUTER.cmd"
    : "CONFIGURAR-OPENCODE-OPENROUTER.command");
  assertFile(helper, "Configurador do OpenCode");
  try {
    let child;
    if (IS_WINDOWS) {
      child = spawn(CMD_EXE, ["/d", "/c", "start", "", helper], {
        detached: true, windowsHide: true, stdio: "ignore"
      });
    } else if (IS_MAC) {
      child = spawn("/usr/bin/open", [helper], {
        detached: true, stdio: "ignore"
      });
    } else {
      throw new Error("Sistema operacional não suportado pelo configurador guiado.");
    }
    child.unref();
    return { launched: true, helper };
  } catch (error) {
    throw new Error(`Não foi possível abrir o configurador do OpenCode: ${error.message}`);
  }
}

function createCancelledError(reason = "Execução cancelada pelo usuário.") {
  const error = new Error(String(reason || "Execução cancelada pelo usuário."));
  error.code = "JOB_CANCELLED";
  return error;
}

function requestJobCancellation(job, reason, source = "user") {
  if (!job || ["completed", "failed", "cancelled"].includes(job.status)) return false;
  if (!job.cancelable) return false;
  job.cancelRequested = true;
  job.cancelSource = source;
  job.cancelReason = String(reason || "Execução cancelada pelo usuário.");
  job.status = "cancelling";
  job.stage = source === "timeout" ? "Tempo limite atingido. Restaurando..." : "Cancelando e restaurando...";
  job.log = trim(`${job.log}${job.cancelReason}\n`, 50000);
  job.updatedAt = now();
  try { job._controller.abort(createCancelledError(job.cancelReason)); } catch {}
  const handler = job._cancelHandler;
  if (typeof handler === "function") {
    Promise.resolve().then(() => handler()).catch((error) => log(`Falha ao cancelar job ${job.id}: ${error.message}`));
  }
  return true;
}

function createJob(type, profileId, projectId, worker, options = {}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const controller = new AbortController();
  const job = {
    id,
    type,
    profileId: profileId || null,
    projectId: projectId || null,
    status: "running",
    progress: 0,
    stage: "Iniciando...",
    log: "",
    result: null,
    error: null,
    cancelable: Boolean(options.cancelable),
    cancelRequested: false,
    cancelSource: null,
    cancelReason: null,
    createdAt: now(),
    updatedAt: now()
  };
  Object.defineProperty(job, "_controller", { value: controller, enumerable: false });
  Object.defineProperty(job, "_cancelHandler", { value: null, writable: true, enumerable: false });
  jobs.set(id, job);

  let hardTimer = null;
  if (job.cancelable && Number(options.timeoutMs) > 0) {
    hardTimer = setTimeout(() => {
      requestJobCancellation(
        job,
        options.timeoutMessage || `A execução atingiu o limite máximo de ${Math.round(Number(options.timeoutMs) / 1000)} segundos.`,
        "timeout"
      );
    }, Number(options.timeoutMs));
  }

  const ctx = {
    signal: controller.signal,
    deadlineAt: Number(options.timeoutMs) > 0 ? Date.now() + Number(options.timeoutMs) : null,
    isCancelled() { return controller.signal.aborted; },
    throwIfCancelled() {
      if (!controller.signal.aborted) return;
      const reason = controller.signal.reason;
      throw createCancelledError(reason?.message || reason || job.cancelReason || "Execução cancelada pelo usuário.");
    },
    setCancelHandler(handler) {
      job._cancelHandler = typeof handler === "function" ? handler : null;
      if (controller.signal.aborted && job._cancelHandler) {
        Promise.resolve().then(() => job._cancelHandler()).catch(() => {});
      }
    },
    remainingMs(fallback = 60000) {
      if (!this.deadlineAt) return fallback;
      return Math.max(1, this.deadlineAt - Date.now());
    },
    update(stage, progress, output = "") {
      job.stage = stage;
      job.progress = progress;
      if (output) job.log = trim(`${job.log}${output}\n`, 50000);
      job.updatedAt = now();
    },
    append(output) {
      if (!output) return;
      job.log = trim(`${job.log}${output}`, 50000);
      job.updatedAt = now();
    }
  };

  Promise.resolve()
    .then(() => worker(ctx))
    .then((result) => {
      ctx.throwIfCancelled();
      job.status = "completed";
      job.progress = 100;
      job.stage = "Concluído";
      job.result = result || {};
      job.updatedAt = now();
    })
    .catch((error) => {
      const cancelled = controller.signal.aborted || error?.code === "JOB_CANCELLED";
      if (cancelled) {
        job.status = "cancelled";
        job.stage = job.cancelSource === "timeout" ? "Encerrado em 60 segundos" : "Execução cancelada";
        job.error = job.cancelReason || error.message || "Execução cancelada.";
      } else {
        job.status = "failed";
        job.stage = "Falhou";
        job.error = error.message || String(error);
      }
      job.updatedAt = now();
      log(`Job ${id} ${cancelled ? "cancelled" : "failed"}: ${error.stack || error.message}`);
    })
    .finally(() => {
      if (hardTimer) clearTimeout(hardTimer);
      job._cancelHandler = null;
    });

  return job;
}

function publicProfile(profile) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    lovable: profile.lovable || { workspaceName: "" },
    github: {
      connected: Boolean(profile.github?.connected),
      login: profile.github?.login || "",
      name: profile.github?.name || "",
      avatarUrl: profile.github?.avatarUrl || ""
    },
    projectCount: profile.projects.length,
    createdAt: profile.createdAt
  };
}

function createProfile(settings, input) {
  const displayName = String(input.displayName || "").trim();
  if (displayName.length < 2 || displayName.length > 50) {
    throw new Error("O nome do perfil deve ter entre 2 e 50 caracteres.");
  }
  const workspaceName = String(input.lovableWorkspace || "").trim();
  let idBase = slug(displayName);
  let id = idBase;
  let suffix = 2;
  while (settings.profiles.some((item) => item.id === id)) {
    id = `${idBase}-${suffix++}`;
  }

  const profile = {
    id,
    displayName,
    lovable: { workspaceName },
    githubConfigDir: path.join(settings.profilesRoot, id, "GitHub"),
    projectsRoot: path.join(settings.defaultProjectsRoot, "Profiles", id, "Projects"),
    github: { connected: false },
    projects: [],
    createdAt: now()
  };
  fs.mkdirSync(profile.githubConfigDir, { recursive: true });
  fs.mkdirSync(profile.projectsRoot, { recursive: true });
  settings.profiles.push(profile);
  settings.activeProfileId = profile.id;
  saveSettings(settings);
  return profile;
}

async function connectGitHub(settings, profile, ctx) {
  const tools = getTools(settings);
  fs.mkdirSync(profile.githubConfigDir, { recursive: true });
  ctx.update("Abrindo o login do GitHub...", 10);
  let opened = openExternal("https://github.com/login/device");
  const onOutput = (text) => {
    ctx.append(text);
    if (!opened && /one-time code|login\/device|device code/i.test(text)) {
      opened = true;
      openExternal("https://github.com/login/device");
      ctx.update("Autorize a conta no navegador", 35);
    }
  };

  let result;
  try {
    result = await run(
      tools.gh,
      [
        "auth", "login",
        "--hostname", "github.com",
        "--git-protocol", "https",
        "--web",
        "--clipboard"
      ],
      {
        env: profileEnv(profile),
        stdin: "y\n",
        timeoutMs: 10 * 60 * 1000,
        onOutput
      }
    );
  } catch (error) {
    if (!/unknown flag.*clipboard|flag provided but not defined.*clipboard/i.test(error.message)) throw error;
    ctx.append("A versao atual do GitHub CLI nao suporta copia automatica. Abrindo a pagina de autorizacao...\n");
    openExternal("https://github.com/login/device");
    result = await run(
      tools.gh,
      ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"],
      {
        env: profileEnv(profile),
        stdin: "y\n",
        timeoutMs: 10 * 60 * 1000,
        onOutput
      }
    );
  }
  if (!opened) openExternal("https://github.com/login/device");
  ctx.update("Confirmando a conta conectada...", 80);
  const userResult = await run(tools.gh, ["api", "user"], {
    env: profileEnv(profile),
    timeoutMs: 30000
  });
  const user = JSON.parse(userResult.stdout);
  profile.github = {
    connected: true,
    login: user.login,
    name: user.name || user.login,
    email: `${user.id}+${user.login}@users.noreply.github.com`,
    avatarUrl: user.avatar_url || "",
    connectedAt: now()
  };
  saveSettings(settings);
  return { profile: publicProfile(profile), output: result.output };
}

function disconnectGitHub(settings, profile) {
  if (fs.existsSync(profile.githubConfigDir)) {
    fs.rmSync(profile.githubConfigDir, { recursive: true, force: true });
  }
  fs.mkdirSync(profile.githubConfigDir, { recursive: true });
  profile.github = { connected: false };
  saveSettings(settings);
  return publicProfile(profile);
}

async function getGitHubAccount(settings, profile) {
  if (!profile.github?.connected) throw new Error("Conecte uma conta GitHub neste perfil.");
  const tools = getTools(settings);
  const result = await run(tools.gh, ["api", "user"], {
    env: profileEnv(profile),
    timeoutMs: 30000
  });
  const user = JSON.parse(result.stdout);
  if (profile.github.login && user.login.toLowerCase() !== profile.github.login.toLowerCase()) {
    throw new Error(`A credencial ativa (${user.login}) não corresponde ao perfil ${profile.github.login}.`);
  }
  return {
    login: user.login,
    name: user.name || user.login,
    avatarUrl: user.avatar_url || ""
  };
}

async function listRepositories(settings, profile) {
  const tools = getTools(settings);
  const account = await getGitHubAccount(settings, profile);
  const fields = "nameWithOwner,name,description,isPrivate,url,updatedAt,defaultBranchRef";
  const result = await run(
    tools.gh,
    ["repo", "list", account.login, "--limit", "200", "--json", fields],
    { env: profileEnv(profile), timeoutMs: 60000 }
  );
  return JSON.parse(result.stdout)
    .map((repo) => ({
      nameWithOwner: repo.nameWithOwner,
      name: repo.name,
      description: repo.description || "",
      isPrivate: Boolean(repo.isPrivate),
      url: repo.url,
      updatedAt: repo.updatedAt,
      defaultBranch: repo.defaultBranchRef?.name || "main"
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function normalizePermissionPath(projectPath) {
  return projectPath.replace(/\\/g, "/");
}

function ensureProjectWritePermission(projectPath) {
  const settingsFile = path.join(USER_HOME, ".gemini", "antigravity-cli", "settings.json");
  let cliSettings = {};
  if (fs.existsSync(settingsFile)) {
    try { cliSettings = readJson(settingsFile); }
    catch { throw new Error(`O arquivo de permissões do Antigravity está inválido: ${settingsFile}`); }
  }
  if (!cliSettings.permissions || typeof cliSettings.permissions !== "object") {
    cliSettings.permissions = {};
  }
  for (const key of ["allow", "deny", "ask"]) {
    if (!Array.isArray(cliSettings.permissions[key])) cliSettings.permissions[key] = [];
  }
  const normalized = normalizePermissionPath(projectPath);
  const allowRule = `write_file(${normalized})`;
  const denyGitRule = `write_file(${normalized}/.git)`;
  if (!cliSettings.permissions.allow.includes(allowRule)) cliSettings.permissions.allow.push(allowRule);
  if (!cliSettings.permissions.deny.includes(denyGitRule)) cliSettings.permissions.deny.push(denyGitRule);
  writeJson(settingsFile, cliSettings);
}

async function configureRepositoryIdentity(settings, profile, project) {
  const tools = getTools(settings);
  const env = profileEnv(profile);
  const helper = `!\"${tools.gh.replace(/\\/g, "/")}\" auth git-credential`;
  const commands = [
    ["-C", project.path, "config", "user.name", profile.github.name || profile.github.login],
    ["-C", project.path, "config", "user.email", profile.github.email],
    ["-C", project.path, "config", "--unset-all", "credential.https://github.com.helper"],
    ["-C", project.path, "config", "--add", "credential.https://github.com.helper", ""],
    ["-C", project.path, "config", "--add", "credential.https://github.com.helper", helper]
  ];
  for (const args of commands) {
    await run(tools.git, args, { env, allowFailure: args.includes("--unset-all") });
  }
}

async function gitStatus(settings, project) {
  const tools = getTools(settings);
  if (!fs.existsSync(project.path)) {
    return { exists: false, clean: true, changedCount: 0, status: "", branch: project.branch || "main", lastCommit: "", ahead: 0, behind: 0 };
  }
  const status = await run(tools.git, ["-C", project.path, "status", "--porcelain=v1", "--untracked-files=all"]);
  const branch = await run(tools.git, ["-C", project.path, "branch", "--show-current"]);
  const commit = await run(tools.git, ["-C", project.path, "log", "-1", "--pretty=%h %s"], { allowFailure: true });
  const compare = await run(
    tools.git,
    ["-C", project.path, "rev-list", "--left-right", "--count", `${project.remote || "origin"}/${project.branch}...HEAD`],
    { allowFailure: true }
  );
  let behind = 0;
  let ahead = 0;
  const counts = compare.stdout.trim().split(/\s+/).map(Number);
  if (counts.length === 2 && counts.every(Number.isFinite)) {
    behind = counts[0];
    ahead = counts[1];
  }
  const lines = status.stdout.split(/\r?\n/).filter(Boolean);
  return {
    exists: true,
    clean: lines.length === 0,
    changedCount: lines.length,
    status: status.stdout.trim(),
    branch: branch.stdout.trim(),
    lastCommit: commit.stdout.trim(),
    ahead,
    behind
  };
}

async function detectPackageManager(projectPath) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) return "none";
  try {
    const pkg = readJson(packageJsonPath);
    if (typeof pkg.packageManager === "string") {
      if (pkg.packageManager.startsWith("bun@")) return "bun";
      if (pkg.packageManager.startsWith("npm@")) return "npm";
      if (pkg.packageManager.startsWith("pnpm@")) return "pnpm";
      if (pkg.packageManager.startsWith("yarn@")) return "yarn";
    }
  } catch {}
  if (fs.existsSync(path.join(projectPath, "bun.lock")) || fs.existsSync(path.join(projectPath, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(projectPath, "yarn.lock"))) return "yarn";
  return "npm";
}

async function installDependencies(settings, projectPath, manager, ctx) {
  const tools = getTools(settings);
  if (manager === "none") {
    ctx.update("Nenhum package.json encontrado", 60);
    return;
  }
  if (manager === "bun") {
    ctx.update("Instalando dependências com Bun...", 55);
    await run(tools.bun, ["install", "--no-save"], {
      cwd: projectPath,
      timeoutMs: 20 * 60 * 1000,
      onOutput: (text) => ctx.append(text)
    });
    for (const file of ["package.json", "bun.lock", "bun.lockb", "package-lock.json"]) {
      if (fs.existsSync(path.join(projectPath, file))) {
        await run(tools.git, ["-C", projectPath, "restore", "--", file], { allowFailure: true });
      }
    }
    return;
  }
  if (manager === "npm") {
    ctx.update("Instalando dependências com NPM...", 55);
    const args = fs.existsSync(path.join(projectPath, "package-lock.json"))
      ? ["ci", "--no-audit", "--no-fund"]
      : ["install", "--no-audit", "--no-fund"];
    await run(tools.npm, args, {
      cwd: projectPath,
      timeoutMs: 20 * 60 * 1000,
      onOutput: (text) => ctx.append(text)
    });
    return;
  }
  throw new Error(`O projeto usa ${manager}. Esta versão suporta Bun e NPM.`);
}

async function runBuild(settings, project, ctx = null) {
  const tools = getTools(settings);
  const packageJsonPath = path.join(project.path, "package.json");
  if (!fs.existsSync(packageJsonPath)) return { skipped: true, output: "Sem package.json." };
  const pkg = readJson(packageJsonPath);
  if (!pkg.scripts || !pkg.scripts.build) return { skipped: true, output: "O projeto não possui script de build." };
  if (ctx) ctx.update("Executando build...", 80);
  const command = project.packageManager === "bun" ? tools.bun : tools.npm;
  const result = await run(command, ["run", "build"], {
    cwd: project.path,
    timeoutMs: 15 * 60 * 1000,
    onOutput: ctx ? (text) => ctx.append(text) : null,
    signal: ctx?.signal
  });
  return { skipped: false, output: result.output };
}

async function prepareProject(settings, profile, input, ctx) {
  if (!profile.github?.connected) throw new Error("Conecte o GitHub neste perfil antes de adicionar projetos.");
  const tools = getTools(settings);
  const repo = String(input.repo || "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Repositório inválido.");
  if (profile.projects.some((item) => item.repo.toLowerCase() === repo.toLowerCase())) {
    throw new Error("Esse repositório já está neste perfil.");
  }
  const repoName = repo.split("/")[1];
  const projectPath = path.join(profile.projectsRoot, sanitizeFolderName(repoName));
  fs.mkdirSync(profile.projectsRoot, { recursive: true });
  ctx.update("Verificando a conta do perfil...", 8);
  const account = await getGitHubAccount(settings, profile);
  ctx.update("Clonando repositório...", 15);
  if (!fs.existsSync(projectPath)) {
    await run(tools.gh, ["repo", "clone", repo, projectPath], {
      cwd: profile.projectsRoot,
      env: profileEnv(profile),
      timeoutMs: 10 * 60 * 1000,
      onOutput: (text) => ctx.append(text)
    });
  } else if (!fs.existsSync(path.join(projectPath, ".git"))) {
    throw new Error(`A pasta ${projectPath} já existe e não é um repositório Git.`);
  }
  ctx.update("Detectando o projeto...", 40);
  const branchResult = await run(tools.git, ["-C", projectPath, "branch", "--show-current"]);
  const manager = await detectPackageManager(projectPath);
  const project = {
    id: slug(repo),
    displayName: String(input.displayName || repoName).trim() || repoName,
    repo,
    githubLogin: account.login,
    path: projectPath,
    branch: branchResult.stdout.trim() || input.defaultBranch || "main",
    remote: "origin",
    packageManager: manager,
    lovableUrl: String(input.lovableUrl || "").trim(),
    previewPort: null,
    createdAt: now()
  };
  project.previewPort = await findAvailablePreviewPort(settings, profile.id, project.id, 8080);
  await configureRepositoryIdentity(settings, profile, project);
  await installDependencies(settings, projectPath, manager, ctx);
  ensureProjectWritePermission(project.path);
  await runBuild(settings, project, ctx);
  ctx.update("Salvando no perfil...", 95);
  profile.projects.push(project);
  saveSettings(settings);
  return { project, status: await gitStatus(settings, project) };
}

function getPreviewCommand(settings, project) {
  const tools = getTools(settings);
  const pkgPath = path.join(project.path, "package.json");
  if (!fs.existsSync(pkgPath)) throw new Error("O projeto não possui package.json.");
  const pkg = readJson(pkgPath);
  if (!pkg.scripts || !pkg.scripts.dev) throw new Error("O projeto não possui script dev.");
  const command = project.packageManager === "bun" ? tools.bun : tools.npm;
  return {
    command,
    args: [
      "run", "dev", "--",
      "--host", "127.0.0.1",
      "--port", String(project.previewPort),
      "--strictPort"
    ]
  };
}

function configuredPreviewPorts(settings, excludedKey = null) {
  const ports = new Set();
  for (const profile of settings.profiles || []) {
    for (const project of profile.projects || []) {
      if (projectKey(profile.id, project.id) === excludedKey) continue;
      const port = Number(project.previewPort);
      if (Number.isInteger(port) && port > 0 && port < 65536) ports.add(port);
    }
  }
  return ports;
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.unref();
    tester.once("error", () => resolve(false));
    tester.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      tester.close(() => resolve(true));
    });
  });
}

async function findAvailablePreviewPort(settings, profileId, projectId, preferredPort = 8080) {
  const key = projectKey(profileId, projectId);
  const reserved = configuredPreviewPorts(settings, key);
  let candidate = Number(preferredPort);
  if (!Number.isInteger(candidate) || candidate < 1024 || candidate > 65000) candidate = 8080;

  for (let attempt = 0; attempt < 1000 && candidate <= 65000; attempt++, candidate++) {
    if (reserved.has(candidate)) continue;
    if (await isPortAvailable(candidate)) return candidate;
  }

  throw new Error("Não foi possível encontrar uma porta livre para o preview local.");
}

async function ensureProjectPreviewPort(settings, profile, project) {
  const current = Number(project.previewPort);
  const key = projectKey(profile.id, project.id);
  const reserved = configuredPreviewPorts(settings, key);
  const currentValid = Number.isInteger(current) && current >= 1024 && current <= 65000;

  if (currentValid && !reserved.has(current) && await isPortAvailable(current)) {
    return current;
  }

  const next = await findAvailablePreviewPort(
    settings,
    profile.id,
    project.id,
    currentValid ? current + 1 : 8080
  );

  const old = project.previewPort;
  project.previewPort = next;
  saveSettings(settings);
  log(`Preview de ${profile.id}/${project.id} movido da porta ${old ?? "nao definida"} para ${next}.`);
  return next;
}

function waitForPreview(record, port, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let finished = false;

    const complete = (error = null) => {
      if (finished) return;
      finished = true;
      if (error) reject(error);
      else resolve();
    };

    const poll = async () => {
      if (finished) return;
      if (record.process.exitCode !== null) {
        complete(new Error(record.log || `O preview encerrou com código ${record.process.exitCode}.`));
        return;
      }

      const available = await isPortAvailable(port);
      if (!available && await isPreviewHealthy(port, 900)) {
        complete();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        complete(new Error(`O preview não iniciou na porta ${port} dentro do tempo esperado.
${record.log}`));
        return;
      }

      setTimeout(poll, 350);
    };

    poll().catch((error) => complete(error));
  });
}

function isPreviewHealthy(port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(Boolean(value));
    };
    const request = http.get({
      host: "127.0.0.1",
      port: Number(port),
      path: "/",
      timeout: timeoutMs,
      headers: { Connection: "close" }
    }, (response) => {
      response.resume();
      finish(true);
    });
    request.once("timeout", () => {
      request.destroy();
      finish(false);
    });
    request.once("error", () => finish(false));
  });
}

async function terminatePreviewRecord(key, record) {
  if (!record) return;
  try {
    if (record.process && record.process.exitCode === null) {
      if (process.platform === "win32") {
        await run(TASKKILL_EXE, ["/PID", String(record.process.pid), "/T", "/F"], {
          allowFailure: true,
          timeoutMs: 15000
        });
      } else {
        record.process.kill("SIGTERM");
      }
    }
  } catch (error) {
    log(`Falha ao encerrar preview inconsistente: ${error.message}`);
  } finally {
    previewProcesses.delete(key);
  }
}

async function startPreview(settings, profile, project) {
  const key = projectKey(profile.id, project.id);
  const existing = previewProcesses.get(key);
  if (existing && existing.process.exitCode === null) {
    const activePort = Number(existing.port || project.previewPort);
    const healthy = await isPreviewHealthy(activePort);
    if (healthy) {
      if (project.previewPort !== activePort) {
        project.previewPort = activePort;
        saveSettings(settings);
      }
      return { running: true, url: `http://127.0.0.1:${activePort}/` };
    }
    log(`Preview de ${profile.id}/${project.id} estava ativo no processo, mas sem resposta HTTP. Reiniciando automaticamente.`);
    await terminatePreviewRecord(key, existing);
  } else if (existing) {
    previewProcesses.delete(key);
  }

  await ensureProjectPreviewPort(settings, profile, project);
  const { command, args } = getPreviewCommand(settings, project);
  const child = spawn(command, args, {
    cwd: project.path,
    shell: false,
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1" }
  });
  const record = { process: child, log: "", startedAt: now(), port: project.previewPort };
  previewProcesses.set(key, record);
  child.stdout.on("data", (chunk) => { record.log = trim(record.log + chunk.toString(), 20000); });
  child.stderr.on("data", (chunk) => { record.log = trim(record.log + chunk.toString(), 20000); });
  child.on("error", (error) => { record.log = trim(record.log + `\nFalha ao iniciar preview: ${error.message}`, 20000); });
  child.on("close", (code) => { record.log = trim(record.log + `\nPreview encerrado com código ${code}.`, 20000); });

  try {
    await waitForPreview(record, project.previewPort);
  } catch (error) {
    previewProcesses.delete(key);
    try {
      if (child.exitCode === null) child.kill();
    } catch {}
    throw error;
  }

  return { running: true, url: `http://127.0.0.1:${project.previewPort}/` };
}

async function stopPreview(profile, project) {
  const key = projectKey(profile.id, project.id);
  const record = previewProcesses.get(key);
  if (!record) return { running: false };
  await terminatePreviewRecord(key, record);
  return { running: false };
}

function previewStatus(profile, project) {
  const record = previewProcesses.get(projectKey(profile.id, project.id));
  return {
    running: Boolean(record && record.process.exitCode === null),
    url: `http://127.0.0.1:${project.previewPort}/`,
    log: record ? record.log : ""
  };
}

function buildAgentProjectFileIndex(projectPath) {
  const excludedDirectories = new Set([
    ".git", "node_modules", "dist", "build", ".next", ".nuxt",
    ".vite", ".cache", "coverage", "public/__l5e"
  ]);
  const allowedExtensions = new Set([
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".css", ".scss", ".sass", ".less", ".html", ".json",
    ".md", ".svg", ".yaml", ".yml", ".toml", ".sql", ".prisma"
  ]);
  const results = [];
  const maxFiles = 500;

  function walk(current, relativeBase = "") {
    if (results.length >= maxFiles) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      if (entry.name.startsWith(".env") && ![".env.example", ".env.sample", ".env.template"].includes(entry.name.toLowerCase())) continue;
      const relative = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (excludedDirectories.has(relative) || excludedDirectories.has(entry.name)) continue;
        walk(absolute, relative);
        continue;
      }

      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (allowedExtensions.has(extension) || entry.name.endsWith(".asset.json")) {
        results.push(relative.replace(/\\/g, "/"));
      }
    }
  }

  walk(projectPath);
  return results.join("\n");
}


function historyProjectRoot(profile, project) {
  return path.join(HISTORY_ROOT, sanitizeFolderName(profile.id), sanitizeFolderName(project.id));
}

function historyStatePath(profile, project) {
  return path.join(historyProjectRoot(profile, project), "history.json");
}

function historyRef(profile, project) {
  return `refs/lovable-bridge/${slug(profile.id)}/${slug(project.id)}/history`;
}

function loadProjectHistory(profile, project) {
  const filePath = historyStatePath(profile, project);
  if (!fs.existsSync(filePath)) return null;
  try {
    const value = readJson(filePath);
    if (!value || value.version !== 1 || !Array.isArray(value.entries)) return null;
    return value;
  } catch (error) {
    log(`Falha ao ler historico de ${project.repo}: ${error.message}`);
    return null;
  }
}

function saveProjectHistory(profile, project, history) {
  writeJson(historyStatePath(profile, project), history);
}

async function clearProjectHistory(settings, profile, project) {
  const root = historyProjectRoot(profile, project);
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  try {
    const tools = getTools(settings);
    await run(tools.git, ["-C", project.path, "update-ref", "-d", historyRef(profile, project)], { allowFailure: true });
  } catch {}
}

function historyGitEnv() {
  return {
    GIT_AUTHOR_NAME: "Lovable Bridge",
    GIT_AUTHOR_EMAIL: "local@lovablebridge.invalid",
    GIT_COMMITTER_NAME: "Lovable Bridge",
    GIT_COMMITTER_EMAIL: "local@lovablebridge.invalid"
  };
}

async function currentHead(settings, project) {
  const tools = getTools(settings);
  const result = await run(tools.git, ["-C", project.path, "rev-parse", "HEAD"]);
  return result.stdout.trim();
}

async function captureWorkingTree(settings, profile, project, omitPaths = []) {
  const tools = getTools(settings);
  const root = historyProjectRoot(profile, project);
  fs.mkdirSync(root, { recursive: true });
  const indexPath = path.join(root, `.index-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  const env = { ...historyGitEnv(), GIT_INDEX_FILE: indexPath };
  try {
    await run(tools.git, ["-C", project.path, "read-tree", "HEAD"], { env });
    await run(tools.git, ["-C", project.path, "add", "-A"], { env });
    for (const item of omitPaths) {
      const relative = String(item || "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (!relative || relative.includes("..")) continue;
      await run(tools.git, ["-C", project.path, "rm", "-r", "--cached", "--ignore-unmatch", "--", relative], {
        env,
        allowFailure: true
      });
    }
    const tree = await run(tools.git, ["-C", project.path, "write-tree"], { env });
    return tree.stdout.trim();
  } finally {
    for (const candidate of [indexPath, `${indexPath}.lock`]) {
      try { if (fs.existsSync(candidate)) fs.rmSync(candidate, { force: true }); } catch {}
    }
  }
}

async function createSnapshotCommit(settings, profile, project, tree, parent, message) {
  const tools = getTools(settings);
  const args = ["-C", project.path, "commit-tree", tree];
  if (parent) args.push("-p", parent);
  args.push("-m", message);
  const result = await run(tools.git, args, { env: historyGitEnv() });
  return result.stdout.trim();
}

async function treeChangedFiles(settings, project, beforeTree, afterTree) {
  const tools = getTools(settings);
  const result = await run(tools.git, ["-C", project.path, "diff", "--name-status", beforeTree, afterTree, "--"]);
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split("\t");
    return { status: parts[0] || "M", path: parts.slice(1).join(" -> ") };
  });
}


const SAFETY_REJECTION_ROOT = path.join(LOG_DIR, "SafetyRejectedChanges");
const BUILD_REJECTION_ROOT = path.join(LOG_DIR, "BuildRejectedChanges");
const SAFETY_TEXT_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".css", ".scss", ".sass", ".less",
  ".html", ".htm", ".json", ".md", ".mdx", ".vue", ".svelte", ".astro", ".txt", ".yml", ".yaml", ".sql", ".prisma"
]);
const SAFETY_BLOCKED_PATH_PATTERNS = [
  /(^|\/)\.git(?:\/|$)/i,
  /(^|\/)package-lock\.json$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)yarn\.lock$/i,
  /(^|\/)bun\.lockb?$/i,
  /(^|\/)package\.json$/i,
  /(^|\/)vite\.config\.[^/]+$/i,
  /(^|\/)next\.config\.[^/]+$/i,
  /(^|\/)vercel\.json$/i,
  /(^|\/)netlify\.toml$/i
];

function normalizeSafetyText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeWorkMode(value) {
  const mode = String(value || "auto").trim().toLowerCase().replace(/[-_\s]+/g, "");
  if (["visual", "frontend", "front", "ui", "content"].includes(mode)) return "visual";
  if (["seo", "sitehealth", "technicalseo", "audit"].includes(mode)) return "seo";
  if (["forms", "form", "email", "formsandemail"].includes(mode)) return "forms";
  if (["advanced", "backend", "back", "server", "fullstack", "full", "both"].includes(mode)) return "advanced";
  return "auto";
}

function auditOnlyPrompt(prompt) {
  const value = normalizeSafetyText(prompt);
  const auditVerb = /\b(audit|review|analy[sz]e|find|identify|check|inspect|list|report|scan|crawl|verifique|revise|analise|encontre|identifique|liste|audite)\b/i.test(value);
  const editVerb = /\b(fix|correct|change|replace|rewrite|add|implement|create|remove|delete|optimi[sz]e|update|configure|connect|set up|corrija|altere|substitua|reescreva|adicione|implemente|crie|remova|exclua|otimize|atualize|configure|conecte)\b/i.test(value);
  return auditVerb && !editVerb;
}

function inferWorkMode(prompt, requestedMode = "auto") {
  const requested = normalizeWorkMode(requestedMode);
  if (requested !== "auto") return requested;
  const value = normalizeSafetyText(prompt);
  const forms = /\b(form|formulario|submission|lead|recipient|destinatario|reply-to|email|e-mail|resend|sending domain|dominio de envio|delivery log|send log|supabase.*form|notify\.)\b/i.test(value);
  const seo = /\b(seo|broken links?|links? quebrados?|internal links?|redirects?|canonicals?|orphan pages?|paginas? orfas?|urls?|page titles?|titles?|meta descriptions?|alt texts?|sitemap|robots\.txt|schema|structured data|json-ld|lcp|cls|inp|core web vitals?|performance|speed|mobile|crawl|indexab|lazy loading|internal linking)\b/i.test(value);
  const advanced = /\b(back[ -]?end|api|endpoint|server|server-side|database|banco|postgres|sql|migration|migracao|rls|row level security|auth|authentication|autenticacao|webhook|prisma|crud|storage bucket|service role|edge function|policy|politica)\b/i.test(value);
  if (forms) return "forms";
  if (seo) return "seo";
  if (advanced) return "advanced";
  return "visual";
}

function workModeLabel(mode) {
  const value = normalizeWorkMode(mode);
  if (value === "visual") return "Visual e conteúdo";
  if (value === "seo") return "SEO e saúde do site";
  if (value === "forms") return "Formulários e e-mail";
  if (value === "advanced") return "Avançado";
  return "Automático";
}

function workModePromptLines(prompt, requestedMode = "auto") {
  const mode = inferWorkMode(prompt, requestedMode);
  const auditOnly = mode === "seo" && auditOnlyPrompt(prompt);
  const common = [
    `LOVABLE BRIDGE WORK MODE: ${mode.toUpperCase()}.`,
    "Never access files outside the active project, never use Git, never commit or push, and never expose credentials or secret values.",
    "Do not edit real .env files. When configuration is needed, create or update only .env.example/.env.sample with empty or clearly fake placeholder values.",
    "Do not modify package.json, lockfiles, deployment configuration, or install dependencies in this R22 workflow.",
    "Do not execute database migrations or contact production services. You may create migration files for later review only when explicitly requested."
  ];
  if (mode === "seo") {
    return [
      ...common,
      auditOnly
        ? "This is an AUDIT-ONLY request. Do not create, modify, rename, or delete any file. Return a structured report with scope, findings, affected routes/files, severity, and recommended fixes."
        : "This request authorizes the specific SEO/site-health fixes explicitly requested. Keep changes scoped and preserve design and content that are not part of the request.",
      "Cover routes, internal links, status codes, redirects, canonicals, titles, meta descriptions, images/ALT, robots.txt, sitemap.xml, structured data, performance, and mobile only when relevant to the request.",
      "Never claim production Core Web Vitals or DNS/email delivery results from a local dev server; label local measurements and pending external verification clearly."
    ];
  }
  if (mode === "forms") {
    return [
      ...common,
      "Focus on form submission flows, validation, Supabase integration, recipient routing, reply-to, sending-domain configuration code, delivery logging, and safe test scaffolding.",
      "Preserve the current visual design unless a minimal form-state change is essential.",
      "Never invent successful DNS verification, delivery events, or production tests. Clearly separate code configured, external setup pending, and tests actually executed.",
      "You may create related server functions, services, types, tests, and empty environment templates inside the project."
    ];
  }
  if (mode === "advanced") {
    return [
      ...common,
      "Focus on APIs, server functions, authentication, database schemas, migrations, RLS policies, webhooks, storage, services, validation, and other explicitly requested technical work.",
      "Preserve the current visual design unless a minimal integration change is essential.",
      "You may create related source files, SQL migrations, schemas, services, types, and tests inside the project, but never apply migrations automatically."
    ];
  }
  return [
    ...common,
    "Focus on front-end pages, content, components, styling, accessibility, layout, and responsive behavior.",
    "Do not create or modify database migrations, server functions, RLS policies, or backend infrastructure in Visual mode."
  ];
}

function isActualEnvironmentFile(filePath) {
  const normalized = normalizeGitPath(filePath).toLowerCase();
  const name = normalized.split("/").pop() || "";
  if (!name.startsWith(".env")) return false;
  return ![".env.example", ".env.sample", ".env.template"].includes(name);
}

function isEnvironmentTemplate(filePath) {
  const normalized = normalizeGitPath(filePath).toLowerCase();
  const name = normalized.split("/").pop() || "";
  return [".env.example", ".env.sample", ".env.template"].includes(name);
}

function environmentTemplateHasSecret(text) {
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const value = line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!value) continue;
    if (/^(?:<[^>]+>|your[_ -]|replace[_ -]|example|sample|placeholder|changeme|xxx|https?:\/\/example\.)/i.test(value)) continue;
    if (/^\$\{[A-Z0-9_]+\}$/.test(value)) continue;
    return true;
  }
  return false;
}

function isBackendCreatedFileAllowed(filePath, mode) {
  const normalized = normalizeGitPath(filePath);
  const extension = path.extname(normalized).toLowerCase();
  const allowedExtension = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".sql", ".prisma", ".md", ".yml", ".yaml", ".xml", ".txt"]);
  if (!allowedExtension.has(extension) && !isEnvironmentTemplate(normalized)) return false;
  const workMode = normalizeWorkMode(mode);
  if (workMode === "seo") {
    return /^(?:src|app|pages|routes|public|tests?|__tests__|types|lib|services|components)\//i.test(normalized)
      || /^(?:robots\.txt|sitemap\.xml)$/i.test(normalized)
      || isEnvironmentTemplate(normalized);
  }
  if (workMode === "forms") {
    return /^(?:src|app|pages|api|server|functions|supabase|tests?|__tests__|types|lib|services|hooks|components)\//i.test(normalized)
      || isEnvironmentTemplate(normalized);
  }
  return /^(?:src|app|pages|api|server|functions|supabase|prisma|tests?|__tests__|types|lib|services|hooks|components)\//i.test(normalized)
    || isEnvironmentTemplate(normalized);
}

function migrationContainsDestructiveSql(text) {
  return /\b(?:drop\s+(?:table|schema|database|column)|truncate\s+table|delete\s+from\s+[^;\n]+(?:;|$)|alter\s+table\s+[^;\n]+\s+drop\s+)\b/i.test(String(text || ""));
}

function extractQuotedPromptTargets(prompt) {
  const text = String(prompt || "");
  const targets = [];
  const patterns = [
    /"([^"\r\n]{3,400})"/g,
    /'([^'\r\n]{3,400})'/g,
    /“([^”\r\n]{3,400})”/g,
    /‘([^’\r\n]{3,400})’/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const value = String(match[1] || "").trim();
      if (value && !targets.includes(value)) targets.push(value);
    }
  }
  return targets.slice(0, 8);
}

function classifyOpenCodeSafetyPrompt(prompt, requestedWorkMode = "auto") {
  const value = normalizeSafetyText(prompt);
  const workMode = inferWorkMode(prompt, requestedWorkMode);
  const destructive = /\b(remov|delete|exclu|apagu|reconstru|recri|refac|reescrev|rewrite|do zero|drop table|truncate)\w*/i.test(value);
  const globalScope = /\b(todo(?: o)? site|site inteiro|pagina inteira|todas? as paginas|em todas? as paginas|em todo(?: o)? site|por todo(?: o)? site|globalmente|todos? os arquivos|whole site|entire site|entire page|all pages|every page|throughout the site|across the site|site-wide|globally|all files|everywhere)\b/i.test(value);
  const color = /\b(cor|color|laranja|orange|vermelh|red|azul|blue|verde|green|branc|white|pret|black|cinza|gray|grey|dourad|gold|amarel|yellow)\w*/i.test(value);
  const font = /\b(fonte|font|tipografia|typeface)\w*/i.test(value);
  const image = /\b(imagem|image|foto|photo|hero|logo|banner|background image)\w*/i.test(value);
  const text = /\b(texto|text|titulo|title|headline|subtitulo|copy|frase|palavra)\w*/i.test(value);
  const style = /\b(margem|margin|padding|espacamento|spacing|alinhar|centraliz|tamanho|size|largura|width|altura|height|negrito|bold|italico|italic)\w*/i.test(value);
  const structural = /\b(secao|section|pagina|page|layout|menu|header|footer|componente|component|rota|route|formulario|form)\w*/i.test(value);
  const exactColorTarget = /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b|\brgba?\s*\(|\bhsla?\s*\(/i.test(value);

  let kind = "general";
  if (workMode === "seo") kind = "seo";
  else if (workMode === "forms") kind = "forms";
  else if (workMode === "advanced") kind = "advanced";
  else if (!destructive && color) kind = "color";
  else if (!destructive && font) kind = "font";
  else if (!destructive && text && !image) kind = "text";
  else if (!destructive && style && !structural) kind = "style";
  else if (image) kind = "image";
  else if (structural) kind = "structural";

  return {
    kind,
    workMode,
    destructive,
    globalScope,
    exactColorTarget,
    auditOnly: workMode === "seo" && auditOnlyPrompt(prompt),
    quotedTargets: extractQuotedPromptTargets(prompt),
    simple: ["color", "font", "text", "style"].includes(kind)
  };
}

function normalizeGitPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

async function detailedTreeChangedFiles(settings, project, beforeTree, afterTree) {
  const tools = getTools(settings);
  const result = await run(tools.git, ["-C", project.path, "diff", "--name-status", "--find-renames", beforeTree, afterTree, "--"]);
  const items = [];
  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    const parts = line.split("\t");
    const rawStatus = parts[0] || "M";
    const status = rawStatus.charAt(0);
    const oldPath = status === "R" || status === "C" ? normalizeGitPath(parts[1]) : null;
    const filePath = normalizeGitPath(status === "R" || status === "C" ? parts[2] : parts[1]);
    if (!filePath) continue;
    const numstat = await run(tools.git, ["-C", project.path, "diff", "--numstat", beforeTree, afterTree, "--", filePath], { allowFailure: true });
    const numLine = numstat.stdout.split(/\r?\n/).find(Boolean) || "";
    const numParts = numLine.split("\t");
    const binary = numParts[0] === "-" || numParts[1] === "-";
    items.push({
      rawStatus,
      status,
      oldPath,
      path: filePath,
      additions: binary ? 0 : Number(numParts[0] || 0),
      deletions: binary ? 0 : Number(numParts[1] || 0),
      binary
    });
  }
  return items;
}

function readTreeTextFile(settings, project, tree, filePath, maxBytes = 2 * 1024 * 1024) {
  const tools = getTools(settings);
  const normalized = normalizeGitPath(filePath);
  if (!normalized || !SAFETY_TEXT_EXTENSIONS.has(path.extname(normalized).toLowerCase())) {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(tools.git, ["-C", project.path, "show", `${tree}:${normalized}`], {
      cwd: project.path,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      windowsHide: true
    });
    const chunks = [];
    let length = 0;
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      reject(new Error(`Timeout ao inspecionar ${normalized}.`));
    }, 15000);
    child.stdout.on("data", (chunk) => {
      if (settled) return;
      length += chunk.length;
      if (length > maxBytes) {
        settled = true;
        clearTimeout(timer);
        try { child.kill(); } catch {}
        resolve({ tooLarge: true, size: length, text: "", lines: 0 });
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      const buffer = Buffer.concat(chunks);
      if (buffer.includes(0)) {
        resolve({ binary: true, size: buffer.length, text: "", lines: 0 });
        return;
      }
      const text = buffer.toString("utf8");
      resolve({
        binary: false,
        tooLarge: false,
        size: buffer.length,
        text,
        lines: text ? text.split(/\r?\n/).length : 0,
        stderr: trim(stderr, 1000)
      });
    });
  });
}

function countCodeStructure(text) {
  const value = String(text || "");
  return {
    imports: (value.match(/^\s*import\b/gm) || []).length + (value.match(/\brequire\s*\(/g) || []).length,
    exports: (value.match(/^\s*export\b/gm) || []).length + (value.match(/\bmodule\.exports\b/g) || []).length,
    jsxTags: (value.match(/<\/?[A-Za-z][^>]*>/g) || []).length,
    returns: (value.match(/\breturn\b/g) || []).length
  };
}

function introducedPlaceholderPage(beforeText, afterText) {
  const before = String(beforeText || "");
  const after = String(afterText || "");
  const placeholder = /(?:^|[>\s])Hello\s+["'`]?\/[A-Za-z0-9_\-/]+["'`]?!?/i;
  const tinyRoute = /^\s*(?:export\s+default\s+function[^\{]*\{\s*)?return\s*\(?\s*["'`]Hello\s+\//is;
  return (!placeholder.test(before) && placeholder.test(after)) || (!tinyRoute.test(before) && tinyRoute.test(after));
}

function safetyThresholds(classification) {
  const kind = classification?.kind || "general";
  const globalScope = Boolean(classification?.globalScope);
  const exactColorTarget = Boolean(classification?.exactColorTarget);

  // A mudança visual pode estar centralizada em um token ou espalhada por vários
  // componentes. O Safety Guard continua bloqueando arquivos protegidos,
  // exclusões, renomes, placeholders e perda estrutural, mas não deve rejeitar
  // uma troca global legítima apenas porque ela alcançou mais de dois arquivos.
  if (kind === "color") {
    if (globalScope) {
      return {
        maxFiles: exactColorTarget ? 60 : 40,
        maxLines: exactColorTarget ? 2400 : 1400,
        maxDeletions: exactColorTarget ? 1200 : 700,
        minSizeRatio: 0.78,
        minLineRatio: 0.75
      };
    }
    return { maxFiles: 8, maxLines: 240, maxDeletions: 120, minSizeRatio: 0.78, minLineRatio: 0.75 };
  }
  if (kind === "font" || kind === "style") {
    if (globalScope) {
      return { maxFiles: 30, maxLines: 1000, maxDeletions: 500, minSizeRatio: 0.72, minLineRatio: 0.70 };
    }
    return { maxFiles: 8, maxLines: 260, maxDeletions: 130, minSizeRatio: 0.75, minLineRatio: 0.72 };
  }
  if (kind === "text") {
    if (globalScope) {
      return { maxFiles: 20, maxLines: 600, maxDeletions: 300, minSizeRatio: 0.62, minLineRatio: 0.60 };
    }
    return { maxFiles: 5, maxLines: 140, maxDeletions: 70, minSizeRatio: 0.68, minLineRatio: 0.65 };
  }
  if (kind === "image") {
    return { maxFiles: globalScope ? 15 : 7, maxLines: globalScope ? 600 : 240, maxDeletions: globalScope ? 300 : 120, minSizeRatio: 0.48, minLineRatio: 0.45 };
  }
  if (kind === "structural") {
    return { maxFiles: 12, maxLines: 900, maxDeletions: 450, minSizeRatio: 0.22, minLineRatio: 0.20 };
  }
  if (kind === "seo") {
    return { maxFiles: 25, maxLines: 2200, maxDeletions: 900, minSizeRatio: 0.24, minLineRatio: 0.22 };
  }
  if (kind === "forms") {
    return { maxFiles: 30, maxLines: 3000, maxDeletions: 1100, minSizeRatio: 0.20, minLineRatio: 0.18 };
  }
  if (kind === "advanced") {
    return { maxFiles: 40, maxLines: 3800, maxDeletions: 1400, minSizeRatio: 0.18, minLineRatio: 0.16 };
  }
  return { maxFiles: 20, maxLines: globalScope ? 900 : 500, maxDeletions: globalScope ? 450 : 250, minSizeRatio: 0.35, minLineRatio: 0.32 };
}

async function analyzeOpenCodeChangeSafety(settings, project, tracker, afterTree, prompt, requestedWorkMode = "auto") {
  const classification = classifyOpenCodeSafetyPrompt(prompt, requestedWorkMode);
  const thresholds = safetyThresholds(classification);
  const attachmentPaths = new Set((tracker.media || []).map((item) => normalizeGitPath(item.projectPath)).filter(Boolean));
  const changed = await detailedTreeChangedFiles(settings, project, tracker.beforeTree, afterTree);
  const relevant = changed.filter((item) => !attachmentPaths.has(item.path));
  const reasons = [];
  const warnings = [];
  const totalLines = relevant.reduce((sum, item) => sum + item.additions + item.deletions, 0);
  const totalDeletions = relevant.reduce((sum, item) => sum + item.deletions, 0);

  if (!relevant.length) reasons.push("Nenhum arquivo de código ou conteúdo foi alterado além dos anexos.");
  if (relevant.length > thresholds.maxFiles) {
    reasons.push(`O pedido de ${classification.kind}${classification.globalScope ? " em todo o site" : ""} alterou ${relevant.length} arquivos; o limite adaptativo é ${thresholds.maxFiles}.`);
  }
  if (totalLines > thresholds.maxLines) {
    reasons.push(`A alteração modificou ${totalLines} linhas; o limite seguro para este pedido é ${thresholds.maxLines}.`);
  }
  if (totalDeletions > thresholds.maxDeletions) {
    reasons.push(`A alteração removeu ${totalDeletions} linhas; o limite seguro para este pedido é ${thresholds.maxDeletions}.`);
  }

  for (const item of relevant) {
    if (isActualEnvironmentFile(item.path)) {
      reasons.push(`Arquivo de ambiente real protegido alterado: ${item.path}.`);
    }
    if (SAFETY_BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(item.path))) {
      reasons.push(`Arquivo protegido alterado: ${item.path}.`);
    }
    if (classification.simple && ["A", "D", "R", "C"].includes(item.status)) {
      reasons.push(`Um pedido simples não pode ${item.status === "A" ? "criar" : item.status === "D" ? "excluir" : "renomear/copiar"} o arquivo ${item.path}.`);
    }
    if (["seo", "forms", "advanced"].includes(classification.workMode) && item.status === "A" && !isBackendCreatedFileAllowed(item.path, classification.workMode)) {
      reasons.push(`O modo ${workModeLabel(classification.workMode)} não autorizou a criação do arquivo ${item.path}.`);
    }
    if (!classification.destructive && item.status === "D") {
      reasons.push(`O arquivo ${item.path} foi excluído sem um pedido explícito de remoção.`);
    }

    const inspectPathBefore = item.oldPath || item.path;
    const before = await readTreeTextFile(settings, project, tracker.beforeTree, inspectPathBefore).catch((error) => {
      warnings.push(`Não foi possível ler a versão anterior de ${inspectPathBefore}: ${error.message}`);
      return null;
    });
    const after = await readTreeTextFile(settings, project, afterTree, item.path).catch((error) => {
      warnings.push(`Não foi possível ler a nova versão de ${item.path}: ${error.message}`);
      return null;
    });
    if (!after || after.binary || after.tooLarge) continue;

    if (isEnvironmentTemplate(item.path) && environmentTemplateHasSecret(after.text)) {
      reasons.push(`O arquivo ${item.path} parece conter um valor secreto real. Use somente placeholders vazios ou claramente fictícios.`);
    }
    if (/\.(?:sql)$/i.test(item.path) && migrationContainsDestructiveSql(after.text) && !classification.destructive) {
      reasons.push(`A migration ${item.path} contém SQL destrutivo sem pedido explícito.`);
    }

    if (!before || before.binary || before.tooLarge) continue;

    if (introducedPlaceholderPage(before.text, after.text)) {
      reasons.push(`O arquivo ${item.path} foi transformado em uma página provisória/placeholder.`);
    }

    if (before.size >= 500 && after.size / Math.max(before.size, 1) < thresholds.minSizeRatio) {
      reasons.push(`O arquivo ${item.path} encolheu de ${before.size} para ${after.size} bytes, incompatível com um pedido ${classification.kind}.`);
    }
    if (before.lines >= 20 && after.lines / Math.max(before.lines, 1) < thresholds.minLineRatio) {
      reasons.push(`O arquivo ${item.path} perdeu grande parte de sua estrutura (${before.lines} para ${after.lines} linhas).`);
    }

    const beforeStructure = countCodeStructure(before.text);
    const afterStructure = countCodeStructure(after.text);
    if (classification.simple && beforeStructure.imports >= 2 && afterStructure.imports < beforeStructure.imports - 1) {
      reasons.push(`O pedido simples removeu imports demais de ${item.path}.`);
    }
    if (beforeStructure.exports > 0 && afterStructure.exports === 0) {
      reasons.push(`A exportação principal de ${item.path} desapareceu.`);
    }
    if (classification.simple && beforeStructure.jsxTags >= 8 && afterStructure.jsxTags < Math.floor(beforeStructure.jsxTags * 0.65)) {
      reasons.push(`O pedido simples removeu grande parte dos elementos da interface em ${item.path}.`);
    }

    if (["color", "font", "style"].includes(classification.kind)) {
      for (const target of classification.quotedTargets) {
        if (before.text.includes(target) && !after.text.includes(target)) {
          reasons.push(`O texto-alvo “${trim(target, 120)}” desapareceu de ${item.path}.`);
        }
      }
    }
  }

  return {
    ok: reasons.length === 0,
    classification,
    thresholds,
    changed,
    relevant,
    totals: { files: relevant.length, lines: totalLines, additions: relevant.reduce((sum, item) => sum + item.additions, 0), deletions: totalDeletions },
    reasons: Array.from(new Set(reasons)),
    warnings: Array.from(new Set(warnings))
  };
}

function writeTreeDiffPatch(settings, project, beforeTree, afterTree, destination) {
  const tools = getTools(settings);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destination);
    const child = spawn(tools.git, ["-C", project.path, "diff", "--binary", "--full-index", beforeTree, afterTree, "--"], {
      cwd: project.path,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      windowsHide: true
    });
    let stderr = "";
    let childCode = null;
    let streamFinished = false;
    let settled = false;
    function finish() {
      if (settled || childCode === null || !streamFinished) return;
      settled = true;
      if (childCode === 0) resolve(destination);
      else reject(new Error(trim(stderr || `Git diff encerrou com código ${childCode}.`, 4000)));
    }
    child.stdout.pipe(output);
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    output.on("error", (error) => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      reject(error);
    });
    output.on("finish", () => {
      streamFinished = true;
      finish();
    });
    child.on("close", (code) => {
      childCode = code;
      finish();
    });
  });
}

async function archiveRejectedOpenCodeChange(settings, profile, project, tracker, afterTree, analysis, result) {
  const stamp = now().replace(/[-:TZ.]/g, "").slice(0, 14);
  const id = `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
  const root = path.join(SAFETY_REJECTION_ROOT, slug(profile.id), slug(project.id));
  fs.mkdirSync(root, { recursive: true });
  const patchPath = path.join(root, `${id}.patch`);
  const reportPath = path.join(root, `${id}.json`);
  try {
    await writeTreeDiffPatch(settings, project, tracker.beforeTree, afterTree, patchPath);
  } catch (error) {
    fs.writeFileSync(patchPath, `Não foi possível gerar o patch completo: ${error.message}\n`, "utf8");
  }
  writeJson(reportPath, {
    version: 1,
    id,
    rejectedAt: now(),
    profileId: profile.id,
    projectId: project.id,
    projectRepo: project.repo,
    prompt: tracker.prompt,
    engine: tracker.engine,
    model: result?.model || openCodeModel(settings),
    classification: analysis.classification,
    totals: analysis.totals,
    changedFiles: analysis.changed,
    reasons: analysis.reasons,
    warnings: analysis.warnings,
    agentOutput: trim(result?.output || "", 6000),
    patchPath
  });
  log(`Safety Guard rejeitou alteração OpenCode. Relatório: ${reportPath}`);
  return { id, patchPath, reportPath };
}


async function archiveBuildRejectedChange(settings, profile, project, tracker, afterTree, buildError, result = {}) {
  const stamp = now().replace(/[-:TZ.]/g, "").slice(0, 14);
  const id = `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
  const root = path.join(BUILD_REJECTION_ROOT, slug(profile.id), slug(project.id));
  fs.mkdirSync(root, { recursive: true });
  const patchPath = path.join(root, `${id}.patch`);
  const reportPath = path.join(root, `${id}.json`);
  const summary = summarizeBuildFailure(buildError, project);
  try {
    await writeTreeDiffPatch(settings, project, tracker.beforeTree, afterTree, patchPath);
  } catch (error) {
    fs.writeFileSync(patchPath, `Não foi possível gerar o patch completo: ${error.message}\n`, "utf8");
  }
  writeJson(reportPath, {
    version: 1,
    id,
    rejectedAt: now(),
    reason: "build-failed",
    profileId: profile.id,
    projectId: project.id,
    projectRepo: project.repo,
    prompt: tracker.prompt,
    engine: tracker.engine,
    model: result?.model || null,
    summary,
    buildError: trim(summary.raw, 20000),
    agentOutput: trim(result?.output || "", 6000),
    patchPath
  });
  log(`Build rejeitou alteração ${tracker.engine}. Relatório: ${reportPath}`);
  return { id, patchPath, reportPath, summary };
}

async function rollbackAfterBuildFailure(settings, profile, project, tracker, afterTree, error, result, ctx = null) {
  let archived = null;
  let archiveError = null;
  try {
    archived = await archiveBuildRejectedChange(settings, profile, project, tracker, afterTree, error, result);
  } catch (archiveFailure) {
    archiveError = archiveFailure;
    log(`Falha ao arquivar alteração rejeitada pelo build: ${archiveFailure.message}`);
  }

  if (ctx) ctx.update("Build falhou. Restaurando a versão anterior...", 92);
  await rollbackTrackedChange(settings, project, tracker);

  let restoreBuildError = null;
  try {
    await runBuild(settings, project, null);
  } catch (restoreFailure) {
    restoreBuildError = restoreFailure.message;
    log(`A versão restaurada também falhou no build: ${restoreFailure.message}`);
  }

  try { await startPreview(settings, profile, project); }
  catch (previewError) { log(`Não foi possível reabrir o preview após o rollback do build: ${previewError.message}`); }

  const summary = archived?.summary || summarizeBuildFailure(error, project);
  const message = buildFailureUserMessage(summary, {
    heading: "O build falhou e o comando foi rejeitado.",
    rollback: true,
    patchPath: archived?.patchPath || null,
    restoreBuildError
  });
  return { archived, archiveError, restoreBuildError, summary, message };
}

async function pipeTreeDiffApply(settings, project, beforeTree, afterTree) {
  const tools = getTools(settings);
  const check = await run(tools.git, ["-C", project.path, "diff", "--quiet", beforeTree, afterTree, "--"], { allowFailure: true });
  if (check.code === 0) return;
  return new Promise((resolve, reject) => {
    const env = { ...process.env, NO_COLOR: "1" };
    const diff = spawn(tools.git, ["-C", project.path, "diff", "--binary", "--full-index", beforeTree, afterTree, "--"], {
      cwd: project.path,
      env,
      shell: false,
      windowsHide: true
    });
    const apply = spawn(tools.git, ["-C", project.path, "apply", "--whitespace=nowarn", "--recount", "-"], {
      cwd: project.path,
      env,
      shell: false,
      windowsHide: true
    });
    let diffError = "";
    let applyError = "";
    let diffCode = null;
    let applyCode = null;
    let settled = false;
    diff.stdout.pipe(apply.stdin);
    diff.stderr.on("data", (chunk) => { diffError += chunk.toString(); });
    apply.stderr.on("data", (chunk) => { applyError += chunk.toString(); });
    function finish() {
      if (settled || diffCode === null || applyCode === null) return;
      settled = true;
      if (diffCode !== 0 || applyCode !== 0) {
        reject(new Error(trim(`${diffError}\n${applyError}`.trim() || "Nao foi possivel reconstruir esta sequencia de alteracoes.", 12000)));
      } else {
        resolve();
      }
    }
    diff.on("error", reject);
    apply.on("error", reject);
    diff.on("close", (code) => { diffCode = code; finish(); });
    apply.on("close", (code) => { applyCode = code; finish(); });
  });
}

async function restoreWorkingTreeToTree(settings, project, targetTree) {
  const tools = getTools(settings);
  await run(tools.git, ["-C", project.path, "reset", "--hard", "HEAD"]);
  await run(tools.git, [
    "-C", project.path, "clean", "-fd",
    "--exclude=node_modules", "--exclude=dist", "--exclude=.output", "--exclude=public/__l5e"
  ], { allowFailure: true });
  const head = await currentHead(settings, project);
  if (targetTree && targetTree !== head) await pipeTreeDiffApply(settings, project, head, targetTree);
}

function archiveHistoryAttachments(profile, project, entryId, media) {
  const target = path.join(historyProjectRoot(profile, project), "attachments", entryId);
  fs.mkdirSync(target, { recursive: true });
  const archived = [];
  for (const item of media) {
    const source = path.resolve(project.path, String(item.projectPath || ""));
    const projectRoot = path.resolve(project.path);
    if (source !== projectRoot && !source.startsWith(`${projectRoot}${path.sep}`)) continue;
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    const archiveName = `${archived.length + 1}-${sanitizeMediaName(item.originalName || item.filename || path.basename(source))}`;
    fs.copyFileSync(source, path.join(target, archiveName));
    archived.push({
      historyEntryId: entryId,
      archiveName,
      originalName: item.originalName || item.filename || path.basename(source),
      mimeType: item.mimeType || "application/octet-stream",
      size: Number(item.size || fs.statSync(source).size)
    });
  }
  return archived;
}

function materializeHistoryAttachments(profile, project, references) {
  const refs = Array.isArray(references) ? references.slice(0, MEDIA_LIMIT) : [];
  if (!refs.length) return [];
  const targetDir = path.join(project.path, "public", "lovable-bridge-media");
  fs.mkdirSync(targetDir, { recursive: true });
  const stamp = now().replace(/[-:TZ.]/g, "").slice(0, 14);
  const result = [];
  refs.forEach((item, index) => {
    const entryId = sanitizeFolderName(item.historyEntryId || "");
    const archiveName = path.basename(String(item.archiveName || ""));
    const source = path.join(historyProjectRoot(profile, project), "attachments", entryId, archiveName);
    if (!entryId || !archiveName || !fs.existsSync(source)) throw new Error(`O anexo salvo ${item.originalName || archiveName} nao foi encontrado.`);
    const finalName = `${stamp}-history-${String(index + 1).padStart(2, "0")}-${sanitizeMediaName(item.originalName || archiveName)}`;
    const destination = path.join(targetDir, finalName);
    fs.copyFileSync(source, destination);
    result.push({
      originalName: item.originalName || archiveName,
      filename: finalName,
      mimeType: item.mimeType || "application/octet-stream",
      size: Number(item.size || fs.statSync(destination).size),
      projectPath: `public/lovable-bridge-media/${finalName}`,
      publicPath: `/lovable-bridge-media/${finalName}`
    });
  });
  return result;
}

async function beginTrackedChange(settings, profile, project, prompt, media, engine) {
  const omit = media.map((item) => item.projectPath).filter(Boolean);
  const beforeTree = await captureWorkingTree(settings, profile, project, omit);
  const history = loadProjectHistory(profile, project);
  const parent = history?.refCommit || null;
  const beforeCommit = await createSnapshotCommit(settings, profile, project, beforeTree, parent, `Before ${engine} command`);
  return { history, beforeTree, beforeCommit, prompt, media, engine };
}

async function rollbackTrackedChange(settings, project, tracker) {
  try { await restoreWorkingTreeToTree(settings, project, tracker.beforeTree); }
  catch (error) { log(`Falha ao restaurar comando interrompido: ${error.message}`); }
}

async function rollbackTrackedChangeVerified(settings, profile, project, tracker) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await restoreWorkingTreeToTree(settings, project, tracker.beforeTree);
      await sleep(250 * attempt);
      const restoredTree = await captureWorkingTree(settings, profile, project);
      if (restoredTree === tracker.beforeTree) {
        log(`Rollback verificado para ${profile.id}/${project.id} na tentativa ${attempt}.`);
        return { ok: true, attempts: attempt };
      }
      lastError = new Error(`A árvore restaurada ainda difere do checkpoint após a tentativa ${attempt}.`);
    } catch (error) {
      lastError = error;
      log(`Falha na tentativa ${attempt} de rollback verificado: ${error.message}`);
    }
  }
  throw new Error(`Não foi possível confirmar a restauração do projeto. ${lastError?.message || "Erro desconhecido."}`);
}

async function restorePreviewAfterOpenCode(settings, profile, project, shouldRun) {
  if (!shouldRun) return null;
  try { await stopPreview(profile, project); } catch {}
  try {
    const preview = await startPreview(settings, profile, project);
    log(`Preview restaurado após a execução do OpenCode: ${preview.url}`);
    return preview;
  } catch (error) {
    log(`Não foi possível reabrir o preview após a execução do OpenCode: ${error.message}`);
    return null;
  }
}

async function finishTrackedChange(settings, profile, project, tracker, resultMeta = {}) {
  const afterTree = await captureWorkingTree(settings, profile, project);
  if (afterTree === tracker.beforeTree) return null;
  const id = `change-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const afterCommit = await createSnapshotCommit(settings, profile, project, afterTree, tracker.beforeCommit, `After ${tracker.engine} command`);
  const head = await currentHead(settings, project);
  const history = tracker.history || {
    version: 1,
    baseHead: head,
    baselineTree: tracker.beforeTree,
    baselineCommit: tracker.beforeCommit,
    refCommit: tracker.beforeCommit,
    entries: [],
    createdAt: now()
  };
  const entry = {
    id,
    createdAt: now(),
    prompt: tracker.prompt,
    engine: tracker.engine,
    beforeTree: tracker.beforeTree,
    beforeCommit: tracker.beforeCommit,
    afterTree,
    afterCommit,
    changedFiles: await treeChangedFiles(settings, project, tracker.beforeTree, afterTree),
    attachments: archiveHistoryAttachments(profile, project, id, tracker.media),
    buildOk: resultMeta.buildOk !== false,
    agentOutput: trim(resultMeta.agentOutput || "", 4000)
  };
  history.entries.push(entry);
  history.refCommit = afterCommit;
  history.updatedAt = now();
  saveProjectHistory(profile, project, history);
  const tools = getTools(settings);
  await run(tools.git, ["-C", project.path, "update-ref", historyRef(profile, project), afterCommit]);
  return entry;
}

async function projectHistorySummary(settings, profile, project) {
  const history = loadProjectHistory(profile, project);
  const status = await gitStatus(settings, project);
  if (!history) {
    return {
      entries: [],
      existingUntrackedChanges: !status.clean,
      changedCount: status.changedCount,
      status: status.status
    };
  }
  const head = await currentHead(settings, project);
  return {
    entries: history.entries.map((entry, index) => ({
      id: entry.id,
      number: index + 1,
      createdAt: entry.createdAt,
      prompt: entry.prompt,
      engine: entry.engine,
      attachments: entry.attachments || [],
      changedFiles: entry.changedFiles || [],
      buildOk: entry.buildOk !== false
    })),
    existingUntrackedChanges: false,
    changedCount: status.changedCount,
    status: status.status,
    valid: history.baseHead === head
  };
}

async function removeTrackedChange(settings, profile, project, entryId, ctx, forEdit = false) {
  const history = loadProjectHistory(profile, project);
  if (!history) throw new Error("Nenhum historico de comandos foi encontrado para este projeto.");
  const index = history.entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) throw new Error("A alteracao selecionada nao foi encontrada.");
  const selected = history.entries[index];
  const remaining = history.entries.filter((entry) => entry.id !== entryId);
  const backupTree = await captureWorkingTree(settings, profile, project);
  ctx.update("Criando uma copia de seguranca...", 10);
  try {
    ctx.update("Reconstruindo as alteracoes selecionadas...", 35);
    await restoreWorkingTreeToTree(settings, project, history.baselineTree);
    for (let itemIndex = 0; itemIndex < remaining.length; itemIndex += 1) {
      const entry = remaining[itemIndex];
      ctx.update(`Reaplicando alteracao ${itemIndex + 1} de ${remaining.length}...`, 35 + Math.round(((itemIndex + 1) / Math.max(remaining.length, 1)) * 35));
      await pipeTreeDiffApply(settings, project, entry.beforeTree, entry.afterTree);
    }
    history.entries = remaining;
    history.updatedAt = now();
    if (remaining.length || forEdit) saveProjectHistory(profile, project, history);
    else await clearProjectHistory(settings, profile, project);
    ctx.update("Verificando o projeto...", 78);
    let buildOk = true;
    let buildError = "";
    try { await runBuild(settings, project, ctx); }
    catch (error) { buildOk = false; buildError = error.message; }
    return {
      removedId: entryId,
      draft: forEdit ? {
        prompt: selected.prompt,
        engine: selected.engine,
        attachments: selected.attachments || []
      } : null,
      buildOk,
      buildError,
      history: await projectHistorySummary(settings, profile, project),
      status: await gitStatus(settings, project),
      preview: await startPreview(settings, profile, project)
    };
  } catch (error) {
    try { await restoreWorkingTreeToTree(settings, project, backupTree); }
    catch (restoreError) { log(`Falha ao restaurar backup do historico: ${restoreError.message}`); }
    throw new Error(`Nao foi possivel remover esta alteracao sem afetar as posteriores. O projeto foi restaurado. ${error.message}`);
  }
}

function commandPermissionWasBlocked(output) {
  return /tool required the ["']command["'] permission|command permission.*auto-denied|headless mode cannot prompt.*command/i.test(
    String(output || "")
  );
}

async function runAgentEdit(settings, profile, project, userPrompt, attachments, ctx, requestedWorkMode = "auto") {
  const optionalTools = getTools(settings);
  if (!optionalTools.agy) throw new Error("Antigravity não está instalado nesta versão Companion. Use Codex.");
  if (project.githubLogin?.toLowerCase() !== profile.github.login?.toLowerCase()) {
    throw new Error(`Este projeto pertence à conta ${project.githubLogin}. O perfil atual está conectado como ${profile.github.login}.`);
  }
  const tools = getTools(settings);
  const startedAt = Date.now();
  const prompt = String(userPrompt || "").trim();
  if (prompt.length < 4) throw new Error("Descreva a alteração desejada.");
  const workMode = inferWorkMode(prompt, requestedWorkMode);
  const media = Array.isArray(attachments) ? attachments.slice(0, MEDIA_LIMIT) : [];
  ensureProjectWritePermission(project.path);
  const tracker = await beginTrackedChange(settings, profile, project, prompt, media, "antigravity");
  ctx.update("Antigravity analisando o projeto...", 15);

  const projectFileIndex = buildAgentProjectFileIndex(project.path);
  const mediaLines = media.length
    ? [
        "The user attached the following files, already copied inside this project:",
        ...media.map((item, index) => `${index + 1}. ${item.projectPath} (public URL: ${item.publicPath})`),
        "Reference the attachment by its provided public URL. Do not move, rename, or copy it with terminal commands.",
        "Use only the attachments relevant to the requested change. Do not invent other file paths.",
        ""
      ]
    : [];

  const baseInstructions = [
    ...workModePromptLines(prompt, workMode),
    "Work only inside the active project workspace.",
    "Do not access files outside this project.",
    "Do not use Git, do not commit, do not push, and do not change the .git directory.",
    "Do not install packages or change environment variables.",
    "Do not modify real .env files, credentials, secrets, package.json, lockfiles, or deployment settings.",
    "Terminal commands are disabled in this workflow. Never call the command tool.",
    "Use only the built-in project file reading and writing tools.",
    "A project file index is supplied below so you do not need shell search commands.",
    "Implement only the user's requested change for the selected work mode.",
    ...mediaLines,
    "PROJECT FILE INDEX (relative paths):",
    projectFileIndex || "(No indexed source files found)",
    "",
    "USER REQUEST:",
    prompt
  ];

  async function invokeAgent(lines, effort = "medium") {
    return run(
      tools.agy,
      [
        "--new-project", "--add-dir", project.path,
        "--print", lines.join("\n"),
        "--mode", "accept-edits",
        "--effort", effort,
        "--print-timeout", "10m"
      ],
      {
        cwd: project.path,
        timeoutMs: 11 * 60 * 1000,
        onOutput: (text) => ctx.append(text)
      }
    );
  }

  let result;
  try {
    result = await invokeAgent(baseInstructions);
    if (commandPermissionWasBlocked(result.output)) {
      ctx.update("Reexecutando sem comandos de terminal...", 40);
      result = await invokeAgent([
        "The previous attempt was blocked because terminal command tools are intentionally disabled.",
        "Do not call the command tool under any circumstance.",
        "Use only built-in read_file/write_file-style project tools and the supplied file index.",
        "Complete the requested edit directly in the relevant source files.",
        "",
        ...baseInstructions
      ], "high");
    }
  } catch (error) {
    await rollbackTrackedChange(settings, project, tracker);
    try { await startPreview(settings, profile, project); } catch {}
    recordAgentUsage({ engine: "antigravity", outcome: "failed", durationMs: Date.now() - startedAt, promptLength: prompt.length, attachmentCount: media.length, error: trim(error.message, 2000) });
    if (antigravityQuotaReached(error.message)) {
      throw new Error("Limite do Antigravity atingido. O comando não foi executado. Aguarde a renovação da cota ou selecione Codex.");
    }
    if (/sign.?in|log.?in|authentication|unauthorized|credential|oauth/i.test(String(error.message || ""))) {
      throw new Error("O Antigravity precisa ser conectado à sua conta Google. Abra o Antigravity CLI uma vez, conclua o login no navegador e tente novamente.");
    }
    throw error;
  }

  ctx.update("Verificando arquivos alterados...", 65);
  const afterTree = await captureWorkingTree(settings, profile, project);
  if (afterTree === tracker.beforeTree) {
    await rollbackTrackedChange(settings, project, tracker);
    throw new Error(`O agente respondeu, mas nenhuma alteração foi detectada.\n\n${result.output}`);
  }

  ctx.update("Validando a alteração com o Safety Guard...", 72);
  const safety = await analyzeOpenCodeChangeSafety(settings, project, tracker, afterTree, prompt, workMode);
  if (!safety.ok) {
    let archived = null;
    try { archived = await archiveRejectedOpenCodeChange(settings, profile, project, tracker, afterTree, safety, result); } catch {}
    await rollbackTrackedChangeVerified(settings, profile, project, tracker);
    const report = archived?.patchPath ? `\n\nDiff preservado em:\n${archived.patchPath}` : "";
    throw new Error(`O Safety Guard rejeitou a alteração do Antigravity e restaurou o projeto.\n\n${safety.reasons.map((reason, index) => `${index + 1}. ${reason}`).join("\n")}${report}`);
  }

  ctx.update("Executando build automático...", 78);
  try {
    const build = await runBuild(settings, project, ctx);
    const entry = await finishTrackedChange(settings, profile, project, tracker, { buildOk: true, agentOutput: result.output });
    recordAgentUsage({ engine: "antigravity", outcome: "completed", durationMs: Date.now() - startedAt, promptLength: prompt.length, attachmentCount: media.length, changedCount: (await gitStatus(settings, project)).changedCount });
    return {
      engine: "antigravity",
      historyEntry: entry,
      agentOutput: [`Modo de trabalho: ${workModeLabel(workMode)}.`, `Arquivos validados: ${safety.totals.files}; linhas alteradas: ${safety.totals.lines}.`, result.output].filter(Boolean).join("\n"),
      buildOk: true,
      buildOutput: build.output,
      status: await gitStatus(settings, project),
      preview: await startPreview(settings, profile, project)
    };
  } catch (error) {
    const rejected = await rollbackAfterBuildFailure(settings, profile, project, tracker, afterTree, error, result, ctx);
    await restorePreviewAfterOpenCode(settings, profile, project, previewWasRunning);
    recordAgentUsage({
      engine: "antigravity",
      outcome: "build-rejected-rolled-back",
      durationMs: Date.now() - startedAt,
      promptLength: prompt.length,
      attachmentCount: media.length,
      error: trim(error.message, 3000),
      reportPath: rejected.archived?.reportPath || null
    });
    throw new Error(rejected.message);
  }
}

function codexLoginMissing(output) {
  return /not logged in|sign in with chatgpt|authentication required|unauthorized|401/i.test(String(output || ""));
}

function codexLimitReached(output) {
  return /usage limit|rate limit|limit reached|quota|insufficient credits|credits exhausted|wait.*reset|upgrade to continue/i.test(String(output || ""));
}


function openCodeAuthMissing(output) {
  return /unauthorized|401|forbidden|403|missing.*api.?key|no.*credential|credential.*not found|authentication required|not authenticated|provider.*not configured|auth.*required/i.test(String(output || ""));
}

function openCodeLimitReached(output) {
  return /usage limit|rate limit|limit reached|quota|insufficient credits|credits exhausted|402|429|free model.*limit|no endpoints found|temporarily unavailable/i.test(String(output || ""));
}

const OPENCODE_DEFAULT_MODEL = "openrouter/deepseek/deepseek-v4-flash:free";
const OPENCODE_MODEL_CATALOG_TTL_MS = 10 * 60 * 1000;
const OPENCODE_FALLBACK_MODELS = Object.freeze([
  {
    id: "openrouter/deepseek/deepseek-v4-flash:free",
    name: "DeepSeek V4 Flash (grátis)",
    provider: "DeepSeek",
    recommended: true,
    contextLength: 1000000,
    source: "fallback"
  },
  {
    id: "openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    name: "NVIDIA Nemotron 3 Nano Omni (grátis)",
    provider: "NVIDIA",
    recommended: false,
    contextLength: 256000,
    source: "fallback"
  },
  {
    id: "openrouter/openrouter/free",
    name: "OpenRouter Free Router (automático)",
    provider: "OpenRouter",
    recommended: false,
    contextLength: 200000,
    source: "fallback"
  }
]);
let openCodeModelCatalogCache = {
  fetchedAt: 0,
  source: "fallback",
  warning: "",
  models: OPENCODE_FALLBACK_MODELS.map((item) => ({ ...item }))
};

function normalizeOpenCodeModelId(value) {
  const raw = String(value || "").trim();
  if (!raw) return OPENCODE_DEFAULT_MODEL;
  if (raw.startsWith("openrouter/") && raw.split("/").length >= 3) return raw;
  if (raw.includes("/")) return `openrouter/${raw}`;
  throw new Error(`Modelo OpenCode inválido: ${raw}`);
}

function isOpenCodeFreeModel(model) {
  const normalized = normalizeOpenCodeModelId(model);
  return normalized === "openrouter/openrouter/free" || /:free$/i.test(normalized);
}

function openCodeModel(settings) {
  try {
    const configured = normalizeOpenCodeModelId(settings.openCode?.model || OPENCODE_DEFAULT_MODEL);
    return isOpenCodeFreeModel(configured) ? configured : OPENCODE_DEFAULT_MODEL;
  } catch {
    return OPENCODE_DEFAULT_MODEL;
  }
}

function openCodeModelParts(settings) {
  const value = openCodeModel(settings);
  const [providerID, ...rest] = value.split("/");
  const modelID = rest.join("/");
  if (!providerID || !modelID) throw new Error(`Modelo OpenCode inválido: ${value}`);
  return { providerID, modelID };
}

function openCodeModelDisplayName(model) {
  const normalized = normalizeOpenCodeModelId(model);
  const known = openCodeModelCatalogCache.models.find((item) => item.id === normalized)
    || OPENCODE_FALLBACK_MODELS.find((item) => item.id === normalized);
  if (known?.name) return known.name.replace(/\s*\(grátis\)\s*$/i, "");
  const slug = normalized.replace(/^openrouter\//, "").replace(/:free$/i, "");
  return slug.split("/").pop().replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function openCodeZeroPrice(value) {
  if (value === undefined || value === null || value === "") return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed === 0;
}

function mergeOpenCodeModelCatalog(remoteModels) {
  const byId = new Map();
  for (const fallback of OPENCODE_FALLBACK_MODELS) byId.set(fallback.id, { ...fallback });
  for (const remote of remoteModels) {
    const previous = byId.get(remote.id) || {};
    byId.set(remote.id, { ...previous, ...remote });
  }
  const priority = new Map([
    ["openrouter/deepseek/deepseek-v4-flash:free", 0],
    ["openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", 1],
    ["openrouter/openrouter/free", 2]
  ]);
  return [...byId.values()].sort((left, right) => {
    const leftPriority = priority.has(left.id) ? priority.get(left.id) : 100;
    const rightPriority = priority.has(right.id) ? priority.get(right.id) : 100;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return String(left.name || left.id).localeCompare(String(right.name || right.id), "pt-BR");
  });
}

async function fetchOpenCodeFreeModels(force = false) {
  const cacheAge = Date.now() - Number(openCodeModelCatalogCache.fetchedAt || 0);
  if (!force && openCodeModelCatalogCache.models.length && cacheAge < OPENCODE_MODEL_CATALOG_TTL_MS) {
    return openCodeModelCatalogCache;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/models?supported_parameters=tools&sort=most-popular",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "LovableBridge/1.6.0-R20"
        },
        signal: controller.signal
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const available = Array.isArray(payload?.data) ? payload.data : [];
    const remoteModels = available
      .filter((item) => {
        const id = String(item?.id || "");
        const supported = Array.isArray(item?.supported_parameters) ? item.supported_parameters : [];
        const pricing = item?.pricing || {};
        const isFree = id === "openrouter/free" || id.endsWith(":free");
        return isFree
          && supported.includes("tools")
          && openCodeZeroPrice(pricing.prompt)
          && openCodeZeroPrice(pricing.completion)
          && openCodeZeroPrice(pricing.request);
      })
      .map((item) => ({
        id: normalizeOpenCodeModelId(item.id),
        name: `${String(item.name || item.id).replace(/\s*\(free\)\s*$/i, "")} (grátis)`,
        provider: String(item.id || "").split("/")[0] || "OpenRouter",
        recommended: item.id === "deepseek/deepseek-v4-flash:free",
        contextLength: Number(item.context_length || item.top_provider?.context_length || 0) || null,
        source: "openrouter"
      }));

    openCodeModelCatalogCache = {
      fetchedAt: Date.now(),
      source: "openrouter",
      warning: "",
      models: mergeOpenCodeModelCatalog(remoteModels)
    };
  } catch (error) {
    openCodeModelCatalogCache = {
      fetchedAt: Date.now(),
      source: "fallback",
      warning: `Não foi possível atualizar o catálogo do OpenRouter: ${error.name === "AbortError" ? "tempo esgotado" : error.message}`,
      models: mergeOpenCodeModelCatalog([])
    };
  } finally {
    clearTimeout(timer);
  }
  return openCodeModelCatalogCache;
}

async function openCodeModelsResponse(settings, force = false) {
  const catalog = await fetchOpenCodeFreeModels(force);
  const selected = openCodeModel(settings);
  const models = catalog.models.some((item) => item.id === selected)
    ? catalog.models
    : [{ id: selected, name: `${openCodeModelDisplayName(selected)} (selecionado)`, provider: "OpenRouter", recommended: false, contextLength: null, source: "saved" }, ...catalog.models];
  return {
    selected,
    selectedName: openCodeModelDisplayName(selected),
    source: catalog.source,
    warning: catalog.warning,
    fetchedAt: catalog.fetchedAt,
    models
  };
}

async function selectOpenCodeModel(settings, requestedModel) {
  const model = normalizeOpenCodeModelId(requestedModel);
  if (!isOpenCodeFreeModel(model)) {
    throw new Error("Selecione somente um modelo gratuito do OpenRouter.");
  }
  const catalog = await fetchOpenCodeFreeModels(false);
  if (!catalog.models.some((item) => item.id === model)) {
    throw new Error("Esse modelo gratuito não está disponível no catálogo atual. Atualize a lista e tente novamente.");
  }
  settings.openCode.model = model;
  settings.openCode.modelCatalogVersion = 2;
  saveSettings(settings);
  return openCodeModelsResponse(settings, false);
}

function openCodeRuntimeConfig(settings) {
  const selected = openCodeModelParts(settings);
  return {
    $schema: "https://opencode.ai/config.json",
    model: openCodeModel(settings),
    default_agent: "build",
    share: "disabled",
    autoupdate: false,
    plugin: [],
    mcp: {},
    // Keep the legacy tool switches too. Current OpenCode maps them into the
    // permission system, while older builds still read this field directly.
    tools: {
      read: true,
      list: true,
      glob: true,
      grep: true,
      edit: true,
      write: true,
      apply_patch: true,
      todowrite: true,
      todoread: true,
      bash: false,
      webfetch: false,
      websearch: false,
      task: false,
      skill: false,
      lsp: false,
      question: false
    },
    // R7: do not start from a blanket deny rule. In headless/server mode that
    // rule could remove discovery tools before the build agent saw the exact
    // per-tool overrides. Keep file tools explicit and deny risky capabilities.
    permission: {
      read: {
        "*": "allow",
        ".env*": "deny",
        "*.env": "deny",
        "**/.env": "deny",
        "**/.env.*": "deny",
        ".git/**": "deny",
        "**/.git/**": "deny"
      },
      edit: {
        "*": "allow",
        ".env*": "deny",
        "*.env": "deny",
        "**/.env": "deny",
        "**/.env.*": "deny",
        ".git/**": "deny",
        "**/.git/**": "deny",
        "package-lock.json": "deny",
        "bun.lock": "deny",
        "bun.lockb": "deny",
        "yarn.lock": "deny",
        "pnpm-lock.yaml": "deny",
        "**/package-lock.json": "deny",
        "**/bun.lock": "deny",
        "**/bun.lockb": "deny",
        "**/yarn.lock": "deny",
        "**/pnpm-lock.yaml": "deny"
      },
      list: "allow",
      glob: "allow",
      grep: "allow",
      todowrite: "allow",
      bash: "deny",
      webfetch: "deny",
      websearch: "deny",
      task: "deny",
      skill: "deny",
      lsp: "deny",
      question: "deny",
      external_directory: "deny",
      doom_loop: "deny"
    },
    provider: {
      [selected.providerID]: {
        models: {
          [selected.modelID]: { name: "Lovable Bridge selected free model" }
        }
      }
    }
  };
}

function openCodeEnvironment(settings, tools, extra = {}) {
  // R7 uses an isolated config directory for managed executions. OpenRouter
  // credentials remain in OpenCode's auth store, but stale user/global configs
  // cannot silently switch to plan mode or disable project tools.
  const runtimeConfigDir = path.join(USER_ROOT, "Config", "OpenCode", "Runtime");
  fs.mkdirSync(runtimeConfigDir, { recursive: true });
  const env = {
    ...process.env,
    NO_COLOR: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
    OPENCODE_DISABLE_CLAUDE_CODE: "1",
    OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: "1",
    OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    OPENCODE_DISABLE_TERMINAL_TITLE: "1",
    OPENCODE_AUTO_SHARE: "false",
    OPENCODE_CONFIG_DIR: runtimeConfigDir,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(openCodeRuntimeConfig(settings)),
    ...extra
  };
  delete env.OPENCODE_CONFIG;
  if (IS_WINDOWS) {
    const gitRoot = path.dirname(path.dirname(tools.git));
    const bashPath = path.join(gitRoot, "bin", "bash.exe");
    if (fs.existsSync(bashPath)) env.OPENCODE_GIT_BASH_PATH = bashPath;
  }
  return env;
}

async function verifyOpenCodeProvider(settings, tools, ctx = null) {
  if (!tools.opencode) {
    throw new Error("OpenCode não está instalado. Reinstale esta versão do Lovable Bridge.");
  }
  const status = await run(tools.opencode, ["--pure", "auth", "list"], {
    timeoutMs: 10 * 1000,
    allowFailure: true,
    env: openCodeEnvironment(settings, tools),
    signal: ctx?.signal
  });
  const output = String(status.output || "");
  if (status.code !== 0 || !/openrouter/i.test(output)) {
    throw new Error(
      "O OpenCode ainda não está conectado ao OpenRouter. Clique em ‘Configurar OpenCode / OpenRouter’, crie uma chave gratuita e conclua o login no terminal."
    );
  }
  return output.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreeLocalPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function openCodeBasicAuth(password) {
  return `Basic ${Buffer.from(`opencode:${password}`, "utf8").toString("base64")}`;
}

async function openCodeApiRequest(baseUrl, password, method, route, options = {}) {
  const timeoutMs = Math.max(1, options.timeoutMs || 15000);
  const controller = new AbortController();
  const externalSignal = options.signal || null;
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(route, baseUrl);
    if (options.directory && /^(GET|HEAD)$/i.test(method)) {
      url.searchParams.set("directory", options.directory);
    }
    const headers = {
      Authorization: openCodeBasicAuth(password),
      Accept: "application/json",
      ...(options.directory ? { "x-opencode-directory": encodeURIComponent(options.directory) } : {}),
      ...(options.headers || {})
    };
    let body;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    const response = await fetch(url, { method, headers, body, signal: controller.signal });
    if (response.status === 204) {
      if (!response.ok) {
        const error = new Error(`OpenCode Async API respondeu HTTP ${response.status}.`);
        error.httpStatus = response.status;
        throw error;
      }
      try { await response.body?.cancel(); } catch {}
      return null;
    }
    const text = await response.text();
    let data = null;
    if (text.trim()) {
      try { data = JSON.parse(text); }
      catch { data = text; }
    }
    if (!response.ok) {
      const detail = typeof data === "string" ? data : JSON.stringify(data || {});
      const error = new Error(`OpenCode Async API respondeu HTTP ${response.status}. ${trim(detail, 4000)}`);
      error.httpStatus = response.status;
      error.responseData = data;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      if (externalSignal?.aborted) {
        const reason = externalSignal.reason;
        throw createCancelledError(reason?.message || reason || "Execução cancelada pelo usuário.");
      }
      const wrapped = new Error(`OpenCode Async API excedeu ${Math.round(timeoutMs / 1000)} segundos em ${method} ${route}.`);
      wrapped.openCodeCode = "REQUEST_TIMEOUT";
      throw wrapped;
    }
    if (error instanceof TypeError || /fetch failed/i.test(String(error?.message || ""))) {
      const wrapped = new Error(`Falha de comunicação com o servidor local do OpenCode em ${method} ${route}.`);
      wrapped.openCodeCode = "FETCH_FAILED";
      throw wrapped;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

async function waitForOpenCodeServer(serverState, ctx) {
  const deadline = Date.now() + Math.min(10000, ctx.remainingMs(10000));
  let lastError = "";
  while (Date.now() < deadline) {
    ctx.throwIfCancelled();
    if (serverState.child.exitCode !== null) {
      throw new Error(`O servidor local do OpenCode encerrou antes de iniciar.\n${trim(serverState.logs, 5000)}`);
    }
    try {
      const health = await openCodeApiRequest(
        serverState.baseUrl,
        serverState.password,
        "GET",
        "/global/health",
        { timeoutMs: Math.min(1500, ctx.remainingMs(1500)), signal: ctx.signal }
      );
      if (health?.healthy === true) return health;
    } catch (error) {
      lastError = error.message;
    }
    ctx.update("Iniciando o servidor local do OpenCode...", 18);
    await sleep(300);
  }
  throw new Error(`O servidor local do OpenCode não ficou pronto em 10 segundos. ${lastError}\n${trim(serverState.logs, 5000)}`);
}

async function startOpenCodeServer(settings, tools, project, ctx) {
  const port = await getFreeLocalPort();
  const password = crypto.randomBytes(24).toString("hex");
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = openCodeEnvironment(settings, tools, {
    OPENCODE_SERVER_USERNAME: "opencode",
    OPENCODE_SERVER_PASSWORD: password
  });
  const child = spawn(tools.opencode, [
    "--pure",
    "serve",
    "--hostname", "127.0.0.1",
    "--port", String(port)
  ], {
    cwd: project.path,
    env,
    shell: false,
    windowsHide: true
  });
  const state = { child, port, password, baseUrl, logs: "" };
  ctx.setCancelHandler(async () => {
    await stopOpenCodeServer(state);
  });
  const append = (chunk) => {
    const text = chunk.toString();
    state.logs = trim(`${state.logs}${text}`, 30000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("error", (error) => {
    state.logs = trim(`${state.logs}\n${error.stack || error.message}`, 30000);
  });
  const health = await waitForOpenCodeServer(state, ctx);
  log(`OpenCode Async API ativo em ${baseUrl}; versão ${health?.version || "desconhecida"}; projeto ${project.path}`);
  return state;
}

async function stopOpenCodeServer(serverState) {
  if (!serverState?.child) return;
  const child = serverState.child;
  if (child.exitCode !== null) return;
  try { child.kill(); } catch {}
  await sleep(400);
  if (child.exitCode === null && IS_WINDOWS && fs.existsSync(TASKKILL_EXE)) {
    await run(TASKKILL_EXE, ["/PID", String(child.pid), "/T", "/F"], {
      allowFailure: true,
      timeoutMs: 10000
    }).catch(() => {});
  }
  if (child.exitCode === null) {
    try { child.kill("SIGKILL"); } catch {}
  }
}

function openCodeMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const values = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".avif": "image/avif", ".mp4": "video/mp4", ".mov": "video/quicktime",
    ".webm": "video/webm", ".avi": "video/x-msvideo"
  };
  return values[ext] || "application/octet-stream";
}

function openCodeResponsePayload(value) {
  if (value && typeof value === "object" && value.data && typeof value.data === "object") return value.data;
  return value || {};
}

function openCodeResponseText(payload) {
  const parts = Array.isArray(payload?.parts) ? payload.parts : [];
  const texts = [];
  for (const part of parts) {
    if (typeof part?.text === "string" && part.text.trim()) texts.push(part.text.trim());
    const result = part?.state?.output || part?.output;
    if (typeof result === "string" && result.trim() && part?.type !== "tool") texts.push(result.trim());
  }
  return [...new Set(texts)].join("\n\n");
}

async function abortOpenCodeSession(serverState, project, sessionId) {
  if (!serverState || !sessionId) return;
  await openCodeApiRequest(
    serverState.baseUrl,
    serverState.password,
    "POST",
    `/session/${encodeURIComponent(sessionId)}/abort`,
    { directory: project.path, body: {}, timeoutMs: 5000 }
  ).catch(() => {});
}

function openCodeStructuredError(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  const candidates = [
    value.message,
    value.error?.message,
    value.data?.message,
    value.cause?.message,
    value.name
  ].filter((item) => typeof item === "string" && item.trim());
  if (candidates.length) return [...new Set(candidates.map((item) => item.trim()))].join(" • ");
  try { return JSON.stringify(value); } catch { return String(value); }
}

function openCodeMessageCollection(value) {
  const payload = openCodeResponsePayload(value);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.messages)) return payload.messages;
  return [];
}

function openCodeSessionToolState(messages) {
  const list = openCodeMessageCollection(messages);
  const calls = [];
  for (const item of list) {
    const parts = Array.isArray(item?.parts) ? item.parts : [];
    for (const part of parts) {
      if (String(part?.type || "").toLowerCase() !== "tool") continue;
      const status = String(part?.state?.status || "unknown").toLowerCase();
      calls.push({
        id: String(part?.callID || part?.id || ""),
        tool: String(part?.tool || "tool"),
        status
      });
    }
  }
  const terminal = new Set(["completed", "error", "cancelled", "aborted"]);
  const active = calls.filter((call) => !terminal.has(call.status));
  return {
    total: calls.length,
    active: active.length,
    pending: calls.filter((call) => call.status === "pending").length,
    running: calls.filter((call) => call.status === "running").length,
    completed: calls.filter((call) => call.status === "completed").length,
    errors: calls.filter((call) => call.status === "error").length,
    activeTools: [...new Set(active.map((call) => call.tool))],
    calls
  };
}

function openCodeAssistantResult(messages) {
  const list = openCodeMessageCollection(messages);
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index] || {};
    const info = item.info || {};
    const role = String(info.role || item.role || "").toLowerCase();
    if (role && role !== "assistant") continue;
    const errorText = openCodeStructuredError(info.error || item.error);
    const output = openCodeResponseText(item);
    const finish = String(info.finish || item.finish || "").toLowerCase();
    const completed = Boolean(info?.time?.completed || info?.completedAt || item?.completedAt);
    const parts = Array.isArray(item?.parts) ? item.parts : [];
    const toolParts = parts.filter((part) => String(part?.type || "").toLowerCase() === "tool");
    if (errorText || output || toolParts.length || finish || completed) {
      return {
        item,
        info,
        error: errorText,
        output,
        finish,
        toolParts,
        completed
      };
    }
  }
  return null;
}

function openCodeStatusType(status) {
  if (typeof status === "string") return status.toLowerCase();
  return String(status?.type || status?.status || status?.state || "").toLowerCase();
}

function openCodeAssistantActivitySignature(messages) {
  const list = openCodeMessageCollection(messages);
  const relevant = list.filter((item) => {
    const info = item?.info || {};
    const role = String(info.role || item?.role || "").toLowerCase();
    if (role === "assistant" || role === "tool") return true;
    if (role) return false;
    const parts = Array.isArray(item?.parts) ? item.parts : [];
    return parts.some((part) => {
      const type = String(part?.type || "").toLowerCase();
      return type.includes("tool") || type.includes("reasoning") || type.includes("step") || Boolean(part?.state);
    });
  });
  if (!relevant.length) return "";
  try {
    return crypto.createHash("sha256").update(JSON.stringify(relevant)).digest("hex");
  } catch {
    return String(relevant.length);
  }
}

async function waitForOpenCodeSessionQuiescent(serverState, project, sessionId, timeoutMs = 7000) {
  if (!serverState || !sessionId || serverState.child?.exitCode !== null) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverState.child?.exitCode !== null) return;
    try {
      const raw = await openCodeApiRequest(
        serverState.baseUrl,
        serverState.password,
        "GET",
        "/session/status",
        { directory: project.path, timeoutMs: 1200 }
      );
      const statuses = openCodeResponsePayload(raw);
      const type = openCodeStatusType(statuses?.[sessionId] || null);
      if (!type || /idle|completed|complete|done|failed|error|cancelled|aborted/.test(type)) return;
    } catch {}
    await sleep(300);
  }
}

async function abortOpenCodeSessionGracefully(serverState, project, sessionId) {
  if (!serverState) return;
  await abortOpenCodeSession(serverState, project, sessionId);
  await waitForOpenCodeSessionQuiescent(serverState, project, sessionId, 7000);
}

async function runOpenCodeServerApiCommand(settings, tools, project, promptText, attachments, ctx) {
  const model = openCodeModel(settings);
  const modelParts = openCodeModelParts(settings);
  const modelName = openCodeModelDisplayName(model);
  let serverState = null;
  let sessionId = "";
  let statusTimer = null;
  let executionStarted = false;
  let executionStartedAt = 0;
  let initialStartDeadline = 0;
  let recoveryMode = false;
  let recoveryDeadline = 0;
  let explicitRecoveryUsed = false;
  let latestAssistant = null;
  let lastStatus = "preparando";
  let lastActivitySignature = "";
  let seenBusy = false;
  let idleStreak = 0;
  let lastDetectedError = "";
  let attemptNumber = 1;
  let communicationFailureStreak = 0;
  let latestToolState = openCodeSessionToolState([]);

  const attachmentParts = [];
  for (const item of Array.isArray(attachments) ? attachments : []) {
    const absolute = path.resolve(project.path, String(item.projectPath || ""));
    const relative = path.relative(project.path, absolute);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(absolute)) continue;
    attachmentParts.push({ type: "file", mime: openCodeMime(absolute), url: pathToFileURL(absolute).href });
  }

  const resetMonitorState = () => {
    latestAssistant = null;
    lastStatus = recoveryMode ? "reiniciando" : "aguardando";
    lastActivitySignature = "";
    seenBusy = false;
    idleStreak = 0;
    communicationFailureStreak = 0;
    latestToolState = openCodeSessionToolState([]);
  };

  const installCancelHandler = () => {
    ctx.setCancelHandler(async () => {
      await abortOpenCodeSessionGracefully(serverState, project, sessionId);
      await stopOpenCodeServer(serverState);
    });
  };

  const createSessionAndSend = async (text, title) => {
    ctx.throwIfCancelled();
    const createdRaw = await openCodeApiRequest(
      serverState.baseUrl,
      serverState.password,
      "POST",
      "/session",
      {
        directory: project.path,
        body: { title },
        timeoutMs: 7000,
        signal: ctx.signal
      }
    );
    const created = openCodeResponsePayload(createdRaw);
    sessionId = String(created?.id || "");
    if (!sessionId) throw new Error(`O OpenCode não retornou o ID da sessão. ${JSON.stringify(createdRaw)}`);
    installCancelHandler();

    const parts = [{ type: "text", text }, ...attachmentParts];
    await openCodeApiRequest(
      serverState.baseUrl,
      serverState.password,
      "POST",
      `/session/${encodeURIComponent(sessionId)}/prompt_async`,
      {
        directory: project.path,
        body: {
          model: modelParts,
          agent: "build",
          // R7: explicitly expose the project tools to the headless API call.
          // Without this map some OpenRouter models only narrated the intended
          // grep/edit steps and never emitted a real tool call.
          tools: {
            read: true,
            list: true,
            glob: true,
            grep: true,
            edit: true,
            write: true,
            apply_patch: true,
            todowrite: true,
            todoread: true,
            bash: false,
            webfetch: false,
            websearch: false,
            task: false,
            skill: false,
            lsp: false,
            question: false
          },
          parts
        },
        timeoutMs: 7000,
        signal: ctx.signal
      }
    );
    resetMonitorState();
  };

  const beginRecovery = async (reason) => {
    if (!recoveryMode) {
      recoveryMode = true;
      recoveryDeadline = Date.now() + 60 * 1000;
      lastDetectedError = trim(reason || "Erro não especificado.", 2500);
      ctx.update(`Erro detectado. ${modelName} tem 60s para corrigir...`, 58, `${lastDetectedError}\n`);
    }
    if (explicitRecoveryUsed) return false;
    explicitRecoveryUsed = true;
    attemptNumber = 2;

    await abortOpenCodeSessionGracefully(serverState, project, sessionId);
    await stopOpenCodeServer(serverState);
    ctx.throwIfCancelled();
    if (Date.now() >= recoveryDeadline) return false;

    ctx.update(`Reiniciando ${modelName} para corrigir...`, 60);
    serverState = await startOpenCodeServer(settings, tools, project, ctx);
    const repairPrompt = [
      promptText,
      "",
      "RECOVERY ATTEMPT:",
      `The previous attempt started but encountered this error: ${lastDetectedError}`,
      "Inspect the current project state, repair any partial edit, and complete the original request.",
      "Do not replace the page with placeholder content. Preserve the existing structure and make the smallest safe change.",
      "Finish within this recovery attempt and leave the project in a compilable state."
    ].join("\n");
    await createSessionAndSend(repairPrompt, `Lovable Bridge recovery ${new Date().toISOString()}`);
    return true;
  };

  try {
    ctx.throwIfCancelled();
    ctx.update(`Iniciando OpenCode com ${modelName}...`, 14);
    serverState = await startOpenCodeServer(settings, tools, project, ctx);
    ctx.throwIfCancelled();

    ctx.update("Criando sessão segura...", 23);
    await createSessionAndSend(promptText, `Lovable Bridge ${new Date().toISOString()}`);
    initialStartDeadline = Date.now() + 60 * 1000;

    statusTimer = setInterval(() => {
      if (ctx.isCancelled()) return;
      if (!executionStarted && !recoveryMode) {
        const remaining = Math.max(0, Math.ceil((initialStartDeadline - Date.now()) / 1000));
        ctx.update(`Aguardando ${modelName} iniciar • ${remaining}s`, 33);
        return;
      }
      if (recoveryMode) {
        const remaining = Math.max(0, Math.ceil((recoveryDeadline - Date.now()) / 1000));
        ctx.update(`${modelName} corrigindo a tentativa • ${remaining}s`, Math.min(70, 58 + Math.floor((60 - remaining) / 5)));
        return;
      }
      const elapsed = Math.max(1, Math.round((Date.now() - executionStartedAt) / 1000));
      ctx.update(`${modelName} executando • ${elapsed}s • cancelamento disponível`, Math.min(68, 40 + Math.floor(elapsed / 8)));
    }, 1000);

    while (true) {
      ctx.throwIfCancelled();

      if (!executionStarted && !recoveryMode && Date.now() >= initialStartDeadline) {
        const timeout = new Error(`${modelName} não iniciou a execução em 60 segundos. A tentativa foi encerrada antes de qualquer alteração ser aceita.`);
        timeout.openCodeCode = "OPENCODE_START_TIMEOUT";
        throw timeout;
      }
      if (recoveryMode && Date.now() >= recoveryDeadline) {
        const timeout = new Error(`${modelName} encontrou um erro e não conseguiu concluir a correção em 60 segundos. Último erro: ${lastDetectedError || lastStatus}.`);
        timeout.openCodeCode = "OPENCODE_RECOVERY_TIMEOUT";
        throw timeout;
      }
      if (serverState?.child?.exitCode !== null) {
        const reason = `O servidor local do OpenCode encerrou com código ${serverState.child.exitCode}.`;
        if (executionStarted && await beginRecovery(reason)) continue;
        throw new Error(reason);
      }

      let status = null;
      let statusError = null;
      let messagesRaw = [];
      let messageError = null;

      try {
        const statusesRaw = await openCodeApiRequest(
          serverState.baseUrl,
          serverState.password,
          "GET",
          "/session/status",
          { directory: project.path, timeoutMs: 2200, signal: ctx.signal }
        );
        const statuses = openCodeResponsePayload(statusesRaw);
        status = statuses?.[sessionId] || null;
        lastStatus = openCodeStatusType(status) || lastStatus;
      } catch (error) {
        if (error?.code === "JOB_CANCELLED") throw error;
        statusError = error;
      }

      try {
        messagesRaw = await openCodeApiRequest(
          serverState.baseUrl,
          serverState.password,
          "GET",
          `/session/${encodeURIComponent(sessionId)}/message?limit=40`,
          { directory: project.path, timeoutMs: 2600, signal: ctx.signal }
        );
      } catch (error) {
        if (error?.code === "JOB_CANCELLED") throw error;
        messageError = error;
      }

      if (statusError && messageError) {
        communicationFailureStreak += 1;
        const communicationError = `Falha temporária de comunicação: ${statusError.message} | ${messageError.message}`;
        if (executionStarted) {
          if (!recoveryMode) {
            recoveryMode = true;
            recoveryDeadline = Date.now() + 60 * 1000;
            lastDetectedError = communicationError;
            ctx.update(`Erro de comunicação detectado. ${modelName} terá até 60s para se recuperar...`, 58, `${communicationError}\n`);
          }
          if (communicationFailureStreak >= 3 && await beginRecovery(communicationError)) continue;
          await sleep(900);
          continue;
        }
        await sleep(900);
        continue;
      }
      communicationFailureStreak = 0;

      const assistant = openCodeAssistantResult(messagesRaw);
      if (assistant) latestAssistant = assistant;
      latestToolState = openCodeSessionToolState(messagesRaw);
      const activitySignature = openCodeAssistantActivitySignature(messagesRaw);
      const statusType = openCodeStatusType(status);
      const hasExecutionActivity = /busy|running|pending|retry/.test(statusType)
        || Boolean(activitySignature)
        || latestToolState.total > 0;

      if (hasExecutionActivity && !executionStarted) {
        executionStarted = true;
        executionStartedAt = Date.now();
        ctx.update(`${modelName} iniciou a execução. O limite inicial foi encerrado.`, 40);
      }
      if (activitySignature && activitySignature !== lastActivitySignature) {
        lastActivitySignature = activitySignature;
        if (!executionStarted) {
          executionStarted = true;
          executionStartedAt = Date.now();
        }
      }
      if (latestToolState.active > 0) {
        const activeLabel = latestToolState.activeTools.length
          ? latestToolState.activeTools.slice(0, 3).join(", ")
          : "ferramentas do projeto";
        ctx.update(`${modelName} executando ${activeLabel}...`, 48);
      }

      if (/retry/.test(statusType) && !recoveryMode) {
        recoveryMode = true;
        recoveryDeadline = Date.now() + 60 * 1000;
        lastDetectedError = openCodeStructuredError(status) || `A sessão entrou em ${statusType}.`;
        ctx.update(`${modelName} encontrou um erro e está tentando novamente por até 60s...`, 58, `${lastDetectedError}\n`);
      }

      const fatalStatus = /retry_exhausted|failed|error|cancelled|aborted/.test(statusType);
      const fatalMessage = latestAssistant?.error || (fatalStatus ? (openCodeStructuredError(status) || `Status ${statusType}`) : "");
      if (fatalMessage) {
        if (await beginRecovery(fatalMessage)) continue;
        const providerError = new Error(`${modelName} não conseguiu concluir a tarefa: ${fatalMessage}`);
        providerError.openCodeCode = "OPENCODE_EXECUTION_ERROR";
        throw providerError;
      }

      const assistantFinish = String(latestAssistant?.finish || "").toLowerCase();
      const assistantTurnIsToolCall = assistantFinish === "tool-calls"
        || assistantFinish === "tool_calls"
        || assistantFinish === "unknown";
      const assistantTurnIsTerminal = Boolean(latestAssistant?.completed)
        && !assistantTurnIsToolCall
        && latestToolState.active === 0;
      const statusIsBusy = /busy|running|pending|retry/.test(statusType);
      const statusIsTerminal = /idle|completed|complete|done/.test(statusType);

      if (statusIsBusy || latestToolState.active > 0 || assistantTurnIsToolCall) {
        seenBusy = true;
        idleStreak = 0;
      } else if (assistantTurnIsTerminal && (statusIsTerminal || !statusType)) {
        idleStreak += 1;
      } else {
        idleStreak = 0;
      }

      // R12: OpenCode marks an individual assistant turn as completed even when
      // its finish reason is tool-calls. The session is not complete at that
      // point: the tool must run and OpenCode must continue with another turn.
      // Returning early here aborted the server before grep/edit/write persisted.
      if (assistantTurnIsTerminal && idleStreak >= 2) {
        if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
        ctx.throwIfCancelled();
        ctx.update(`Consultando alterações de ${modelName}...`, 71);
        const diffRaw = await openCodeApiRequest(
          serverState.baseUrl,
          serverState.password,
          "GET",
          `/session/${encodeURIComponent(sessionId)}/diff`,
          { directory: project.path, timeoutMs: 5000, signal: ctx.signal }
        ).catch(() => []);
        const diff = openCodeResponsePayload(diffRaw);
        const info = latestAssistant?.info || {};
        const resolvedModel = info?.providerID && info?.modelID ? `${info.providerID}/${info.modelID}` : model;
        return {
          output: latestAssistant?.output || `${modelName} concluiu a sessão pela API assíncrona do OpenCode.`,
          model: resolvedModel,
          usage: info?.tokens || info?.usage || null,
          diff: Array.isArray(diff) ? diff : [],
          toolState: latestToolState,
          sessionId,
          attemptNumber,
          recovered: recoveryMode,
          transport: "prompt_async-tool-lifecycle-r12"
        };
      }

      await sleep(900);
    }
  } catch (error) {
    if (statusTimer) clearInterval(statusTimer);
    await abortOpenCodeSessionGracefully(serverState, project, sessionId);
    if (error?.code === "JOB_CANCELLED") throw error;
    const serverLog = trim(serverState?.logs || "", 3000);
    if (serverLog && !String(error.message || "").includes(serverLog)) {
      error.message = `${error.message}\n\nOpenCode server log:\n${serverLog}`;
    }
    throw error;
  } finally {
    if (statusTimer) clearInterval(statusTimer);
    await abortOpenCodeSessionGracefully(serverState, project, sessionId);
    await stopOpenCodeServer(serverState);
    await sleep(500);
    ctx.setCancelHandler(null);
  }
}

function assertOpenCodeManagedIsolation() {
  if (!IS_WINDOWS) return;
  const programData = process.env.ProgramData || "C:\\ProgramData";
  const managedRoot = path.join(programData, "opencode");
  const blocked = [
    path.join(managedRoot, "opencode.json"),
    path.join(managedRoot, "opencode.jsonc")
  ].filter((entry) => fs.existsSync(entry));
  if (blocked.length) {
    throw new Error(
      "O Windows possui uma configuração administrada do OpenCode que pode substituir as regras de segurança do Lovable Bridge. " +
      "A execução foi bloqueada e nenhum arquivo foi alterado."
    );
  }
}

function assertOpenCodeProjectIsolation(projectPath) {
  const blocked = [
    path.join(projectPath, "opencode.json"),
    path.join(projectPath, "opencode.jsonc"),
    path.join(projectPath, ".opencode")
  ].filter((entry) => fs.existsSync(entry));
  if (blocked.length) {
    throw new Error(
      `O projeto contém configuração própria do OpenCode (${blocked.map((entry) => path.basename(entry)).join(", ")}). ` +
      "A execução foi bloqueada para impedir plugins, regras ou ferramentas não controladas pelo Lovable Bridge. Nenhum arquivo foi alterado."
    );
  }
}

async function runOpenCodeEdit(settings, profile, project, userPrompt, attachments, ctx, requestedWorkMode = "auto") {
  if (project.githubLogin?.toLowerCase() !== profile.github.login?.toLowerCase()) {
    throw new Error(`Este projeto pertence à conta ${project.githubLogin}. O perfil atual está conectado como ${profile.github.login}.`);
  }
  const tools = getTools(settings);
  const startedAt = Date.now();
  const prompt = String(userPrompt || "").trim();
  if (prompt.length < 4) throw new Error("Descreva a alteração desejada.");
  const workMode = inferWorkMode(prompt, requestedWorkMode);
  const media = Array.isArray(attachments) ? attachments.slice(0, MEDIA_LIMIT) : [];
  assertOpenCodeManagedIsolation();
  assertOpenCodeProjectIsolation(project.path);

  ctx.update("Verificando OpenCode e OpenRouter...", 8);
  await verifyOpenCodeProvider(settings, tools, ctx);
  ctx.throwIfCancelled();
  const tracker = await beginTrackedChange(settings, profile, project, prompt, media, "opencode");
  const previewWasRunning = previewStatus(profile, project).running;
  if (previewWasRunning) {
    ctx.update("Pausando o preview para evitar exibir arquivos parciais...", 11);
    try { await stopPreview(profile, project); }
    catch (error) { log(`Não foi possível pausar o preview antes do OpenCode: ${error.message}`); }
  }
  ctx.update("Preparando uma sessão segura...", 12);

  const mediaLines = media.length
    ? [
        "The user attached the following files. They are already copied inside the project:",
        ...media.map((item, index) => `${index + 1}. ${item.projectPath} (public URL to use in the website: ${item.publicPath})`),
        "Use the exact public URL when the request asks to place an attachment in the site.",
        "Do not move, rename, duplicate, optimize, or transform attachments unless explicitly requested.",
        "Do not invent other attachment paths.",
        ""
      ]
    : [];

  const instructions = [
    ...workModePromptLines(prompt, workMode),
    "You are editing an existing Lovable project on macOS.",
    "Work only inside the active project workspace.",
    "Do not access files outside this project.",
    "Do not use Git, do not commit, do not push, and do not change the .git directory.",
    "Do not run shell commands, install packages, or change environment variables.",
    "Do not modify real .env files, credentials, secrets, package.json, deployment settings, lockfiles, or package dependencies.",
    "Do not access the internet.",
    "Use only project file reading, search, and editing tools.",
    "Do not ask follow-up questions during this non-interactive run. When wording is ambiguous, choose the smallest conservative interpretation.",
    "Implement the requested change in the project files; do not merely explain how to do it.",
    "Begin by using list, glob, grep, and read tools to locate the exact implementation, then use edit, write, or apply_patch to persist the requested change.",
    "Do not stop after writing a plan, analysis, or explanation. A successful run must operate on the project files.",
    "Implement only the user's requested change for the selected work mode and make the smallest safe edit.",
    "For a color, font, spacing, alignment, or wording request, edit only the minimum tokens needed. Never rewrite the whole file.",
    "Never replace an existing page or route with placeholder content, simplified demo content, or a temporary Hello route.",
    "Before finishing, verify that the requested target still exists and the original page structure, imports, exports, components, and content remain intact.",
    "Preserve unrelated pages, text, styles, components, responsive behavior, links, and functionality.",
    "Do not create documentation, reports, screenshots, or auxiliary files inside the project.",
    ...mediaLines,
    "USER REQUEST:",
    prompt
  ].join("\n");

  let result;
  let afterTree;
  try {
    result = await runOpenCodeServerApiCommand(settings, tools, project, instructions, media, ctx);
    ctx.throwIfCancelled();
    ctx.update("Verificando arquivos alterados...", 74);
    afterTree = await captureWorkingTree(settings, profile, project);

    if (afterTree === tracker.beforeTree) {
      const selectedName = openCodeModelDisplayName(openCodeModel(settings));
      ctx.update(`${selectedName} respondeu sem editar arquivos. Fazendo uma segunda tentativa de execução...`, 52);
      const retryInstructions = [
        instructions,
        "",
        "MANDATORY EXECUTION RETRY:",
        "The previous attempt returned text but made no persistent project-file changes.",
        "This is not a request for a plan or explanation. Inspect the repository with list/glob/grep/read and apply the original request with edit, write, or apply_patch now.",
        "Do not finish until the requested change is persisted in the smallest appropriate project file(s).",
        "Preserve the current page structure and all unrelated content."
      ].join("\n");
      const retryResult = await runOpenCodeServerApiCommand(settings, tools, project, retryInstructions, media, ctx);
      result = {
        ...retryResult,
        output: [result?.output, retryResult?.output].filter(Boolean).join("\n\n--- Segunda tentativa ---\n\n"),
        retriedAfterNoChanges: true
      };
      ctx.throwIfCancelled();
      ctx.update("Verificando arquivos após a segunda tentativa...", 74);
      afterTree = await captureWorkingTree(settings, profile, project);
    }
  } catch (error) {
    let rollbackError = null;
    try { await rollbackTrackedChangeVerified(settings, profile, project, tracker); }
    catch (restoreError) { rollbackError = restoreError; log(restoreError.message); }
    await restorePreviewAfterOpenCode(settings, profile, project, previewWasRunning);
    if (rollbackError) {
      error.message = `${error.message}

ATENÇÃO: ${rollbackError.message}`;
    }
    recordAgentUsage({
      engine: "opencode",
      integration: "server-api",
      outcome: "failed",
      durationMs: Date.now() - startedAt,
      promptLength: prompt.length,
      attachmentCount: media.length,
      model: openCodeModel(settings),
      error: trim(error.message, 5000)
    });
    if (error?.code === "JOB_CANCELLED" || ctx.isCancelled()) {
      throw createCancelledError(ctx.signal?.reason?.message || error.message || "Execução cancelada. O projeto foi restaurado.");
    }
    if (openCodeAuthMissing(error.message)) {
      throw new Error("O OpenCode não conseguiu autenticar no OpenRouter. Clique em ‘Configurar OpenCode / OpenRouter’ e conecte novamente a chave.");
    }
    if (openCodeLimitReached(error.message)) {
      throw new Error("O OpenRouter ou o modelo gratuito selecionado atingiu um limite temporário. Nenhuma alteração foi mantida. Aguarde a renovação ou tente outro motor disponível.");
    }
    throw error;
  }

  ctx.throwIfCancelled();
  if (afterTree === tracker.beforeTree) {
    await rollbackTrackedChangeVerified(settings, profile, project, tracker);
    await restorePreviewAfterOpenCode(settings, profile, project, previewWasRunning);
    recordAgentUsage({
      engine: "opencode",
      integration: "server-api",
      outcome: "no-changes",
      durationMs: Date.now() - startedAt,
      promptLength: prompt.length,
      attachmentCount: media.length,
      model: result.model,
      usage: result.usage
    });
    const diffNote = result.diff?.length ? `

A API informou ${result.diff.length} diff(s), mas o Git não detectou mudança persistida.` : "";
    const toolState = result.toolState || {};
    const toolNote = Number(toolState.total || 0) > 0
      ? `

Ferramentas observadas: ${toolState.total}; concluídas: ${toolState.completed || 0}; erros: ${toolState.errors || 0}; ativas ao encerrar: ${toolState.active || 0}.`
      : `

Nenhuma chamada de ferramenta foi observada na sessão.`;
    throw new Error(`O modelo ${openCodeModelDisplayName(openCodeModel(settings))} respondeu duas vezes, mas nenhuma alteração persistente foi detectada. O projeto foi restaurado.

${result.output}${diffNote}${toolNote}`);
  }

  ctx.update("Validando a alteração com o Safety Guard...", 78);
  const safety = await analyzeOpenCodeChangeSafety(settings, project, tracker, afterTree, prompt, workMode);
  if (!safety.ok) {
    let archived = null;
    let archiveError = null;
    try {
      archived = await archiveRejectedOpenCodeChange(settings, profile, project, tracker, afterTree, safety, result);
    } catch (error) {
      archiveError = error;
      log(`Falha ao arquivar diff rejeitado pelo Safety Guard: ${error.message}`);
    }
    await rollbackTrackedChangeVerified(settings, profile, project, tracker);
    await restorePreviewAfterOpenCode(settings, profile, project, previewWasRunning);
    recordAgentUsage({
      engine: "opencode",
      integration: "server-api",
      outcome: "safety-rejected",
      durationMs: Date.now() - startedAt,
      promptLength: prompt.length,
      attachmentCount: media.length,
      changedCount: safety.totals.files,
      changedLines: safety.totals.lines,
      model: result.model,
      usage: result.usage,
      reasons: safety.reasons,
      reportPath: archived?.reportPath || null,
      archiveError: archiveError ? trim(archiveError.message, 2000) : null
    });
    const archiveNote = archived
      ? `\n\nO diff rejeitado foi preservado para análise em:\n${archived.patchPath}`
      : `\n\nO projeto foi restaurado, mas não foi possível salvar o diff rejeitado: ${archiveError?.message || "erro desconhecido"}`;
    throw new Error(
      "O Safety Guard rejeitou a alteração do OpenCode e restaurou o projeto antes do build.\n\n" +
      safety.reasons.map((reason, index) => `${index + 1}. ${reason}`).join("\n") +
      archiveNote
    );
  }

  ctx.throwIfCancelled();
  ctx.update("Executando build automático...", 82);
  try {
    const build = await runBuild(settings, project, ctx);
    ctx.throwIfCancelled();
    const entry = await finishTrackedChange(settings, profile, project, tracker, { buildOk: true, agentOutput: result.output });
    const finalStatus = await gitStatus(settings, project);
    recordAgentUsage({
      engine: "opencode",
      integration: "server-api",
      outcome: "completed",
      durationMs: Date.now() - startedAt,
      promptLength: prompt.length,
      attachmentCount: media.length,
      changedCount: finalStatus.changedCount,
      model: result.model,
      usage: result.usage
    });
    return {
      engine: "opencode",
      integration: "server-api",
      model: result.model,
      historyEntry: entry,
      agentOutput: [`Modo de trabalho: ${workModeLabel(workMode)}.`, `Arquivos validados: ${safety.totals.files}; linhas alteradas: ${safety.totals.lines}.`, result.output || `Alteração concluída pela API assíncrona do OpenCode usando ${result.model}.`].join("\n"),
      usage: result.usage,
      buildOk: true,
      buildOutput: build.output,
      status: finalStatus,
      preview: await startPreview(settings, profile, project)
    };
  } catch (error) {
    const rejected = await rollbackAfterBuildFailure(settings, profile, project, tracker, afterTree, error, result, ctx);
    recordAgentUsage({
      engine: "opencode",
      integration: "server-api",
      outcome: "build-rejected-rolled-back",
      durationMs: Date.now() - startedAt,
      promptLength: prompt.length,
      attachmentCount: media.length,
      model: result.model,
      usage: result.usage,
      error: trim(error.message, 3000),
      reportPath: rejected.archived?.reportPath || null
    });
    throw new Error(rejected.message);
  }
}

const CODEX_UNSET_ENV = [
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_ORG_ID",
  "OPENAI_ORGANIZATION",
  "OPENAI_PROJECT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT"
];
const CODEX_DEFAULT_MODEL = "gpt-5.6-terra";
const CODEX_MODEL_CATALOG = [
  { preference: "luna", id: "gpt-5.6-luna", name: "GPT-5.6 Luna", role: "economy" },
  { preference: "terra", id: "gpt-5.6-terra", name: "GPT-5.6 Terra", role: "balanced" },
  { preference: "sol", id: "gpt-5.6-sol", name: "GPT-5.6 Sol", role: "advanced" }
];

function normalizeCodexModelPreference(value) {
  const model = String(value || "auto").trim().toLowerCase();
  if (["gpt-5.6-luna", "luna"].includes(model)) return "luna";
  if (["gpt-5.6-terra", "terra"].includes(model)) return "terra";
  if (["gpt-5.6-sol", "sol"].includes(model)) return "sol";
  return "auto";
}

function parseVersionTuple(value) {
  const match = String(value || "").match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(tuple, minimum) {
  if (!tuple) return false;
  for (let index = 0; index < 3; index += 1) {
    if (tuple[index] > minimum[index]) return true;
    if (tuple[index] < minimum[index]) return false;
  }
  return true;
}

async function codexModelCatalog(tools) {
  const result = await run(tools.codex, ["--version"], { allowFailure: true, timeoutMs: 30000, env: codexExecutionEnvironment(), unsetEnv: CODEX_UNSET_ENV });
  const versionText = String(result.output || "").trim().split(/\r?\n/)[0] || "";
  const supports56 = versionAtLeast(parseVersionTuple(versionText), [0, 144, 0]);
  const models = supports56 ? CODEX_MODEL_CATALOG : CODEX_MODEL_CATALOG.filter((item) => item.preference === "terra");
  return {
    cliVersion: versionText,
    supports56Selection: supports56,
    defaultModel: CODEX_DEFAULT_MODEL,
    models,
    warning: supports56 ? "" : "Atualize o Codex CLI para 0.144.0 ou posterior para selecionar Luna ou Sol."
  };
}

function codexModelDecision(prompt, requestedWorkMode, requestedPreference, catalog) {
  const preference = normalizeCodexModelPreference(requestedPreference);
  const available = new Map((catalog?.models || []).map((item) => [item.preference, item]));
  const mode = inferWorkMode(prompt, requestedWorkMode);
  const classification = classifyOpenCodeSafetyPrompt(prompt, mode);
  if (preference !== "auto") {
    const selected = available.get(preference) || available.get("terra") || CODEX_MODEL_CATALOG.find((item) => item.preference === "terra");
    return {
      model: selected.id,
      preference: selected.preference,
      automatic: false,
      reason: selected.preference === preference
        ? `Modelo selecionado manualmente: ${selected.name}.`
        : `O modelo solicitado não está disponível nesta instalação; usando ${selected.name}.`
    };
  }
  const value = normalizeSafetyText(prompt);
  const broadOrSensitive = classification.globalScope
    || ["forms", "advanced"].includes(mode)
    || /\b(implement|create|configure|connect|rewrite every|all pages|every page|performance|responsive|redirect|canonical|supabase|email|form|api|database|migration|auth|security|refactor|implemente|crie|configure|conecte|todas as paginas|desempenho|responsiv)\b/i.test(value)
    || String(prompt || "").length > 320;
  const simpleLocal = classification.simple && !classification.destructive && !classification.globalScope && String(prompt || "").length <= 240;
  const auditReadOnly = mode === "seo" && classification.auditOnly;
  const chooseLuna = available.has("luna") && (auditReadOnly || (simpleLocal && !broadOrSensitive));
  const selected = chooseLuna
    ? available.get("luna")
    : (available.get("terra") || CODEX_MODEL_CATALOG.find((item) => item.preference === "terra"));
  return {
    model: selected.id,
    preference: selected.preference,
    automatic: true,
    reason: chooseLuna
      ? (auditReadOnly ? "GPT-5.6 Luna selecionado automaticamente para auditoria somente leitura." : "GPT-5.6 Luna selecionado automaticamente para uma alteração simples e localizada.")
      : "GPT-5.6 Terra selecionado automaticamente porque a tarefa é ampla, técnica, multi-arquivo ou incerta."
  };
}

function codexModelUnavailable(error) {
  return /model.*(?:not found|unavailable|not available|unsupported|access|permission)|unknown model|does not have access|modelo.*(?:indisponivel|nao disponivel|sem acesso)/i.test(String(error?.message || error || ""));
}


function codexBusinessHome() {
  return path.join(USER_ROOT, "CodexAccounts", "firmino-business");
}

function codexBusinessAuthPath() {
  return path.join(codexBusinessHome(), "auth.json");
}

function codexBusinessVerificationPath() {
  return path.join(codexBusinessHome(), "LOGIN-VERIFICADO.txt");
}

function ensureCodexBusinessHome() {
  const businessHome = codexBusinessHome();
  fs.mkdirSync(businessHome, { recursive: true });
  const configPath = path.join(businessHome, "config.toml");
  let content = "";
  try { content = fs.readFileSync(configPath, "utf8"); } catch {}
  if (/^\s*cli_auth_credentials_store\s*=/m.test(content)) {
    content = content.replace(/^\s*cli_auth_credentials_store\s*=.*$/m, 'cli_auth_credentials_store = "file"');
  } else {
    content = `cli_auth_credentials_store = "file"\r\n${content}`;
  }
  fs.writeFileSync(configPath, content, "utf8");
  return businessHome;
}

function codexExecutionEnvironment() {
  const env = { ...process.env, NO_COLOR: "1", CODEX_HOME: codexBusinessHome() };
  for (const key of CODEX_UNSET_ENV) delete env[key];
  return env;
}

async function codexBusinessStatus(tools) {
  const configured = fs.existsSync(codexBusinessAuthPath());
  if (!configured) {
    return {
      configured: false,
      authenticated: false,
      verified: false,
      detail: "Codex Business ainda não configurado."
    };
  }
  const status = await run(tools.codex, ["login", "status"], {
    timeoutMs: 30 * 1000,
    allowFailure: true,
    env: codexExecutionEnvironment(),
    unsetEnv: CODEX_UNSET_ENV
  });
  const output = String(status.output || "").trim();
  const authenticated = status.code === 0 && /chatgpt/i.test(output);
  if (authenticated) {
    try { writeCodexBusinessVerification(output.split(/\r?\n/)[0] || "Logged in using ChatGPT"); } catch {}
  } else {
    try { fs.unlinkSync(codexBusinessVerificationPath()); } catch {}
  }
  return {
    configured: true,
    authenticated,
    verified: authenticated && fs.existsSync(codexBusinessVerificationPath()),
    detail: output.split(/\r?\n/)[0] || "Status indisponível."
  };
}

function backupCodexBusinessAuth() {
  const authPath = codexBusinessAuthPath();
  if (!fs.existsSync(authPath)) return null;
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const backupPath = path.join(codexBusinessHome(), `auth-backup-${stamp}.json`);
  fs.renameSync(authPath, backupPath);
  return backupPath;
}

function restoreCodexBusinessAuthBackup(backupPath) {
  if (!backupPath || !fs.existsSync(backupPath)) return false;
  const authPath = codexBusinessAuthPath();
  if (fs.existsSync(authPath)) return false;
  fs.renameSync(backupPath, authPath);
  return true;
}

function codexBusinessBrowserLoginDetails(output) {
  const clean = stripAnsi(output).replace(/\r/g, "");
  const candidates = clean.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const authorizationUrl = candidates
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
  const callbackMatch = clean.match(/http:\/\/localhost:(\d+)/i);
  return {
    authorizationUrl,
    callbackUrl: callbackMatch ? callbackMatch[0] : ""
  };
}

function writeCodexBusinessVerification(statusDetail = "Logged in using ChatGPT") {
  ensureCodexBusinessHome();
  fs.writeFileSync(
    codexBusinessVerificationPath(),
    `Codex Business verificado em ${now()}\r\n${String(statusDetail || "").trim()}\r\n`,
    "utf8"
  );
}

function startCodexBusinessBrowserLogin(options = {}) {
  const settings = loadSettings();
  const tools = getTools(settings);
  assertFile(tools.codex, "Codex CLI");
  const reset = Boolean(options.reset);
  const authBackup = reset ? backupCodexBusinessAuth() : null;
  ensureCodexBusinessHome();
  try { fs.unlinkSync(codexBusinessVerificationPath()); } catch {}

  const job = createJob("codex-business-browser-login", null, null, async (ctx) => {
    const preferredCwd = USER_HOME || "";
    const cwd = preferredCwd && fs.existsSync(preferredCwd) ? preferredCwd : USER_ROOT;
    ctx.update(
      "Iniciando login do Codex Business...",
      8,
      "O Bridge vai abrir a autorizacao normal do ChatGPT no navegador. Mantenha esta tela aberta ate a confirmacao.\n"
    );

    return await new Promise((resolve, reject) => {
      let child = null;
      let output = "";
      let settled = false;
      let details = { authorizationUrl: "", callbackUrl: "" };

      const finishError = (error) => {
        if (settled) return;
        settled = true;
        try { restoreCodexBusinessAuthBackup(authBackup); } catch {}
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const append = (chunk) => {
        const clean = stripAnsi(chunk?.toString?.("utf8") || String(chunk || ""));
        if (!clean) return;
        output = trim(`${output}${clean}`, 50000);
        details = codexBusinessBrowserLoginDetails(output);
        const guidance = details.authorizationUrl
          ? `\nAbra no navegador: ${details.authorizationUrl}\n`
          : "";
        ctx.update(
          details.authorizationUrl ? "Autorize o Codex Business no navegador..." : "Preparando autorizacao segura...",
          details.authorizationUrl ? 35 : 18,
          `${clean}${guidance}`
        );
      };

      const loginEnv = codexExecutionEnvironment();
      for (const key of ["CI", "SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY"]) delete loginEnv[key];

      try {
        child = spawn(tools.codex, ["login"], {
          cwd,
          env: loginEnv,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"]
        });
      } catch (error) {
        finishError(new Error(`Nao foi possivel iniciar o Codex Business: ${error.message}`));
        return;
      }

      ctx.setCancelHandler(() => {
        if (child && child.exitCode === null) killChildTree(child);
      });

      child.stdout?.on("data", append);
      child.stderr?.on("data", append);
      child.once("error", (error) => {
        finishError(new Error(`Falha ao iniciar o login do Codex Business: ${error.message}`));
      });
      child.once("close", async (code) => {
        if (settled) return;
        if (ctx.isCancelled()) {
          finishError(createCancelledError("Login do Codex Business cancelado."));
          return;
        }
        if (code !== 0) {
          const compact = trim(stripAnsi(output).trim(), 5000);
          finishError(new Error(
            `O login do Codex Business terminou com codigo ${code}.${compact ? `\n\n${compact}` : ""}`
          ));
          return;
        }
        try {
          ctx.update("Verificando o login do Codex Business...", 88);
          const status = await codexBusinessStatus(tools);
          if (!status.authenticated) {
            throw new Error(status.detail || "O Codex concluiu o fluxo, mas o login nao foi confirmado.");
          }
          writeCodexBusinessVerification(status.detail);
          settled = true;
          resolve({
            authenticated: true,
            configured: true,
            verified: true,
            detail: status.detail,
            authorizationUrl: details.authorizationUrl,
            callbackUrl: details.callbackUrl,
            authBackup
          });
        } catch (error) {
          finishError(error);
        }
      });
    });
  }, {
    cancelable: true,
    timeoutMs: 16 * 60 * 1000,
    timeoutMessage: "O login do Codex Business excedeu 16 minutos e foi cancelado."
  });

  return { jobId: job.id, authBackup };
}

async function verifyCodexChatGptLogin(tools) {
  const status = await codexBusinessStatus(tools);
  if (!status.configured || !status.authenticated) {
    throw new Error(
      "O Codex Business ainda não está conectado. Selecione Codex Business e clique em ‘Configurar Codex Business’ na extensão."
    );
  }
  return status.detail;
}

function parseCodexJsonLine(line, state, ctx) {
  let event;
  try { event = JSON.parse(line); } catch { return false; }
  const type = String(event.type || "");
  if (type === "thread.started") {
    ctx.update("Codex Business iniciou a tarefa...", 18);
  } else if (type === "turn.started") {
    ctx.update("Codex Business analisando o projeto...", 28);
  } else if (type === "item.started") {
    const itemType = event.item?.type;
    if (itemType === "command_execution") ctx.update("Codex Business localizando os arquivos...", 38);
  } else if (type === "item.completed") {
    const item = event.item || {};
    if (item.type === "agent_message" && item.text) {
      state.messages.push(String(item.text));
    }
  } else if (type === "turn.completed") {
    state.usage = event.usage || null;
    ctx.update("Codex Business gerou a proposta...", 52);
  }
  return true;
}

function killChildTree(child) {
  try { child.kill(); } catch {}
  if (IS_WINDOWS && fs.existsSync(TASKKILL_EXE) && child?.pid) {
    try {
      const killer = spawn(TASKKILL_EXE, ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
      killer.unref();
    } catch {}
  }
}

function runCodexPatchCommand(tools, project, promptText, ctx, stageLabel = "Codex Business analisando o projeto...", model = CODEX_DEFAULT_MODEL) {
  assertFile(tools.rg, "Ripgrep (rg)");
  const args = [
    "--sandbox", "read-only",
    "--ask-for-approval", "never",
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--json",
    "--model", model,
    "--cd", project.path,
    "-"
  ];
  const env = codexExecutionEnvironment();
  const timeoutMs = 15 * 60 * 1000;
  ctx.update(stageLabel, 24);

  return new Promise((resolve, reject) => {
    const child = spawn(tools.codex, args, {
      cwd: project.path,
      env,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let pending = "";
    let settled = false;
    const state = { messages: [], usage: null };

    const cleanup = () => {
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", abortListener);
      ctx.setCancelHandler(null);
    };
    const finishError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      killChildTree(child);
      reject(error);
    };
    const abortListener = () => {
      const reason = ctx.signal?.reason;
      finishError(createCancelledError(reason?.message || reason || "Execução cancelada pelo usuário."));
    };
    const timer = setTimeout(() => {
      finishError(new Error("O Codex Business excedeu 15 minutos. A alteração foi cancelada e o projeto será restaurado."));
    }, timeoutMs);

    ctx.setCancelHandler(() => killChildTree(child));
    if (ctx.signal?.aborted) abortListener();
    else ctx.signal?.addEventListener("abort", abortListener, { once: true });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) {
        const clean = line.trim();
        if (!clean) continue;
        if (!parseCodexJsonLine(clean, state, ctx)) ctx.append(`${clean}\n`);
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      // Tool-router failures can be recoverable while the agent keeps working.
      // Keep stderr for the final diagnostic, but do not show transient errors
      // in the progress overlay unless the whole Codex process fails.
    });
    child.on("error", (error) => finishError(error));
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (pending.trim()) parseCodexJsonLine(pending.trim(), state, ctx);
      const agentText = trim(state.messages.join("\n\n"), 200000);
      const output = trim([agentText, stderr].filter(Boolean).join("\n\n"), 200000);
      if (code !== 0) {
        const error = new Error(output || `O Codex terminou com código ${code}.`);
        error.code = code;
        return reject(error);
      }
      resolve({ code, stdout: trim(stdout, 300000), stderr: trim(stderr), output, agentText, usage: state.usage });
    });

    child.stdin.on("error", () => {});
    child.stdin.write(promptText);
    child.stdin.end();
  });
}

function runCodexWorkspaceEditCommand(tools, project, promptText, ctx, stageLabel = "Codex Business aplicando a edição diretamente...", model = CODEX_DEFAULT_MODEL) {
  assertFile(tools.rg, "Ripgrep (rg)");
  const args = [
    "--sandbox", "workspace-write",
    "--ask-for-approval", "never",
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--json",
    "--model", model,
    "--cd", project.path,
    "-"
  ];
  const env = codexExecutionEnvironment();
  const timeoutMs = 15 * 60 * 1000;
  ctx.update(stageLabel, 62);

  return new Promise((resolve, reject) => {
    const child = spawn(tools.codex, args, {
      cwd: project.path,
      env,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let pending = "";
    let settled = false;
    const state = { messages: [], usage: null };

    const cleanup = () => {
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", abortListener);
      ctx.setCancelHandler(null);
    };
    const finishError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      killChildTree(child);
      reject(error);
    };
    const abortListener = () => {
      const reason = ctx.signal?.reason;
      finishError(createCancelledError(reason?.message || reason || "Execução cancelada pelo usuário."));
    };
    const timer = setTimeout(() => {
      finishError(new Error("O Codex Business excedeu 15 minutos durante a edição direta. A tarefa foi cancelada e o projeto será restaurado."));
    }, timeoutMs);

    ctx.setCancelHandler(() => killChildTree(child));
    if (ctx.signal?.aborted) abortListener();
    else ctx.signal?.addEventListener("abort", abortListener, { once: true });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) {
        const clean = line.trim();
        if (!clean) continue;
        if (!parseCodexJsonLine(clean, state, ctx)) ctx.append(`${clean}\n`);
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      // Tool-router failures can be recoverable while the agent keeps working.
      // Keep stderr for the final diagnostic, but do not show transient errors
      // in the progress overlay unless the whole Codex process fails.
    });
    child.on("error", (error) => finishError(error));
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (pending.trim()) parseCodexJsonLine(pending.trim(), state, ctx);
      const agentText = trim(state.messages.join("\n\n"), 200000);
      const output = trim([agentText, stderr].filter(Boolean).join("\n\n"), 200000);
      if (code !== 0) {
        const error = new Error(output || `O Codex terminou a edição direta com código ${code}.`);
        error.code = code;
        return reject(error);
      }
      resolve({ code, stdout: trim(stdout, 300000), stderr: trim(stderr), output, agentText, usage: state.usage });
    });

    child.stdin.on("error", () => {});
    child.stdin.write(promptText);
    child.stdin.end();
  });
}

function normalizeUnifiedDiff(text) {
  if (!String(text || "").trim()) return "";
  let value = String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^[\uFEFF\u200B\s]+|[\uFEFF\u200B\s]+$/g, "");
  const fenced = value.match(/```(?:diff|patch)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1].includes("diff --git ")) value = fenced[1];
  const start = value.indexOf("diff --git ");
  if (start < 0) return "";
  value = value.slice(start);
  const out = [];
  let inPatch = false;
  for (const rawLine of value.split("\n")) {
    const line = rawLine.replace(/[ \t]+$/g, "");
    if (/^diff --git /.test(line)) {
      inPatch = true;
      out.push(line);
      continue;
    }
    if (!inPatch) continue;
    if (/^```/.test(line)) break;
    if (/^(Explanation|Resumo|Summary|Done|Observa[cç][aã]o|Nota):/i.test(line)) break;
    out.push(line);
  }
  const result = out.join("\n").trim();
  return result ? `${result}\n` : "";
}

function sumCodexUsage(...usages) {
  const keys = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens"];
  const result = {};
  for (const key of keys) {
    result[key] = usages.reduce((total, usage) => total + Number(usage?.[key] || 0), 0);
  }
  return result;
}

function codexUsageSummary(usage) {
  if (!usage) return "";
  const input = Number(usage.input_tokens || 0);
  const cached = Number(usage.cached_input_tokens || 0);
  const output = Number(usage.output_tokens || 0);
  const ratio = input > 0 ? Math.round((cached * 1000) / input) / 10 : 0;
  const uncached = Math.max(0, input - cached);
  const credits = (uncached / 1_000_000) * 62.5 + (cached / 1_000_000) * 6.25 + (output / 1_000_000) * 375;
  return `Uso do Codex: ${input.toLocaleString("pt-BR")} tokens de entrada • ${ratio}% em cache • ${output.toLocaleString("pt-BR")} de saída • ${credits.toFixed(4)} crédito(s) estimado(s).`;
}

function validateCodexPatchPaths(patchText) {
  const protectedPatterns = [
    /^\.git(?:\/|$)/i,
      /(^|\/)(?:package-lock\.json|bun\.lockb?|pnpm-lock\.yaml|yarn\.lock)$/i,
    /(^|\/)node_modules(?:\/|$)/i
  ];
  const paths = [];
  const regex = /^diff --git a\/(.+?) b\/(.+)$/gm;
  let match;
  while ((match = regex.exec(patchText))) {
    for (const candidate of [match[1], match[2]]) {
      const normalized = String(candidate || "").replace(/\\/g, "/");
      if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.split("/").includes("..")) {
        throw new Error(`O patch tentou acessar um caminho inválido: ${normalized || "(vazio)"}`);
      }
      if (protectedPatterns.some((pattern) => pattern.test(normalized))) {
        throw new Error(`O Safety Guard bloqueou uma alteração em arquivo protegido: ${normalized}`);
      }
      paths.push(normalized);
    }
  }
  if (!paths.length) throw new Error("O Codex não devolveu um patch Git unificado válido.");
  return [...new Set(paths)];
}

function codexPatchLogRoot(profile, project) {
  const stamp = now().replace(/[-:TZ.]/g, "").slice(0, 14);
  const root = path.join(LOG_DIR, "CodexPatchRelay", sanitizeFolderName(profile.id), sanitizeFolderName(project.id), `${stamp}-${crypto.randomBytes(3).toString("hex")}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function buildCodexPatchPrompt(userPrompt, media, workMode = "auto") {
  const mediaLines = media.length
    ? [
        "ANEXOS JÁ COPIADOS PARA O PROJETO:",
        ...media.map((item, index) => `${index + 1}. arquivo: ${item.projectPath} | URL pública obrigatória: ${item.publicPath}`),
        "Os anexos são recursos ordenados. A quantidade de anexos não precisa corresponder à quantidade de elementos selecionados.",
        "Se o pedido solicitar slideshow, slider, carrossel ou sequência em um único elemento, use todos os anexos nesse componente na ordem listada.",
        "Associe um anexo a cada item somente quando o pedido for claramente uma substituição individual em lote.",
        "Não renomeie, mova, duplique, otimize ou transforme os anexos sem pedido explícito.",
        ""
      ]
    : [];
  return [
    "LOVABLE BRIDGE 1.6.0 R22 — CONTRATO FIXO DE EDIÇÃO",
    "Você está analisando um projeto Lovable existente no macOS.",
    ...workModePromptLines(userPrompt, workMode),
    "Trabalhe somente dentro do projeto atual.",
    "Não modifique arquivos diretamente. Não use apply_patch, Git, commit, push ou build.",
    "Não instale pacotes e não altere arquivos .env reais, credenciais, segredos, lockfiles, package.json ou configuração de deploy.",
    "Implemente somente o pedido do usuário com a menor alteração segura possível.",
    "Preserve páginas, textos, estilos, componentes, responsividade, links e funcionalidades não solicitadas.",
    "Leia apenas os arquivos necessários.",
    "No macOS, use rg (ripgrep) para localizar arquivos e conteúdo. O comando rg está disponível no PATH.",
    "Para padrões que começam com hífen ou contêm |, sempre use a forma segura rg -n -e \"PADRÃO\" CAMINHO. Nunca passe o padrão diretamente como um argumento que começa por -.",
    "Não use pipes, redirecionamentos ou operadores de shell em comandos rg. Use uma chamada rg simples por vez.",
    "Não use PowerShell, Get-ChildItem, Select-String, cmdlets ou scripts .ps1 para pesquisar o projeto.",
    "Quando precisar listar arquivos, prefira rg --files com globs específicos e ignore node_modules, .git, dist e build.",
    "Devolva somente um patch Git unificado válido.",
    "Nunca crie ou proponha arquivos sentinela, diagnósticos ou placeholders como PROJECT_NOT_FOUND.",
    "Se não localizar o alvo, não invente arquivo: devolva uma resposta sem patch para que o Bridge mostre o bloqueio corretamente.",
    "A resposta deve começar exatamente com diff --git e terminar na última linha do patch.",
    "Não use Markdown, cercas de código, explicações ou texto antes/depois do patch.",
    "Use caminhos relativos ao repositório e hunks mínimos.",
    ...mediaLines,
    "TAREFA VARIÁVEL DO USUÁRIO:",
    String(userPrompt || "").trim()
  ].join("\n");
}

function resolveCodexProjectFile(projectPath, relativePath) {
  const root = path.resolve(projectPath);
  const target = path.resolve(root, String(relativePath || ""));
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(rootWithSep)) {
    throw new Error(`Caminho fora do projeto rejeitado: ${relativePath}`);
  }
  return target;
}

function codexPatchHunkRanges(patchText) {
  const ranges = new Map();
  let currentPath = null;
  for (const line of String(patchText || "").replace(/\r\n/g, "\n").split("\n")) {
    const fileMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (fileMatch) {
      currentPath = fileMatch[2];
      if (!ranges.has(currentPath)) ranges.set(currentPath, []);
      continue;
    }
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (currentPath && hunkMatch) {
      ranges.get(currentPath).push({
        oldStart: Number(hunkMatch[1]),
        oldCount: Number(hunkMatch[2] || 1),
        newStart: Number(hunkMatch[3]),
        newCount: Number(hunkMatch[4] || 1)
      });
    }
  }
  return ranges;
}

function numberedCodexLines(lines, startIndex, endIndex) {
  const start = Math.max(0, startIndex);
  const end = Math.min(lines.length, endIndex);
  return lines.slice(start, end).map((line, index) => `${String(start + index + 1).padStart(6, " ")} | ${line}`).join("\n");
}

function buildCodexCurrentFileSnapshots(project, patchText, touchedPaths) {
  const ranges = codexPatchHunkRanges(patchText);
  const sections = [];
  let remaining = 240000;

  for (const relativePath of touchedPaths) {
    if (remaining <= 0) break;
    const absolutePath = resolveCodexProjectFile(project.path, relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      sections.push(`===== ARQUIVO ATUAL: ${relativePath} =====\n[arquivo ausente no projeto]`);
      continue;
    }
    const buffer = fs.readFileSync(absolutePath);
    if (buffer.includes(0)) {
      sections.push(`===== ARQUIVO ATUAL: ${relativePath} =====\n[arquivo binário omitido]`);
      continue;
    }
    const text = buffer.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = text.split("\n");
    let body = "";
    if (text.length <= 70000) {
      body = numberedCodexLines(lines, 0, lines.length);
    } else {
      const fileRanges = ranges.get(relativePath) || [];
      const windows = [];
      for (const item of fileRanges) {
        const start = Math.max(0, item.oldStart - 61);
        const end = Math.min(lines.length, item.oldStart + Math.max(item.oldCount, 1) + 60);
        if (!windows.some((entry) => start <= entry.end && end >= entry.start)) windows.push({ start, end });
      }
      if (!windows.length) windows.push({ start: 0, end: Math.min(lines.length, 500) });
      body = windows.map((entry) => numberedCodexLines(lines, entry.start, entry.end)).join("\n... trecho intermediário omitido ...\n");
    }
    const section = `===== ARQUIVO ATUAL: ${relativePath} =====\n${body}`;
    const clipped = section.slice(0, Math.max(0, remaining));
    sections.push(clipped);
    remaining -= clipped.length;
  }

  return sections.join("\n\n");
}

function buildCodexPatchRebasePrompt(userPrompt, gitError, previousPatch, snapshots, workMode = "auto") {
  return [
    "LOVABLE BRIDGE 1.6.0 R11 — REBASE DE PATCH CONTRA ARQUIVOS REAIS",
    "O patch anterior não pôde ser aplicado porque uma ou mais linhas de contexto não correspondem ao conteúdo atual do projeto.",
    "Não corrija apenas números de linha ou cabeçalhos.",
    "Gere novamente o patch completo com base EXATAMENTE nos snapshots numerados abaixo.",
    "As linhas de contexto e remoção de cada hunk precisam existir literalmente no arquivo atual.",
    "Mantenha a intenção original e faça a menor alteração possível.",
    ...workModePromptLines(userPrompt, workMode),
    "Não altere arquivos .env reais, credenciais, lockfiles, package.json, dependências, .git ou node_modules.",
    "Responda somente com um patch Git unificado começando em diff --git, sem Markdown ou explicações.",
    "Não inclua os números e separadores ' | ' dos snapshots dentro do conteúdo do patch.",
    "",
    "PEDIDO ORIGINAL DO USUÁRIO:",
    String(userPrompt || "").trim(),
    "",
    "ERRO DO GIT APPLY:",
    trim(gitError || "Patch incompatível.", 8000),
    "",
    "PATCH ANTERIOR:",
    trim(previousPatch || "", 120000),
    "",
    "SNAPSHOTS EXATOS DOS ARQUIVOS ATUAIS:",
    snapshots || "[snapshots indisponíveis; leia os arquivos atuais com rg e ferramentas de leitura]"
  ].join("\n");
}

function buildCodexPrimaryDirectEditPrompt(userPrompt, media, workMode = "auto") {
  const mediaLines = media.length
    ? [
        "ANEXOS JÁ COPIADOS PARA O PROJETO:",
        ...media.map((item, index) => `${index + 1}. arquivo: ${item.projectPath} | URL pública obrigatória: ${item.publicPath}`),
        "Use os anexos apenas conforme o pedido do usuário e preserve a ordem quando houver slideshow, slider ou carrossel.",
        ""
      ]
    : [];
  return [
    "LOVABLE BRIDGE 1.6.0 R22 — EDIÇÃO DIRETA + FALLBACK DE SANDBOX",
    ...workModePromptLines(userPrompt, workMode),
    "Você está em um sandbox gravável cuja raiz é exatamente o projeto atual.",
    "Leia os arquivos atuais antes de editar. Não gere um patch para ser aplicado externamente.",
    "Você DEVE realizar a alteração nos arquivos reais antes de responder.",
    "Use rg para pesquisar e as ferramentas internas apply_patch/edit/write para modificar arquivos.",
    "Ao pesquisar padrões que começam com hífen ou contêm |, use rg -n -e \"PADRÃO\" CAMINHO. Não use pipes nem operadores de shell.",
    "Não termine apenas com plano, análise, instruções ou um patch textual.",
    "O projeto atual já existe. Nunca crie arquivos sentinela, diagnósticos ou placeholders como PROJECT_NOT_FOUND.",
    "Se não localizar o alvo, explique isso na resposta final sem criar nenhum arquivo.",
    "Não use PowerShell, Get-ChildItem, Select-String, scripts .ps1, Git, commit, push, build ou instalação de pacotes.",
    "Não altere arquivos .env reais, credenciais, segredos, package.json, deploy, lockfiles, dependências, .git ou node_modules.",
    "Faça somente o pedido do usuário, com a menor alteração possível, preservando todo o restante.",
    "Se a tarefa mencionar um elemento visual selecionado, use o contexto da seleção para limitar a alteração ao alvo correto.",
    "Ao terminar, informe resumidamente quais arquivos foram modificados.",
    ...mediaLines,
    "PEDIDO DO USUÁRIO:",
    String(userPrompt || "").trim()
  ].join("\n");
}

function buildCodexDirectEditPrompt(userPrompt, media, gitError, workMode = "auto") {
  const mediaLines = media.length
    ? [
        "ANEXOS JÁ COPIADOS PARA O PROJETO:",
        ...media.map((item, index) => `${index + 1}. arquivo: ${item.projectPath} | URL pública obrigatória: ${item.publicPath}`),
        "Use os anexos apenas conforme o pedido do usuário e preserve a ordem quando houver slideshow, slider ou carrossel.",
        ""
      ]
    : [];
  return [
    "LOVABLE BRIDGE 1.6.0 R22 — EDIÇÃO DIRETA SEGURA DE CONTINGÊNCIA",
    ...workModePromptLines(userPrompt, workMode),
    "Você está em um sandbox gravável cuja raiz é exatamente o projeto atual.",
    "O relay de patch externo falhou por incompatibilidade de contexto. Agora edite os arquivos reais diretamente.",
    "Você DEVE realizar a alteração antes de responder. Não devolva somente um patch, plano, análise ou instruções.",
    "O projeto atual já existe. Nunca crie arquivos sentinela, diagnósticos ou placeholders como PROJECT_NOT_FOUND.",
    "Se não localizar o alvo, explique isso na resposta final sem criar nenhum arquivo.",
    "Use rg para pesquisar e a ferramenta interna apply_patch/edit para modificar arquivos.",
    "Ao pesquisar padrões que começam com hífen ou contêm |, use rg -n -e \"PADRÃO\" CAMINHO. Não use pipes nem operadores de shell.",
    "Não use PowerShell, Get-ChildItem, Select-String, scripts .ps1, Git, commit, push, build ou instalação de pacotes.",
    "Não altere arquivos .env reais, credenciais, segredos, package.json, deploy, lockfiles, dependências, .git ou node_modules.",
    "Faça somente o pedido do usuário, com a menor alteração possível, preservando todo o restante.",
    "Ao terminar, informe resumidamente quais arquivos foram modificados.",
    ...mediaLines,
    "PEDIDO DO USUÁRIO:",
    String(userPrompt || "").trim(),
    "",
    "ERRO TÉCNICO DO PATCH ANTERIOR, SOMENTE PARA CONTEXTO:",
    trim(gitError || "Patch incompatível com os arquivos atuais.", 5000)
  ].join("\n");
}

async function checkAndApplyCodexPatch(settings, tools, profile, project, patchText, userPrompt, media, ctx, logRoot, workMode = "auto", model = CODEX_DEFAULT_MODEL) {
  let patch = normalizeUnifiedDiff(patchText);
  let usageRepair = null;
  let usageDirect = null;
  const patchPath = path.join(logRoot, "proposed.patch");
  const diagnosticPath = path.join(logRoot, "patch-diagnostic.txt");

  const writePatch = () => fs.writeFileSync(patchPath, patch, "utf8");
  let touchedPaths = [];
  if (patch) {
    touchedPaths = validateCodexPatchPaths(patch);
    writePatch();
  }

  let check = patch
    ? await run(tools.git, ["-C", project.path, "apply", "--check", "--recount", "--whitespace=nowarn", patchPath], {
        allowFailure: true,
        timeoutMs: 60_000,
        signal: ctx.signal
      })
    : { code: 1, output: "Nenhum patch foi encontrado na resposta." };

  if (!patch || check.code !== 0) {
    ctx.update("Rebaseando o patch contra os arquivos atuais...", 56);
    const snapshots = buildCodexCurrentFileSnapshots(project, patch || patchText, touchedPaths);
    fs.writeFileSync(path.join(logRoot, "current-file-snapshots.txt"), snapshots || "", "utf8");
    const repairPrompt = buildCodexPatchRebasePrompt(userPrompt, check.output, patch || patchText, snapshots, workMode);
    fs.writeFileSync(path.join(logRoot, "rebase-prompt.txt"), repairPrompt, "utf8");
    const repaired = await runCodexPatchCommand(tools, project, repairPrompt, ctx, "Codex Business rebaseando o patch...", model);
    usageRepair = repaired.usage;
    fs.writeFileSync(path.join(logRoot, "rebase-agent-output.txt"), repaired.agentText || repaired.output || "", "utf8");
    patch = normalizeUnifiedDiff(repaired.agentText || repaired.output);
    if (patch) {
      touchedPaths = validateCodexPatchPaths(patch);
      writePatch();
      check = await run(tools.git, ["-C", project.path, "apply", "--check", "--recount", "--whitespace=nowarn", patchPath], {
        allowFailure: true,
        timeoutMs: 60_000,
        signal: ctx.signal
      });
    } else {
      check = { code: 1, output: "O Codex não devolveu um patch válido durante o rebase." };
    }
  }

  fs.writeFileSync(diagnosticPath, check.output || "", "utf8");
  if (check.code !== 0) {
    ctx.update("Patch incompatível; tentando edição direta segura...", 61);
    const beforeDirect = await captureWorkingTree(settings, profile, project);
    const directPrompt = buildCodexDirectEditPrompt(userPrompt, media, check.output, workMode);
    fs.writeFileSync(path.join(logRoot, "direct-edit-prompt.txt"), directPrompt, "utf8");
    const direct = await runCodexWorkspaceEditCommand(tools, project, directPrompt, ctx, "Codex Business aplicando a edição diretamente...", model);
    usageDirect = direct.usage;
    fs.writeFileSync(path.join(logRoot, "direct-edit-agent-output.txt"), direct.agentText || direct.output || "", "utf8");
    const afterDirect = await captureWorkingTree(settings, profile, project);
    if (afterDirect === beforeDirect) {
      throw new Error(
        `O patch não pôde ser aplicado e a edição direta de contingência também não produziu alterações.\n\n${trim(check.output, 3000)}\n\nRelatório: ${diagnosticPath}`
      );
    }
    return {
      patchPath: null,
      diagnosticPath,
      usageRepair,
      usageDirect,
      directEdited: true
    };
  }

  ctx.update("Aplicando a alteração aprovada...", 64);
  const applied = await run(tools.git, ["-C", project.path, "apply", "--recount", "--whitespace=nowarn", patchPath], {
    allowFailure: true,
    timeoutMs: 60_000,
    signal: ctx.signal
  });
  if (applied.code !== 0) {
    throw new Error(`O patch passou na validação, mas falhou ao ser aplicado.\n\n${trim(applied.output, 3000)}\n\nPatch: ${patchPath}`);
  }
  return {
    patchPath,
    diagnosticPath,
    usageRepair,
    usageDirect,
    directEdited: false
  };
}


function codexWritePermissionFailure(error) {
  return /writing is blocked by read-only sandbox|rejected by user approval settings|workspace is mounted read-only|permission denied|approval.*rejected/i.test(String(error?.message || error || ""));
}

function validateCodexProjectWorkspace(project) {
  const projectPath = path.resolve(String(project?.path || ""));
  if (!projectPath || !fs.existsSync(projectPath)) {
    throw new Error(`A pasta local do projeto não foi encontrada: ${project?.path || "(caminho ausente)"}. Use Atualizar ou remova e adicione novamente o projeto ao perfil.`);
  }
  const stat = fs.statSync(projectPath);
  if (!stat.isDirectory()) throw new Error(`O caminho do projeto não é uma pasta válida: ${projectPath}`);
  const entries = fs.readdirSync(projectPath).filter((name) => !/^\.(?:git|DS_Store)$/i.test(name));
  if (!entries.length) throw new Error(`A pasta local do projeto está vazia: ${projectPath}`);
  const probe = path.join(projectPath, `.lovable-bridge-write-probe-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
  } catch (error) {
    try { if (fs.existsSync(probe)) fs.unlinkSync(probe); } catch {}
    throw new Error(`O Companion não possui permissão de escrita na pasta do projeto: ${projectPath}. ${error.message}`);
  }
  return projectPath;
}

function removeUnexpectedProjectNotFoundMarker(project, existedBefore) {
  const markerPath = path.join(project.path, "PROJECT_NOT_FOUND");
  if (existedBefore || !fs.existsSync(markerPath)) return false;
  try {
    const stat = fs.statSync(markerPath);
    if (!stat.isFile()) return false;
    const content = fs.readFileSync(markerPath, "utf8");
    if (content.trim()) return false;
    fs.unlinkSync(markerPath);
    log(`Arquivo sentinela PROJECT_NOT_FOUND removido automaticamente em ${project.path}`);
    return true;
  } catch {
    return false;
  }
}

function buildCodexAuditPrompt(userPrompt, workMode = "seo") {
  return [
    "You are operating in AUDIT-ONLY mode for the active Lovable Bridge project.",
    ...workModePromptLines(userPrompt, workMode),
    "Read and search the project as needed, but do not output a unified diff and do not modify, create, rename, or delete files.",
    "Return a concise structured report with: scope checked, findings, affected routes/files, severity, evidence, and recommended next action.",
    "Clearly distinguish what was verified from source code/local preview and what still requires production, DNS, analytics, email-provider, or external-service verification.",
    "USER REQUEST:",
    String(userPrompt || "").trim()
  ].join("\n");
}

async function runCodexAudit(settings, profile, project, prompt, ctx, workMode, modelDecision) {
  const tools = getTools(settings);
  const startedAt = Date.now();
  ctx.update("Verificando a conta Codex Business...", 8);
  await verifyCodexChatGptLogin(tools);
  const instructions = buildCodexAuditPrompt(prompt, workMode);
  ctx.update(`Executando auditoria com ${modelDecision.model}...`, 20);
  let result;
  try {
    result = await runCodexPatchCommand(tools, project, instructions, ctx, "Codex Business auditando o projeto...", modelDecision.model);
  } catch (error) {
    if (modelDecision.model !== CODEX_DEFAULT_MODEL && codexModelUnavailable(error)) {
      ctx.update("O modelo selecionado não está disponível; usando GPT-5.6 Terra...", 24);
      result = await runCodexPatchCommand(tools, project, instructions, ctx, "Codex Business auditando o projeto com Terra...", CODEX_DEFAULT_MODEL);
      modelDecision = { model: CODEX_DEFAULT_MODEL, preference: "terra", automatic: true, reason: "Luna/Sol indisponível nesta conta ou instalação; fallback para GPT-5.6 Terra antes de qualquer alteração." };
    } else {
      throw error;
    }
  }
  const report = String(result.agentText || result.output || "").trim();
  if (!report) throw new Error("O Codex concluiu a auditoria sem produzir um relatório.");
  recordAgentUsage({
    engine: "codex",
    model: modelDecision.model,
    outcome: "audit-completed",
    durationMs: Date.now() - startedAt,
    promptLength: prompt.length,
    attachmentCount: 0,
    usage: result.usage
  });
  return {
    engine: "codex",
    model: modelDecision.model,
    auditOnly: true,
    usage: result.usage,
    buildOk: null,
    agentOutput: [
      `Auditoria concluída com ${modelDecision.model}.`,
      modelDecision.reason,
      "Nenhum arquivo foi modificado.",
      "",
      report
    ].join("\n")
  };
}

async function runCodexEdit(settings, profile, project, userPrompt, attachments, ctx, requestedWorkMode = "auto", requestedCodexModel = "auto") {
  if (project.githubLogin?.toLowerCase() !== profile.github.login?.toLowerCase()) {
    throw new Error(`Este projeto pertence à conta ${project.githubLogin}. O perfil atual está conectado como ${profile.github.login}.`);
  }
  const tools = getTools(settings);
  const startedAt = Date.now();
  const prompt = String(userPrompt || "").trim();
  if (prompt.length < 4) throw new Error("Descreva a alteração desejada.");
  const workMode = inferWorkMode(prompt, requestedWorkMode);
  const classification = classifyOpenCodeSafetyPrompt(prompt, workMode);
  const media = Array.isArray(attachments) ? attachments.slice(0, MEDIA_LIMIT) : [];
  validateCodexProjectWorkspace(project);
  ensureProjectWritePermission(project.path);
  const catalog = await codexModelCatalog(tools);
  let modelDecision = codexModelDecision(prompt, workMode, requestedCodexModel, catalog);
  if (classification.auditOnly && media.length === 0) {
    return runCodexAudit(settings, profile, project, prompt, ctx, workMode, modelDecision);
  }
  const projectNotFoundExistedBefore = fs.existsSync(path.join(project.path, "PROJECT_NOT_FOUND"));
  const tracker = await beginTrackedChange(settings, profile, project, prompt, media, "codex");
  const logRoot = codexPatchLogRoot(profile, project);

  try {
    ctx.update("Verificando a conta Codex Business...", 8);
    await verifyCodexChatGptLogin(tools);
    ctx.append(`${modelDecision.reason}
`);

    // R16 intentionally starts in read-only analysis mode and lets the Bridge
    // apply the validated patch. Direct workspace editing remains only as a
    // last-resort fallback inside checkAndApplyCodexPatch. This avoids the
    // recurring read-only sandbox rejection that appeared before a successful
    // patch relay and removes a wasted Codex call.
    ctx.update("Localizando os arquivos e preparando a alteração...", 18);
    const instructions = buildCodexPatchPrompt(prompt, media, workMode);
    fs.writeFileSync(path.join(logRoot, "prompt.txt"), instructions, "utf8");

    let patchRun;
    try {
      patchRun = await runCodexPatchCommand(
        tools,
        project,
        instructions,
        ctx,
        `Codex Business (${modelDecision.model}) localizando os arquivos...`,
        modelDecision.model
      );
    } catch (error) {
      if (modelDecision.model !== CODEX_DEFAULT_MODEL && codexModelUnavailable(error)) {
        modelDecision = { model: CODEX_DEFAULT_MODEL, preference: "terra", automatic: true, reason: "O modelo selecionado não estava disponível; GPT-5.6 Terra foi usado antes de qualquer alteração." };
        ctx.update("Modelo indisponível; iniciando com GPT-5.6 Terra...", 20);
        patchRun = await runCodexPatchCommand(tools, project, instructions, ctx, "Codex Business (gpt-5.6-terra) localizando os arquivos...", CODEX_DEFAULT_MODEL);
      } else {
        throw error;
      }
    }
    fs.writeFileSync(path.join(logRoot, "agent-output.txt"), patchRun.agentText || patchRun.output || "", "utf8");

    const patchResult = await checkAndApplyCodexPatch(
      settings,
      tools,
      profile,
      project,
      patchRun.agentText || patchRun.output,
      prompt,
      media,
      ctx,
      logRoot,
      workMode,
      modelDecision.model
    );
    const usage = sumCodexUsage(patchRun.usage, patchResult.usageRepair, patchResult.usageDirect);
    const result = patchRun;

    const removedSentinel = removeUnexpectedProjectNotFoundMarker(project, projectNotFoundExistedBefore);
    if (removedSentinel) ctx.append("Um arquivo sentinela vazio foi removido antes da validação.\n");

    ctx.update("Executando Safety Guard...", 70);
    const afterTree = await captureWorkingTree(settings, profile, project);
    if (afterTree === tracker.beforeTree) {
      throw new Error("O Codex respondeu, mas a alteração não produziu nenhuma mudança persistente no projeto.");
    }
    const safety = await analyzeOpenCodeChangeSafety(settings, project, tracker, afterTree, prompt, workMode);
    if (!safety.ok) {
      let archived = null;
      try { archived = await archiveRejectedOpenCodeChange(settings, profile, project, tracker, afterTree, safety, result); } catch {}
      await rollbackTrackedChangeVerified(settings, profile, project, tracker);
      const report = archived?.patchPath ? `\n\nDiff preservado em:\n${archived.patchPath}` : "";
      throw new Error(`O Safety Guard rejeitou a alteração e restaurou o projeto.\n\n${safety.reasons.map((r, i) => `${i + 1}. ${r}`).join("\n")}${report}`);
    }

    ctx.update("Executando build automático...", 80);
    let build;
    try {
      build = await runBuild(settings, project, ctx);
    } catch (error) {
      const rejected = await rollbackAfterBuildFailure(settings, profile, project, tracker, afterTree, error, result, ctx);
      throw new Error(rejected.message);
    }

    const usageLine = codexUsageSummary(usage);
    const agentSummary = [
      patchResult.directEdited
        ? "Alteração concluída com Codex Business pelo modo de contingência R22."
        : "Alteração concluída com Codex Business pelo Patch Relay seguro R22.",
      `Modo de trabalho: ${workModeLabel(workMode)}.`,
      `Modelo utilizado: ${modelDecision.model}.`,
      modelDecision.reason,
      `Arquivos validados: ${safety.totals.files}; linhas alteradas: ${safety.totals.lines}.`,
      usageLine,
      patchResult.patchPath ? `Patch técnico: ${patchResult.patchPath}` : `Diagnóstico técnico: ${patchResult.diagnosticPath}`
    ].filter(Boolean).join("\n");
    const entry = await finishTrackedChange(settings, profile, project, tracker, { buildOk: true, agentOutput: agentSummary });
    const finalStatus = await gitStatus(settings, project);
    recordAgentUsage({
      engine: "codex",
      model: modelDecision.model,
      outcome: "completed",
      durationMs: Date.now() - startedAt,
      promptLength: prompt.length,
      attachmentCount: media.length,
      changedCount: finalStatus.changedCount,
      usage,
      patchPath: patchResult.patchPath
    });
    return {
      engine: "codex",
      model: modelDecision.model,
      modelReason: modelDecision.reason,
      historyEntry: entry,
      agentOutput: agentSummary,
      usage,
      buildOk: true,
      buildOutput: build.output,
      status: finalStatus,
      preview: await startPreview(settings, profile, project)
    };
  } catch (error) {
    await rollbackTrackedChangeVerified(settings, profile, project, tracker).catch(() => rollbackTrackedChange(settings, project, tracker));
    recordAgentUsage({
      engine: "codex",
      model: modelDecision.model,
      outcome: error?.code === "JOB_CANCELLED" ? "cancelled" : "failed",
      durationMs: Date.now() - startedAt,
      promptLength: prompt.length,
      attachmentCount: media.length,
      error: trim(error.message, 4000),
      logRoot
    });
    if (codexLoginMissing(error.message)) {
      throw new Error("O login do Codex Business expirou. Clique em ‘Configurar Codex Business’ na extensão e entre novamente no workspace Business.");
    }
    if (codexLimitReached(error.message)) {
      throw new Error("O limite de uso do Codex Business foi atingido. Nenhuma alteração foi mantida. Consulte o painel de uso do workspace conectado.");
    }
    throw error;
  }
}

function normalizeRepoUrl(value) {
  return String(value || "")
    .trim()
    .replace(/^git@github\.com:/i, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//i, "https://github.com/")
    .replace(/^https?:\/\/[^@/]+@github\.com\//i, "https://github.com/")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

async function validatePushIdentity(settings, profile, project) {
  const tools = getTools(settings);
  const env = profileEnv(profile);
  const account = await getGitHubAccount(settings, profile);
  if (account.login.toLowerCase() !== project.githubLogin.toLowerCase()) {
    throw new Error(`Envio bloqueado: o projeto pertence à conta ${project.githubLogin}, mas o perfil está conectado como ${account.login}.`);
  }
  const origin = await run(tools.git, ["-C", project.path, "remote", "get-url", project.remote || "origin"]);
  const expected = `https://github.com/${project.repo}`.toLowerCase();
  if (normalizeRepoUrl(origin.stdout) !== normalizeRepoUrl(expected)) {
    throw new Error(`Envio bloqueado: o origin atual não corresponde a ${project.repo}.`);
  }
  const permission = await run(tools.gh, ["api", `repos/${project.repo}`, "--jq", ".permissions.push"], {
    env,
    timeoutMs: 30000
  });
  if (permission.stdout.trim() !== "true") {
    throw new Error(`A conta ${account.login} não possui permissão de escrita em ${project.repo}.`);
  }
}

async function commitPush(settings, profile, project, message, ctx) {
  const tools = getTools(settings);
  const env = profileEnv(profile);
  const commitMessage = String(message || "").trim();
  if (commitMessage.length < 3 || commitMessage.length > 160) {
    throw new Error("A descrição deve ter entre 3 e 160 caracteres.");
  }

  ctx.update("Validando GitHub e repositório...", 8);
  await validatePushIdentity(settings, profile, project);

  // Recover only Git operations left unfinished by an earlier Lovable Bridge publish.
  // This prevents a previous failed rebase from poisoning every later send attempt.
  const staleOperations = [];
  const operationChecks = [
    { marker: "rebase-merge", command: ["rebase", "--abort"], label: "rebase" },
    { marker: "rebase-apply", command: ["rebase", "--abort"], label: "rebase" },
    { marker: "MERGE_HEAD", command: ["merge", "--abort"], label: "merge" },
    { marker: "CHERRY_PICK_HEAD", command: ["cherry-pick", "--abort"], label: "cherry-pick" }
  ];
  for (const operation of operationChecks) {
    const marker = await run(tools.git, ["-C", project.path, "rev-parse", "--git-path", operation.marker], {
      env,
      allowFailure: true
    });
    if (marker.code !== 0 || !marker.stdout.trim()) continue;
    const markerPath = path.isAbsolute(marker.stdout.trim())
      ? marker.stdout.trim()
      : path.join(project.path, marker.stdout.trim());
    if (!fs.existsSync(markerPath)) continue;
    await run(tools.git, ["-C", project.path, ...operation.command], { env, allowFailure: true });
    if (!staleOperations.includes(operation.label)) staleOperations.push(operation.label);
  }

  let status = await gitStatus(settings, project);
  if (!status.clean) {
    ctx.update("Executando build antes do envio...", 20);
    await runBuild(settings, project, ctx);
    ctx.update("Preparando commit local...", 38);
    await run(tools.git, ["-C", project.path, "add", "-A"], { env });
    const commit = await run(tools.git, ["-C", project.path, "commit", "-m", commitMessage], {
      env,
      allowFailure: true
    });
    if (commit.code !== 0 && !/nothing to commit|nothing added to commit/i.test(commit.output || "")) {
      throw new Error(`O Git não conseguiu criar o commit.\n${trim(stripAnsi(commit.output), 1800)}`);
    }
    status = await gitStatus(settings, project);
  }

  ctx.update("Buscando atualizações do GitHub...", 52);
  const fetch = await run(tools.git, ["-C", project.path, "fetch", project.remote, project.branch], {
    env,
    timeoutMs: 10 * 60 * 1000,
    allowFailure: true
  });
  if (fetch.code !== 0) {
    throw new Error(`Não foi possível consultar o branch remoto antes do envio.\n${trim(stripAnsi(fetch.output), 1800)}`);
  }

  const remoteRef = `${project.remote}/${project.branch}`;
  const divergence = await run(tools.git, ["-C", project.path, "rev-list", "--left-right", "--count", `HEAD...${remoteRef}`], {
    env,
    allowFailure: true
  });
  let ahead = 0;
  let behind = 0;
  if (divergence.code === 0) {
    const values = divergence.stdout.trim().split(/\s+/).map((value) => Number.parseInt(value, 10) || 0);
    ahead = values[0] || 0;
    behind = values[1] || 0;
  }

  if (status.clean && ahead < 1) {
    throw new Error("Não há alterações nem commits locais pendentes para enviar.");
  }

  const originalHeadResult = await run(tools.git, ["-C", project.path, "rev-parse", "HEAD"], { env });
  const originalHead = originalHeadResult.stdout.trim();
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const profileSlug = String(profile.id || profile.name || "profile").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 36) || "profile";
  const backupBranch = `lovable-bridge/backup-${profileSlug}-${stamp}`;
  let backupCreated = false;
  let conflictResolved = false;
  let conflictFiles = [];
  let syncStrategy = behind > 0 ? "rebase" : "already-current";

  if (behind > 0) {
    await run(tools.git, ["-C", project.path, "branch", backupBranch, originalHead], {
      env,
      allowFailure: true
    });
    backupCreated = true;

    ctx.update("Integrando atualizações do Lovable...", 64);
    const rebase = await run(tools.git, ["-C", project.path, "rebase", remoteRef], {
      env,
      timeoutMs: 10 * 60 * 1000,
      allowFailure: true
    });

    if (rebase.code !== 0) {
      const unresolved = await run(tools.git, ["-C", project.path, "diff", "--name-only", "--diff-filter=U"], {
        env,
        allowFailure: true
      });
      conflictFiles = unresolved.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      if (!conflictFiles.length) {
        const matches = String(rebase.output || "").matchAll(/CONFLICT[^:]*:\s*(?:Merge conflict in\s*)?([^\r\n]+)/gi);
        conflictFiles = [...matches].map((match) => String(match[1] || "").trim()).filter(Boolean);
      }

      await run(tools.git, ["-C", project.path, "rebase", "--abort"], { env, allowFailure: true });
      await run(tools.git, ["-C", project.path, "reset", "--hard", originalHead], { env, allowFailure: true });

      // A normal merge with -X ours preserves every non-conflicting remote change,
      // while preferring the local Lovable Bridge edit only inside conflicting hunks.
      ctx.update("Resolvendo conflito com segurança...", 72);
      const merge = await run(tools.git, ["-C", project.path, "merge", "--no-edit", "-X", "ours", remoteRef], {
        env,
        timeoutMs: 10 * 60 * 1000,
        allowFailure: true
      });
      if (merge.code !== 0) {
        const mergeUnresolved = await run(tools.git, ["-C", project.path, "diff", "--name-only", "--diff-filter=U"], {
          env,
          allowFailure: true
        });
        const extra = mergeUnresolved.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
        conflictFiles = [...new Set([...conflictFiles, ...extra])];
        await run(tools.git, ["-C", project.path, "merge", "--abort"], { env, allowFailure: true });
        await run(tools.git, ["-C", project.path, "reset", "--hard", originalHead], { env, allowFailure: true });
        throw new Error(
          `O GitHub e a cópia local alteraram as mesmas partes do projeto, e a resolução automática segura não foi suficiente. ` +
          `Nenhum arquivo foi perdido. Uma cópia de recuperação foi preservada no branch local ${backupBranch}.` +
          `${conflictFiles.length ? `\nArquivos em conflito:\n- ${conflictFiles.join("\n- ")}` : ""}` +
          `\nDetalhes:\n${trim(stripAnsi(merge.output || rebase.output), 1800)}`
        );
      }
      conflictResolved = true;
      syncStrategy = "merge-local-conflicts";
    }

    // Remote changes may affect the build even when Git resolved the text cleanly.
    ctx.update("Validando a versão integrada...", 80);
    try {
      await runBuild(settings, project, ctx);
    } catch (buildError) {
      await run(tools.git, ["-C", project.path, "merge", "--abort"], { env, allowFailure: true });
      await run(tools.git, ["-C", project.path, "rebase", "--abort"], { env, allowFailure: true });
      await run(tools.git, ["-C", project.path, "reset", "--hard", originalHead], { env, allowFailure: true });
      throw new Error(
        `As atualizações remotas foram integradas, mas o build falhou. O projeto local anterior foi restaurado e o backup ${backupBranch} foi mantido.\n` +
        trim(stripAnsi(buildError.message || String(buildError)), 1800)
      );
    }
  }

  ctx.update("Enviando ao GitHub...", 90);
  const push = await run(tools.git, ["-C", project.path, "push", project.remote, project.branch], {
    env,
    timeoutMs: 10 * 60 * 1000,
    allowFailure: true
  });
  if (push.code !== 0) {
    throw new Error(
      `O commit foi preservado localmente, mas o GitHub recusou o envio. Tente novamente após corrigir a conexão ou a autenticação.` +
      `${backupCreated ? `\nBackup local: ${backupBranch}` : ""}\n${trim(stripAnsi(push.output), 1800)}`
    );
  }

  await clearProjectHistory(settings, profile, project);
  return {
    message: conflictResolved
      ? "Alterações enviadas ao GitHub. O conflito foi resolvido preservando as alterações locais nos trechos conflitantes e mantendo as demais atualizações remotas."
      : "Alterações enviadas ao GitHub. O Lovable poderá sincronizar o novo commit.",
    branch: project.branch,
    repository: project.repo,
    conflictResolved,
    conflictFiles,
    backupBranch: backupCreated ? backupBranch : null,
    syncStrategy,
    recoveredOperation: staleOperations,
    status: await gitStatus(settings, project)
  };
}

async function pullProject(settings, profile, project) {
  await validatePushIdentity(settings, profile, project);
  const tools = getTools(settings);
  const status = await gitStatus(settings, project);
  if (!status.clean) throw new Error("Há alterações locais. Envie ou descarte antes de atualizar.");
  await run(tools.git, ["-C", project.path, "pull", "--rebase", project.remote, project.branch], {
    env: profileEnv(profile),
    timeoutMs: 10 * 60 * 1000
  });
  return { status: await gitStatus(settings, project) };
}

async function discardChanges(settings, project) {
  const tools = getTools(settings);
  await run(tools.git, ["-C", project.path, "restore", "--staged", "."]);
  await run(tools.git, ["-C", project.path, "restore", "."]);
  const untracked = await run(tools.git, ["-C", project.path, "clean", "-fd", "--exclude=node_modules", "--exclude=dist"], { allowFailure: true });
  return { output: untracked.output, status: await gitStatus(settings, project) };
}

function publicProject(profile, project, status = null) {
  return { ...project, profileId: profile.id, status, preview: previewStatus(profile, project) };
}

function sanitizeMediaName(value) {
  const parsed = path.parse(String(value || "media"));
  const base = parsed.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "") || "media";
  return `${base}${parsed.ext.toLowerCase()}`;
}

function readRawBody(req, limit = MEDIA_LIMIT * MAX_MEDIA_BYTES + 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error("Upload grande demais."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const marker = Buffer.from(`--${boundary}`);
  const separator = Buffer.from("\r\n\r\n");
  let cursor = 0;
  while (true) {
    const markerIndex = buffer.indexOf(marker, cursor);
    if (markerIndex < 0) break;
    let start = markerIndex + marker.length;
    if (buffer.slice(start, start + 2).toString() === "--") break;
    if (buffer.slice(start, start + 2).toString() === "\r\n") start += 2;
    const headerEnd = buffer.indexOf(separator, start);
    if (headerEnd < 0) break;
    const headerText = buffer.slice(start, headerEnd).toString("utf8");
    const dataStart = headerEnd + separator.length;
    const nextMarker = buffer.indexOf(marker, dataStart);
    if (nextMarker < 0) break;
    let dataEnd = nextMarker;
    if (buffer.slice(dataEnd - 2, dataEnd).toString() === "\r\n") dataEnd -= 2;
    const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i);
    const filenameMatch = disposition?.[1]?.match(/filename="([^"]*)"/i);
    const nameMatch = disposition?.[1]?.match(/name="([^"]*)"/i);
    const typeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);
    parts.push({
      fieldName: nameMatch ? nameMatch[1] : "",
      filename: filenameMatch ? filenameMatch[1] : "",
      contentType: typeMatch ? typeMatch[1].trim() : "application/octet-stream",
      data: buffer.slice(dataStart, dataEnd)
    });
    cursor = nextMarker;
  }
  return parts;
}

async function saveMediaAttachments(project, req) {
  const contentType = String(req.headers["content-type"] || "");
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Upload multipart inválido.");
  const raw = await readRawBody(req);
  const parts = parseMultipart(raw, boundaryMatch[1] || boundaryMatch[2]);
  const files = parts.filter((part) => part.fieldName === "files" && part.filename);
  if (!files.length) return [];
  if (files.length > MEDIA_LIMIT) throw new Error("Envie no máximo 10 imagens ou vídeos por comando.");
  const targetDir = path.join(project.path, "public", "lovable-bridge-media");
  fs.mkdirSync(targetDir, { recursive: true });
  const stamp = now().replace(/[-:TZ.]/g, "").slice(0, 14);
  const saved = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (file.data.length > MAX_MEDIA_BYTES) throw new Error(`${file.filename} excede o limite de 150 MB por arquivo.`);
    const extension = path.extname(file.filename).toLowerCase();
    if (!ALLOWED_MEDIA_EXTENSIONS.has(extension)) throw new Error(`Formato não permitido: ${file.filename}`);
    const safeName = sanitizeMediaName(file.filename);
    const finalName = `${stamp}-${String(index + 1).padStart(2, "0")}-${safeName}`;
    fs.writeFileSync(path.join(targetDir, finalName), file.data);
    saved.push({
      originalName: file.filename,
      filename: finalName,
      mimeType: file.contentType,
      size: file.data.length,
      projectPath: `public/lovable-bridge-media/${finalName}`,
      publicPath: `/lovable-bridge-media/${finalName}`
    });
  }
  return saved;
}


function walkFiles(rootDir, predicate, output = []) {
  if (!fs.existsSync(rootDir)) return output;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, output);
    } else if (!predicate || predicate(fullPath)) {
      output.push(fullPath);
    }
  }
  return output;
}

function normalizeAssetUrl(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("/__l5e/assets-v1/")) return "";
  if (text.includes("..") || text.includes("\\")) return "";
  return text;
}

function assetCachePath(project, assetUrl) {
  const normalized = normalizeAssetUrl(assetUrl);
  if (!normalized) throw new Error("Caminho de mídia do Lovable inválido.");
  const publicRoot = path.resolve(project.path, "public");
  const destination = path.resolve(publicRoot, normalized.replace(/^\/+/, ""));
  if (destination !== publicRoot && !destination.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error("O destino da mídia saiu da pasta pública do projeto.");
  }
  return destination;
}

function ensureLovableAssetCacheIgnored(project) {
  const infoDir = path.join(project.path, ".git", "info");
  if (!fs.existsSync(infoDir)) return;
  const excludePath = path.join(infoDir, "exclude");
  const rule = "/public/__l5e/";
  const current = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(rule)) return;
  fs.mkdirSync(infoDir, { recursive: true });
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(excludePath, `${prefix}${rule}\n`, "utf8");
}

function listLovableAssets(project) {
  const assetsRoot = path.join(project.path, "src", "assets");
  const metadataFiles = walkFiles(
    assetsRoot,
    (filePath) => filePath.toLowerCase().endsWith(".asset.json")
  );
  const assets = [];
  for (const metadataPath of metadataFiles) {
    try {
      const metadata = readJson(metadataPath);
      const assetUrl = normalizeAssetUrl(metadata.url);
      if (!assetUrl) continue;
      const cachePath = assetCachePath(project, assetUrl);
      const cached = fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0;
      assets.push({
        assetId: String(metadata.asset_id || ""),
        projectId: String(metadata.project_id || ""),
        filename: String(metadata.original_filename || path.basename(assetUrl)),
        url: assetUrl,
        contentType: String(metadata.content_type || "application/octet-stream"),
        expectedSize: Number(metadata.size || 0),
        cached,
        cachedSize: cached ? fs.statSync(cachePath).size : 0
      });
    } catch (error) {
      log(`Falha ao ler metadata de mídia ${metadataPath}: ${error.message}`);
    }
  }
  assets.sort((a, b) => a.url.localeCompare(b.url));
  return {
    total: assets.length,
    cached: assets.filter((item) => item.cached).length,
    missing: assets.filter((item) => !item.cached).length,
    assets
  };
}

async function cacheLovableAsset(project, req) {
  const contentType = String(req.headers["content-type"] || "");
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Upload multipart inválido.");
  const raw = await readRawBody(req, 200 * 1024 * 1024);
  const parts = parseMultipart(raw, boundaryMatch[1] || boundaryMatch[2]);
  const assetUrlPart = parts.find((part) => part.fieldName === "assetUrl");
  const file = parts.find((part) => part.fieldName === "file" && part.filename);
  if (!assetUrlPart || !file) throw new Error("A mídia ou o caminho do asset não foi enviado.");

  const assetUrl = normalizeAssetUrl(assetUrlPart.data.toString("utf8"));
  if (!assetUrl) throw new Error("Caminho de mídia inválido.");
  const manifest = listLovableAssets(project);
  const expected = manifest.assets.find((item) => item.url === assetUrl);
  if (!expected) throw new Error("Esta mídia não pertence ao projeto selecionado.");
  if (!file.data.length) throw new Error(`O arquivo ${expected.filename} foi baixado vazio.`);
  if (file.data.length > 200 * 1024 * 1024) throw new Error(`${expected.filename} excede 200 MB.`);

  const destination = assetCachePath(project, assetUrl);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, file.data);
  ensureLovableAssetCacheIgnored(project);

  return {
    url: assetUrl,
    filename: expected.filename,
    size: file.data.length,
    cached: true
  };
}



const HOST_VERSION = "1.6.0 R22";
const EXTENSION_ID = "jfnajhhcpdepijomgiiiflmphgcohmgm";
const uploadSessions = new Map();

function systemLocale() {
  try { return Intl.DateTimeFormat().resolvedOptions().locale || "en-US"; }
  catch { return "en-US"; }
}

function diagnosticsData() {
  const settings = loadSettings();
  const tools = settings.tools || {};
  const list = [
    ["Git", tools.git, ["--version"]],
    ["GitHub CLI", tools.githubCli, ["--version"]],
    ["Node.js", tools.node, ["--version"]],
    ["Bun", tools.bun, ["--version"]],
    ["Ripgrep", resolveRipgrep(settings), ["--version"]],
    ["Codex", tools.codexCli || tools.codex, ["--version"]],
    ["Antigravity", tools.antigravityCli || tools.antigravity, ["--version"]],
    ["OpenCode", tools.openCodeCli || tools.opencodeCli || tools.opencode, ["--version"]]
  ];
  return Promise.all(list.map(async ([name, executable, args]) => {
    const installed = Boolean(executable && fs.existsSync(executable));
    let version = "";
    let authenticated;
    let detail = "";
    if (installed) {
      const result = await run(executable, args, { allowFailure: true, timeoutMs: 30000 });
      version = String(result.output || "").trim().split(/\r?\n/)[0] || "";
      if (name === "GitHub CLI") {
        const status = await run(executable, ["auth", "status", "--hostname", "github.com"], { allowFailure: true, timeoutMs: 30000 });
        authenticated = status.code === 0;
        detail = String(status.output || "").trim().split(/\r?\n/)[0] || "";
      }
      if (name === "Codex") {
        const status = await run(executable, ["login", "status"], { allowFailure: true, timeoutMs: 30000, env: codexExecutionEnvironment(), unsetEnv: CODEX_UNSET_ENV });
        authenticated = status.code === 0 && /chatgpt/i.test(status.output || "");
        detail = String(status.output || "").trim().split(/\r?\n/)[0] || "";
      }
      if (name === "OpenCode") {
        const resolvedTools = getTools(settings);
        const status = await run(executable, ["--pure", "auth", "list"], {
          allowFailure: true,
          timeoutMs: 45000,
          env: openCodeEnvironment(settings, resolvedTools)
        });
        authenticated = status.code === 0 && /openrouter/i.test(status.output || "");
        detail = authenticated
          ? `OpenRouter conectado • ${openCodeModel(settings)}`
          : "OpenRouter ainda não configurado";
      }
    }
    return { name, installed, authenticated, version, detail, path: executable || "" };
  }));
}

function parseApiPath(pathname) {
  const clean = String(pathname || "").split("?")[0];
  return { pathname: clean, parts: clean.split("/").filter(Boolean) };
}

async function dispatchApi(request) {
  const method = String(request.method || "GET").toUpperCase();
  const body = request.body || {};
  const { pathname, parts } = parseApiPath(request.path);
  const settings = loadSettings();

  if (method === "GET" && pathname === "/api/health") {
    const tools = getTools(settings);
    return {
      ok: true,
      version: HOST_VERSION,
      systemLocale: systemLocale(),
      profileCount: settings.profiles.length,
      activeProfileId: settings.activeProfileId,
      codexInstalled: fs.existsSync(tools.codex),
      codexBusinessConfigured: fs.existsSync(codexBusinessAuthPath()),
      codexBusinessVerified: fs.existsSync(codexBusinessVerificationPath()),
      antigravityInstalled: Boolean(tools.agy && fs.existsSync(tools.agy)),
      openCodeInstalled: Boolean(tools.opencode && fs.existsSync(tools.opencode)),
      openCodeModel: openCodeModel(settings),
      openCodeModelName: openCodeModelDisplayName(openCodeModel(settings)),
      openCodeIntegration: "server-api-model-selector-r6"
    };
  }
  if (method === "GET" && pathname === "/api/codex/models") {
    const tools = getTools(settings);
    assertFile(tools.codex, "Codex CLI");
    return { ok: true, ...(await codexModelCatalog(tools)) };
  }
  if (method === "POST" && pathname === "/api/codex/setup") {
    return { ok: true, ...startCodexBusinessBrowserLogin({ reset: Boolean(body.reset) }) };
  }
  if (method === "GET" && pathname === "/api/codex/status") {
    const tools = getTools(settings);
    assertFile(tools.codex, "Codex CLI");
    return { ok: true, ...(await codexBusinessStatus(tools)) };
  }
  if (method === "POST" && pathname === "/api/opencode/setup") {
    return { ok: true, ...launchOpenCodeSetup() };
  }
  if (method === "GET" && pathname === "/api/opencode/models") {
    return { ok: true, ...(await openCodeModelsResponse(settings, false)) };
  }
  if (method === "POST" && pathname === "/api/opencode/models/refresh") {
    return { ok: true, ...(await openCodeModelsResponse(settings, true)) };
  }
  if (method === "POST" && pathname === "/api/opencode/model") {
    return { ok: true, ...(await selectOpenCodeModel(settings, body.model)) };
  }
  if (method === "GET" && pathname === "/api/profiles") return { ok: true, profiles: settings.profiles.map(publicProfile), activeProfileId: settings.activeProfileId };
  if (method === "POST" && pathname === "/api/profiles") {
    const profile = createProfile(settings, body);
    return { ok: true, profile: publicProfile(profile) };
  }
  if (parts[0] === "api" && parts[1] === "jobs" && parts[2]) {
    const job = jobs.get(parts[2]);
    if (!job) throw new Error("Tarefa não encontrada.");
    if (method === "POST" && parts[3] === "cancel") {
      if (!job.cancelable) throw new Error("Esta tarefa não pode ser cancelada.");
      const accepted = requestJobCancellation(job, "Execução cancelada pelo usuário. O projeto será restaurado.", "user");
      return { ok: true, accepted, job };
    }
    if (method === "GET" && parts.length === 3) return { ok: true, job };
  }
  if (parts[0] === "api" && parts[1] === "profiles" && parts[2]) {
    const profileId = decodeURIComponent(parts[2]);
    const profile = getProfile(settings, profileId);
    if (method === "GET" && parts.length === 3) return { ok: true, profile: publicProfile(profile) };
    if (method === "POST" && parts[3] === "activate") { settings.activeProfileId = profile.id; saveSettings(settings); return { ok: true, profile: publicProfile(profile) }; }
    if (method === "POST" && parts[3] === "github" && parts[4] === "connect") {
      const job = createJob("github-connect", profile.id, null, (ctx) => connectGitHub(settings, profile, ctx));
      return { ok: true, jobId: job.id };
    }
    if (method === "POST" && parts[3] === "github" && parts[4] === "disconnect") return { ok: true, profile: disconnectGitHub(settings, profile) };
    if (method === "GET" && parts[3] === "repos") return { ok: true, repos: await listRepositories(settings, profile) };
    if (method === "GET" && parts[3] === "projects" && parts.length === 4) {
      const projects = [];
      for (const project of profile.projects) projects.push(publicProject(profile, project, await gitStatus(settings, project)));
      return { ok: true, projects };
    }
    if (method === "POST" && parts[3] === "projects" && parts.length === 4) {
      const job = createJob("prepare-project", profile.id, null, (ctx) => prepareProject(settings, profile, body, ctx));
      return { ok: true, jobId: job.id };
    }
    if (method === "DELETE" && parts.length === 3) {
      if (fs.existsSync(profile.githubConfigDir)) fs.rmSync(profile.githubConfigDir, { recursive: true, force: true });
      settings.profiles = settings.profiles.filter((item) => item.id !== profile.id);
      if (settings.activeProfileId === profile.id) settings.activeProfileId = settings.profiles[0]?.id || null;
      saveSettings(settings);
      return { ok: true, message: "Perfil removido. As pastas locais e os repositórios remotos foram preservados." };
    }
    if (parts[3] === "projects" && parts[4]) {
      const projectId = decodeURIComponent(parts[4]);
      const project = getProject(profile, projectId);
      if (method === "GET" && parts.length === 5) return { ok: true, project: publicProject(profile, project, await gitStatus(settings, project)) };
      if (method === "GET" && parts[5] === "lovable-assets") return { ok: true, ...listLovableAssets(project) };
      if (method === "POST" && parts[5] === "agent") {
        const requestedEngine = String(body.engine || "codex").toLowerCase();
        const requestedWorkMode = normalizeWorkMode(body.workMode || "auto");
        const engine = ["codex", "antigravity", "opencode"].includes(requestedEngine)
          ? requestedEngine
          : "codex";
        if (engine === "opencode" && body.openCodeModel) {
          const requestedModel = normalizeOpenCodeModelId(body.openCodeModel);
          if (!isOpenCodeFreeModel(requestedModel)) throw new Error("O OpenCode aceita somente modelos gratuitos neste fluxo.");
          settings.openCode.model = requestedModel;
          settings.openCode.modelCatalogVersion = 2;
          saveSettings(settings);
        }
        const job = createJob(`agent-edit-${engine}`, profile.id, project.id, async (ctx) => {
          const restoredAttachments = materializeHistoryAttachments(profile, project, body.historyAttachments);
          const attachments = [...(Array.isArray(body.attachments) ? body.attachments : []), ...restoredAttachments].slice(0, MEDIA_LIMIT);
          if (engine === "antigravity") {
            return runAgentEdit(settings, profile, project, body.prompt, attachments, ctx, requestedWorkMode);
          }
          if (engine === "opencode") {
            return runOpenCodeEdit(settings, profile, project, body.prompt, attachments, ctx, requestedWorkMode);
          }
          return runCodexEdit(settings, profile, project, body.prompt, attachments, ctx, requestedWorkMode, body.codexModelPreference || "auto");
        }, (engine === "opencode" || engine === "codex") ? {
          cancelable: true
        } : {});
        return { ok: true, jobId: job.id, engine, workMode: requestedWorkMode };
      }
      if (method === "GET" && parts[5] === "changes" && parts.length === 6) return { ok: true, history: await projectHistorySummary(settings, profile, project) };
      if (parts[5] === "changes" && parts[6]) {
        const entryId = parts[6];
        if (method === "DELETE" && parts.length === 7) {
          const job = createJob("remove-change", profile.id, project.id, (ctx) => removeTrackedChange(settings, profile, project, entryId, ctx, false));
          return { ok: true, jobId: job.id };
        }
        if (method === "POST" && parts[7] === "edit") {
          const job = createJob("edit-change", profile.id, project.id, (ctx) => removeTrackedChange(settings, profile, project, entryId, ctx, true));
          return { ok: true, jobId: job.id };
        }
      }
      if (method === "POST" && parts[5] === "commit-push") {
        const job = createJob("commit-push", profile.id, project.id, (ctx) => commitPush(settings, profile, project, body.message, ctx));
        return { ok: true, jobId: job.id };
      }
      if (method === "POST" && parts[5] === "preview" && parts[6] === "start") return { ok: true, preview: await startPreview(settings, profile, project) };
      if (method === "POST" && parts[5] === "preview" && parts[6] === "stop") return { ok: true, preview: await stopPreview(profile, project) };
      if (method === "POST" && parts[5] === "build") {
        try {
          return { ok: true, build: await runBuild(settings, project) };
        } catch (error) {
          const summary = summarizeBuildFailure(error, project);
          log(`Build manual falhou em ${profile.id}/${project.id}: ${trim(summary.raw, 12000)}`);
          throw new Error(buildFailureUserMessage(summary, { heading: "Build falhou." }));
        }
      }
      if (method === "POST" && parts[5] === "pull") return { ok: true, ...(await pullProject(settings, profile, project)) };
      if (method === "POST" && parts[5] === "discard") { const result = await discardChanges(settings, project); await clearProjectHistory(settings, profile, project); return { ok: true, ...result }; }
      if (method === "POST" && parts[5] === "link-lovable") { project.lovableUrl = String(body.url || "").trim(); saveSettings(settings); return { ok: true, project }; }
      if (method === "DELETE" && parts.length === 5) {
        await clearProjectHistory(settings, profile, project);
        profile.projects = profile.projects.filter((item) => item.id !== project.id);
        saveSettings(settings);
        return { ok: true, message: "Projeto removido do perfil. Os arquivos locais foram preservados." };
      }
    }
  }
  throw new Error("Rota não encontrada.");
}

function parseUploadTarget(pathname) {
  const { parts } = parseApiPath(pathname);
  if (parts[0] !== "api" || parts[1] !== "profiles" || !parts[2] || parts[3] !== "projects" || !parts[4]) throw new Error("Destino de upload inválido.");
  const settings = loadSettings();
  const profile = getProfile(settings, decodeURIComponent(parts[2]));
  const project = getProject(profile, decodeURIComponent(parts[4]));
  if (parts[5] === "media") return { kind: "media", settings, profile, project };
  if (parts[5] === "lovable-assets" && parts[6] === "cache") return { kind: "lovable-asset", settings, profile, project };
  throw new Error("Destino de upload não suportado.");
}

function uploadBegin(args) {
  const target = parseUploadTarget(args.path);
  const size = Number(args.size || 0);
  if (!Number.isFinite(size) || size < 0 || size > MAX_MEDIA_BYTES) throw new Error("Arquivo grande demais ou tamanho inválido.");
  const extension = path.extname(String(args.filename || "")).toLowerCase();
  if (target.kind === "media" && !ALLOWED_MEDIA_EXTENSIONS.has(extension)) throw new Error(`Formato não permitido: ${args.filename}`);
  const id = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  const dir = path.join(USER_ROOT, "Temp", "Uploads");
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `${id}.part`);
  fs.writeFileSync(tempPath, Buffer.alloc(0));
  uploadSessions.set(id, { ...target, id, tempPath, filename: String(args.filename || "media"), mimeType: String(args.mimeType || "application/octet-stream"), expectedSize: size, written: 0, nextIndex: 0, assetUrl: String(args.assetUrl || ""), createdAt: Date.now() });
  return { uploadId: id };
}

function uploadChunk(args) {
  const session = uploadSessions.get(String(args.uploadId || ""));
  if (!session) throw new Error("Upload não encontrado ou expirado.");
  const index = Number(args.index);
  if (index !== session.nextIndex) throw new Error("Bloco de upload fora de ordem.");
  const buffer = Buffer.from(String(args.data || ""), "base64");
  if (session.written + buffer.length > session.expectedSize + 8) throw new Error("O upload excedeu o tamanho informado.");
  fs.appendFileSync(session.tempPath, buffer);
  session.written += buffer.length;
  session.nextIndex += 1;
  return { received: session.written };
}

function uploadFinish(args) {
  const id = String(args.uploadId || "");
  const session = uploadSessions.get(id);
  if (!session) throw new Error("Upload não encontrado ou expirado.");
  uploadSessions.delete(id);
  try {
    if (session.written !== session.expectedSize) throw new Error(`Upload incompleto: ${session.written} de ${session.expectedSize} bytes.`);
    if (session.kind === "media") {
      const targetDir = path.join(session.project.path, "public", "lovable-bridge-media");
      fs.mkdirSync(targetDir, { recursive: true });
      const stamp = now().replace(/[-:TZ.]/g, "").slice(0, 14);
      const finalName = `${stamp}-${crypto.randomBytes(3).toString("hex")}-${sanitizeMediaName(session.filename)}`;
      const destination = path.join(targetDir, finalName);
      fs.renameSync(session.tempPath, destination);
      return { attachment: { originalName: session.filename, filename: finalName, mimeType: session.mimeType, size: session.written, projectPath: `public/lovable-bridge-media/${finalName}`, publicPath: `/lovable-bridge-media/${finalName}` } };
    }
    const assetUrl = normalizeAssetUrl(session.assetUrl);
    if (!assetUrl) throw new Error("Caminho de mídia inválido.");
    const manifest = listLovableAssets(session.project);
    const expected = manifest.assets.find((item) => item.url === assetUrl);
    if (!expected) throw new Error("Esta mídia não pertence ao projeto selecionado.");
    const destination = assetCachePath(session.project, assetUrl);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (fs.existsSync(destination)) fs.unlinkSync(destination);
    fs.renameSync(session.tempPath, destination);
    ensureLovableAssetCacheIgnored(session.project);
    return { asset: { url: assetUrl, filename: expected.filename, size: session.written, cached: true }, summary: listLovableAssets(session.project) };
  } finally {
    try { if (fs.existsSync(session.tempPath)) fs.unlinkSync(session.tempPath); } catch {}
  }
}

function uploadAbort(args) {
  const id = String(args.uploadId || "");
  const session = uploadSessions.get(id);
  uploadSessions.delete(id);
  if (session) { try { if (fs.existsSync(session.tempPath)) fs.unlinkSync(session.tempPath); } catch {} }
  return { aborted: true };
}

async function handleNativeMessage(message) {
  const command = String(message.command || "");
  const args = message.args || {};
  if (command === "ping") return { message: "pong", version: HOST_VERSION, extensionId: EXTENSION_ID, os: process.platform, arch: process.arch, systemLocale: systemLocale() };
  if (command === "diagnostics") return { tools: await diagnosticsData(), version: HOST_VERSION, systemLocale: systemLocale() };
  if (command === "api") return dispatchApi(args);
  if (command === "upload_begin") return uploadBegin(args);
  if (command === "upload_chunk") return uploadChunk(args);
  if (command === "upload_finish") return uploadFinish(args);
  if (command === "upload_abort") return uploadAbort(args);
  throw new Error(`Comando nativo desconhecido: ${command}`);
}

function writeNativeMessage(payload) {
  let body = Buffer.from(JSON.stringify(payload), "utf8");
  if (body.length > 950000) body = Buffer.from(JSON.stringify({ id: payload.id, ok: false, error: "A resposta excedeu o limite do Chrome. Consulte os logs locais." }), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(header);
  process.stdout.write(body);
}

let inputBuffer = Buffer.alloc(0);
let processing = Promise.resolve();
process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  while (inputBuffer.length >= 4) {
    const size = inputBuffer.readUInt32LE(0);
    if (size > 64 * 1024 * 1024) { process.exit(2); return; }
    if (inputBuffer.length < 4 + size) break;
    const raw = inputBuffer.subarray(4, 4 + size);
    inputBuffer = inputBuffer.subarray(4 + size);
    processing = processing.then(async () => {
      let request;
      try { request = JSON.parse(raw.toString("utf8")); }
      catch (error) { writeNativeMessage({ id: "", ok: false, error: `JSON inválido: ${error.message}` }); return; }
      try {
        const data = await handleNativeMessage(request);
        writeNativeMessage({ id: request.id || "", ok: true, data });
      } catch (error) {
        log(`Native ${request.command}: ${error.stack || error.message}`);
        writeNativeMessage({ id: request.id || "", ok: false, error: trim(error.message, 16000) });
      }
    });
  }
});
process.stdin.on("end", () => {
  for (const record of previewProcesses.values()) { try { if (record.process.exitCode === null) record.process.kill(); } catch {} }
  process.exit(0);
});
process.on("uncaughtException", (error) => { try { log(`Uncaught exception: ${error.stack || error.message}`); } catch {} });
process.on("unhandledRejection", (error) => { try { log(`Unhandled rejection: ${error?.stack || error}`); } catch {} });
