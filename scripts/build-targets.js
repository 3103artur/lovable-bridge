"use strict";
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const commonExtension = path.join(root, "source", "common", "extension");
const distRoot = path.join(root, "dist");

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function buildTarget(target) {
  const targetRoot = path.join(distRoot, target);
  fs.rmSync(targetRoot, { recursive: true, force: true });
  const extensionOut = path.join(targetRoot, "extension");
  const hostOut = path.join(targetRoot, "host");
  copyDirectory(commonExtension, extensionOut);
  copyDirectory(path.join(root, "source", target, "extension"), extensionOut);
  copyDirectory(path.join(root, "source", target, "host"), hostOut);
  console.log(`[OK] Target montado: dist/${target}`);
}

fs.rmSync(distRoot, { recursive: true, force: true });
buildTarget("windows");
buildTarget("macos");
