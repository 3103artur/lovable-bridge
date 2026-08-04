"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(process.env.LOCALAPPDATA || "", "LovableBridgeNative");
const settingsPath = path.join(root, "Config", "settings.json");
const rgPath = path.join(root, "Tools", "Ripgrep", "rg.exe");

if (!process.env.LOCALAPPDATA || !fs.existsSync(settingsPath) || !fs.existsSync(rgPath)) {
  console.error("Nao foi possivel localizar settings.json ou rg.exe.");
  process.exit(1);
}

const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8").replace(/^\uFEFF/, ""));
if (!settings.tools || typeof settings.tools !== "object") settings.tools = {};
settings.tools.ripgrep = rgPath;
settings.tools.rg = rgPath;
const temp = `${settingsPath}.r10.tmp`;
fs.writeFileSync(temp, JSON.stringify(settings, null, 2), "utf8");
fs.renameSync(temp, settingsPath);
console.log(`[OK] Ripgrep registrado em: ${rgPath}`);
