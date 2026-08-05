"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const childProcess = require("child_process");

const root = path.resolve(__dirname, "..");
const required = [
  "VERSION.json",
  "README-BASE-OFICIAL.txt",
  "source/common/extension/manifest.json",
  "source/common/extension/service-worker.js",
  "source/common/extension/sidepanel.html",
  "source/common/extension/sidepanel.css",
  "source/common/extension/content-script.js",
  "source/common/extension/content-script.css",
  "source/common/extension/preview-selector.js",
  "source/common/extension/preview-selector.css",
  "source/common/extension/icons/icon16.png",
  "source/common/extension/icons/icon32.png",
  "source/common/extension/icons/icon48.png",
  "source/common/extension/icons/icon128.png",
  "source/windows/extension/sidepanel.js",
  "source/windows/host/host.js",
  "source/macos/extension/sidepanel.js",
  "source/macos/host/host.js",
  "scripts/build-targets.js"
];

let failed = false;
for (const rel of required) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    console.error(`[ERRO] Arquivo ausente: ${rel}`);
    failed = true;
  }
}

try {
  const version = JSON.parse(fs.readFileSync(path.join(root, "VERSION.json"), "utf8"));
  if (version.release !== "R24") throw new Error("release inesperada");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "source/common/extension/manifest.json"), "utf8"));
  if (manifest.name !== "Lovable Bridge") throw new Error("nome inesperado");
  if (manifest.key == null) throw new Error("chave oficial ausente");
  if (manifest.version !== "1.6.24.0") throw new Error("versao inesperada");
  console.log(`[OK] Manifest: ${manifest.name} ${manifest.version}; release ${version.release}`);
} catch (error) {
  console.error(`[ERRO] JSON invalido: ${error.message}`);
  failed = true;
}

for (const rel of required.filter((item) => item.endsWith(".js"))) {
  try {
    new vm.Script(fs.readFileSync(path.join(root, rel), "utf8"), { filename: rel });
  } catch (error) {
    console.error(`[ERRO] Sintaxe JavaScript em ${rel}: ${error.message}`);
    failed = true;
  }
}

try {
  childProcess.execFileSync(process.execPath, [path.join(root, "scripts/build-targets.js")], { stdio: "inherit" });
  for (const target of ["windows", "macos"]) {
    for (const rel of ["extension/manifest.json", "extension/sidepanel.js", "extension/preview-selector.js", "host/host.js"]) {
      const full = path.join(root, "dist", target, rel);
      if (!fs.existsSync(full)) throw new Error(`build ausente: dist/${target}/${rel}`);
    }
  }
} catch (error) {
  console.error(`[ERRO] Build dos alvos falhou: ${error.message}`);
  failed = true;
}

const winHost = fs.readFileSync(path.join(root, "source/windows/host/host.js"), "utf8");
const macHost = fs.readFileSync(path.join(root, "source/macos/host/host.js"), "utf8");
if (!winHost.includes('HOST_PLATFORM_BUILD = "R23-Windows"')) {
  console.error("[ERRO] host Windows sem identificacao R23-Windows");
  failed = true;
}
if (!macHost.includes('HOST_PLATFORM_BUILD = "R22-macOS"')) {
  console.error("[ERRO] host macOS sem identificacao R22-macOS");
  failed = true;
}

if (failed) process.exit(1);
console.log("[OK] Estrutura da base R24 extension / R23 Windows Companion / R22 macOS validada.");
