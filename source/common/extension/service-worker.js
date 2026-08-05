"use strict";

const NATIVE_HOST = "com.firmino.lovable_bridge";
let nativePort = null;
let nativePending = new Map();
let nativeSequence = 0;

function disconnectNative(errorMessage = "Native host disconnected") {
  for (const pending of nativePending.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(errorMessage));
  }
  nativePending.clear();
  nativePort = null;
}

function ensureNativePort() {
  if (nativePort) return nativePort;
  const port = chrome.runtime.connectNative(NATIVE_HOST);
  nativePort = port;
  port.onMessage.addListener((message) => {
    const id = String(message?.id || "");
    const pending = nativePending.get(id);
    if (!pending) return;
    nativePending.delete(id);
    clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message.data || {});
    else pending.reject(new Error(message.error || "Native host error"));
  });
  port.onDisconnect.addListener(() => {
    const message = chrome.runtime.lastError?.message || "Native host disconnected";
    disconnectNative(message);
  });
  return port;
}

function requestNative(command, args = {}, timeoutMs = 20 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    let port;
    try { port = ensureNativePort(); }
    catch (error) { reject(error); return; }
    const id = `${Date.now()}-${++nativeSequence}`;
    const timer = setTimeout(() => {
      nativePending.delete(id);
      reject(new Error(`Native request timed out: ${command}`));
    }, timeoutMs);
    nativePending.set(id, { resolve, reject, timer });
    try { port.postMessage({ id, command, args }); }
    catch (error) {
      nativePending.delete(id);
      clearTimeout(timer);
      reject(error);
    }
  });
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function setLauncherVisible(tabId, visible) {
  await chrome.storage.local.set({ lovableBridgeLauncherVisible: visible });
  if (!tabId) return;
  try { await chrome.tabs.sendMessage(tabId, { type: "launcher-visibility", visible }); } catch {}
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }

async function inspectAssetFrames(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const urls = [];
        for (const entry of performance.getEntriesByType("resource")) {
          if (String(entry.name).includes("/__l5e/assets-v1/")) urls.push(String(entry.name));
        }
        for (const image of document.images || []) {
          const value = image.currentSrc || image.src;
          if (String(value).includes("/__l5e/assets-v1/")) urls.push(String(value));
        }
        return { href: location.href, origin: location.origin, assetUrls: [...new Set(urls)] };
      }
    });
    return results.map((item) => item.result).filter(Boolean);
  } catch { return []; }
}

async function fetchFirstWorking(candidates) {
  let lastError = "";
  for (const candidate of unique(candidates)) {
    try {
      const response = await fetch(candidate, { credentials: "include", cache: "no-store", redirect: "follow" });
      if (!response.ok) { lastError = `${response.status} em ${candidate}`; continue; }
      const blob = await response.blob();
      if (!blob.size) { lastError = `arquivo vazio em ${candidate}`; continue; }
      return { blob, sourceUrl: candidate };
    } catch (error) { lastError = `${error.message} em ${candidate}`; }
  }
  throw new Error(lastError || "nenhuma origem respondeu");
}

function bytesToBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + step, bytes.length)));
  }
  return btoa(binary);
}

async function uploadBlob(path, blob, filename, extra = {}) {
  const begin = await requestNative("upload_begin", {
    path, filename, mimeType: blob.type || "application/octet-stream", size: blob.size, ...extra
  });
  const chunkSize = 512 * 1024;
  try {
    let index = 0;
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      const buffer = await blob.slice(offset, Math.min(offset + chunkSize, blob.size)).arrayBuffer();
      await requestNative("upload_chunk", {
        uploadId: begin.uploadId,
        index: index++,
        data: bytesToBase64(new Uint8Array(buffer))
      });
    }
    return await requestNative("upload_finish", { uploadId: begin.uploadId });
  } catch (error) {
    requestNative("upload_abort", { uploadId: begin.uploadId }).catch(() => {});
    throw error;
  }
}

async function uploadCachedAsset(localApi, asset, blob) {
  const path = `/api/profiles/${encodeURIComponent(localApi.profileId)}/projects/${encodeURIComponent(localApi.projectId)}/lovable-assets/cache`;
  const data = await uploadBlob(path, blob, asset.filename || "lovable-asset", { assetUrl: asset.url });
  return data.asset;
}

async function syncLovableAssets(message) {
  const frames = await inspectAssetFrames(message.tabId);
  const resourceMap = new Map();
  const origins = [];
  for (const frame of frames) {
    if (frame.origin && /^https?:/i.test(frame.origin)) origins.push(frame.origin);
    for (const value of frame.assetUrls || []) {
      try { const parsed = new URL(value); resourceMap.set(parsed.pathname, value); origins.push(parsed.origin); } catch {}
    }
  }
  try { const tabOrigin = new URL(message.tabUrl).origin; if (/^https?:/i.test(tabOrigin)) origins.push(tabOrigin); } catch {}
  const synced = [];
  const failed = [];
  const assets = Array.isArray(message.assets) ? message.assets : [];
  for (const asset of assets) {
    const exact = resourceMap.get(asset.url);
    const candidates = [exact, ...unique(origins).map((origin) => new URL(asset.url, origin).href)];
    try {
      const downloaded = await fetchFirstWorking(candidates);
      const cached = await uploadCachedAsset(message.localApi, asset, downloaded.blob);
      synced.push({ ...cached, sourceUrl: downloaded.sourceUrl });
    } catch (error) { failed.push({ filename: asset.filename, error: error.message }); }
  }
  const lines = [`${synced.length} de ${assets.length} mídia(s) sincronizada(s).`];
  if (failed.length) {
    lines.push("", "Não foi possível baixar:");
    for (const item of failed) lines.push(`- ${item.filename}: ${item.error}`);
  }
  if (!synced.length && failed.length) throw new Error(`${lines.join("\n")}\n\nAbra a versão online em que as imagens aparecem e tente novamente.`);
  return { ok: true, synced: synced.length, failed: failed.length, details: lines.join("\n") };
}



const PREVIEW_TAB_STORAGE_KEY = "lovableBridgePreviewTabsV1";

async function previewTabRegistry() {
  const stored = await chrome.storage.local.get(PREVIEW_TAB_STORAGE_KEY);
  return stored[PREVIEW_TAB_STORAGE_KEY] || {};
}

async function savePreviewTab(projectKey, tab) {
  if (!projectKey || !tab?.id) return;
  const registry = await previewTabRegistry();
  registry[projectKey] = {
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url || "",
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ [PREVIEW_TAB_STORAGE_KEY]: registry });
}

async function clearPreviewTab(projectKey, tabId = null) {
  if (!projectKey) return;
  const registry = await previewTabRegistry();
  const current = registry[projectKey];
  if (!current || (tabId && current.tabId !== tabId)) return;
  delete registry[projectKey];
  await chrome.storage.local.set({ [PREVIEW_TAB_STORAGE_KEY]: registry });
}

function tabMatchesPreview(tab, previewUrl) {
  if (!tab) return false;
  try { return new URL(tab.url || "").origin === new URL(previewUrl).origin; }
  catch { return false; }
}

async function linkedPreviewTab(projectKey, previewUrl, preferredTabId = null) {
  const candidates = [];
  if (preferredTabId) candidates.push(preferredTabId);
  if (projectKey) {
    const registry = await previewTabRegistry();
    if (registry[projectKey]?.tabId) candidates.push(registry[projectKey].tabId);
  }
  for (const id of [...new Set(candidates.filter(Boolean))]) {
    const tab = await chrome.tabs.get(id).catch(() => null);
    if (tabMatchesPreview(tab, previewUrl)) {
      await savePreviewTab(projectKey, tab);
      return tab;
    }
  }
  return null;
}

async function cleanupPreviewDuplicates(previewUrl, keepTabId) {
  const expectedOrigin = new URL(previewUrl).origin;
  const tabs = await chrome.tabs.query({});
  const duplicateIds = tabs.filter((tab) => {
    if (!tab?.id || tab.id === keepTabId) return false;
    try { return new URL(tab.url || "").origin === expectedOrigin; }
    catch { return false; }
  }).map((tab) => tab.id);
  if (duplicateIds.length) await chrome.tabs.remove(duplicateIds).catch(() => {});
  return duplicateIds.length;
}

async function findOrOpenPreviewTab(previewUrl, projectKey = "", preferredTabId = null, cleanupDuplicates = false) {
  const expected = new URL(previewUrl);
  let tab = await linkedPreviewTab(projectKey, previewUrl, preferredTabId);
  if (!tab) {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTabs.find((item) => tabMatchesPreview(item, previewUrl)) || null;
  }
  const tabs = await chrome.tabs.query({});
  if (!tab) {
    tab = tabs.find((item) => {
      try {
        const url = new URL(item.url || "");
        return url.origin === expected.origin && url.pathname === expected.pathname && url.search === expected.search;
      } catch { return false; }
    }) || tabs.find((item) => tabMatchesPreview(item, previewUrl)) || null;
  }
  if (!tab) {
    tab = await chrome.tabs.create({ url: previewUrl, active: true });
    await waitForTabComplete(tab.id);
  } else {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  }
  tab = await chrome.tabs.get(tab.id).catch(() => tab);
  await savePreviewTab(projectKey, tab);
  const closedDuplicates = cleanupDuplicates ? await cleanupPreviewDuplicates(previewUrl, tab.id) : 0;
  return { tab, closedDuplicates };
}

async function findPreviewTab(previewUrl, preferredTabId = null, projectKey = "") {
  const linked = await linkedPreviewTab(projectKey, previewUrl, preferredTabId);
  if (linked) return linked;
  const expected = new URL(previewUrl);
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const active = activeTabs.find((item) => tabMatchesPreview(item, previewUrl));
  if (active) {
    await savePreviewTab(projectKey, active);
    return active;
  }
  const tabs = await chrome.tabs.query({});
  const found = tabs.find((item) => {
    try {
      const url = new URL(item.url || "");
      return url.origin === expected.origin && url.pathname === expected.pathname && url.search === expected.search;
    } catch { return false; }
  }) || tabs.find((item) => tabMatchesPreview(item, previewUrl)) || null;
  if (found) await savePreviewTab(projectKey, found);
  return found;
}

async function focusOrOpenPreview(message) {
  if (!message.previewUrl) throw new Error("Preview local indisponível.");
  const result = await findOrOpenPreviewTab(
    message.previewUrl,
    message.projectKey || "",
    message.tabId || null,
    message.cleanupDuplicates !== false
  );
  return {
    ok: true,
    tabId: result.tab.id,
    actualUrl: result.tab.url || message.previewUrl,
    closedDuplicates: result.closedDuplicates
  };
}

async function refreshLinkedPreview(message) {
  if (!message.previewUrl) throw new Error("Preview local indisponível.");
  let tab = await findPreviewTab(message.previewUrl, message.tabId || null, message.projectKey || "");
  if (!tab?.id) {
    const opened = await findOrOpenPreviewTab(message.previewUrl, message.projectKey || "", null, true);
    tab = opened.tab;
  }
  await savePreviewTab(message.projectKey || "", tab);
  await chrome.tabs.reload(tab.id);
  await waitForTabComplete(tab.id);
  const refreshed = await chrome.tabs.get(tab.id).catch(() => tab);
  await savePreviewTab(message.projectKey || "", refreshed);
  const closedDuplicates = message.cleanupDuplicates === false ? 0 : await cleanupPreviewDuplicates(message.previewUrl, tab.id);
  if (message.focus) {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  }
  return {
    ok: true,
    tabId: tab.id,
    actualUrl: refreshed.url || message.previewUrl,
    closedDuplicates
  };
}

async function waitForTabComplete(tabId, timeoutMs = 30000) {
  const existing = await chrome.tabs.get(tabId).catch(() => null);
  if (existing?.status === "complete") return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("O preview não terminou de abrir."));
    }, timeoutMs);
    function listener(updatedTabId, info) {
      if (updatedTabId !== tabId || info.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

const VISUAL_SELECTOR_VERSION = "1.6.0-R24";

async function ensureVisualSelector(tabId) {
  const current = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__lovableBridgeVisualSelector?.version || ""
  }).catch(() => []);
  const installedVersion = current?.[0]?.result || "";
  if (installedVersion && installedVersion !== VISUAL_SELECTOR_VERSION) {
    await chrome.tabs.reload(tabId);
    await waitForTabComplete(tabId);
  }
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["preview-selector.css"] }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId }, files: ["preview-selector.js"] });
}

async function startVisualSelection(message) {
  if (!message.previewUrl) throw new Error("Inicie o preview local antes de selecionar elementos.");
  const opened = await findOrOpenPreviewTab(message.previewUrl, message.projectKey || "", message.tabId || null, true);
  const tab = opened.tab;
  await ensureVisualSelector(tab.id);
  const actualUrl = new URL(tab.url || message.previewUrl);
  const actualRoute = `${actualUrl.pathname}${actualUrl.search}`;
  const incoming = Array.isArray(message.selections) ? message.selections : [];
  const routeSelections = incoming.filter((item) => !item.route || item.route === actualRoute);
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "lb-visual-selection-enable",
    projectKey: message.projectKey,
    sessionId: message.sessionId,
    selections: routeSelections
  });
  await savePreviewTab(message.projectKey || "", tab);
  return {
    ok: true,
    tabId: tab.id,
    response,
    actualRoute,
    actualUrl: tab.url || message.previewUrl,
    discardedSelections: incoming.length - routeSelections.length
  };
}

async function sendVisualSelectionCommand(message) {
  if (!message.previewUrl) throw new Error("Preview local indisponível.");
  const tab = await findPreviewTab(message.previewUrl, message.tabId, message.projectKey || "");
  if (!tab?.id) throw new Error("Abra o preview local para continuar.");
  await ensureVisualSelector(tab.id);
  return await chrome.tabs.sendMessage(tab.id, message.payload);
}

async function recoverVisualSelection(message) {
  if (!message.previewUrl) throw new Error("Preview local indisponível.");
  const tab = await findPreviewTab(message.previewUrl, message.tabId, message.projectKey || "");
  if (!tab?.id) throw new Error("A aba do preview não foi encontrada.");
  await new Promise((resolve) => setTimeout(resolve, 450));
  await chrome.tabs.reload(tab.id);
  await waitForTabComplete(tab.id);
  await ensureVisualSelector(tab.id);
  const actualUrl = new URL(tab.url || message.previewUrl);
  const actualRoute = `${actualUrl.pathname}${actualUrl.search}`;
  const incoming = Array.isArray(message.selections) ? message.selections : [];
  const routeSelections = incoming.filter((item) => !item.route || item.route === actualRoute);
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "lb-visual-selection-enable",
    projectKey: message.projectKey,
    sessionId: message.sessionId,
    selections: routeSelections
  });
  return { ok: true, tabId: tab.id, response, actualRoute, actualUrl: tab.url || message.previewUrl };
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.storage.local.set({ lovableBridgeLauncherVisible: false });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "native-request") {
      sendResponse({ ok: true, data: await requestNative(message.command, message.args || {}, message.timeoutMs) });
      return;
    }
    if (message?.type === "open-panel") {
      const tabId = sender.tab?.id;
      if (!tabId) throw new Error("A aba ativa não foi identificada.");
      await chrome.sidePanel.open({ tabId });
      await setLauncherVisible(tabId, false);
      sendResponse({ ok: true }); return;
    }
    if (message?.type === "close-panel") {
      const tab = await activeTab();
      if (!tab) throw new Error("A aba ativa não foi identificada.");
      await setLauncherVisible(tab.id, true);
      await chrome.sidePanel.close({ windowId: tab.windowId });
      sendResponse({ ok: true }); return;
    }
    if (message?.type === "panel-opened") {
      const tab = await activeTab(); if (tab) await setLauncherVisible(tab.id, false);
      sendResponse({ ok: true }); return;
    }
    if (message?.type === "get-launcher-state") {
      const stored = await chrome.storage.local.get("lovableBridgeLauncherVisible");
      sendResponse({ ok: true, visible: Boolean(stored.lovableBridgeLauncherVisible) }); return;
    }
    if (message?.type === "sync-lovable-assets") {
      sendResponse(await syncLovableAssets(message)); return;
    }
    if (message?.type === "preview-focus-or-open") {
      sendResponse(await focusOrOpenPreview(message)); return;
    }
    if (message?.type === "preview-refresh") {
      sendResponse(await refreshLinkedPreview(message)); return;
    }
    if (message?.type === "visual-selection-start") {
      sendResponse(await startVisualSelection(message)); return;
    }
    if (message?.type === "visual-selection-command") {
      sendResponse({ ok: true, data: await sendVisualSelectionCommand(message) }); return;
    }
    if (message?.type === "visual-selection-recover") {
      sendResponse(await recoverVisualSelection(message)); return;
    }
    if (message?.type === "visual-selection-update") {
      const stored = await chrome.storage.local.get("lovableBridgeVisualSelectionsV2");
      const all = stored.lovableBridgeVisualSelectionsV2 || {};
      if (message.projectKey) all[message.projectKey] = {
        selections: message.selections || [],
        previewUrl: message.previewUrl || "",
        route: message.currentRoute || "",
        pageTitle: message.pageTitle || "",
        tabId: sender.tab?.id || null,
        active: Boolean(message.active),
        locked: Boolean(message.locked),
        updatedAt: Date.now()
      };
      await chrome.storage.local.set({ lovableBridgeVisualSelectionsV2: all });
      sendResponse({ ok: true }); return;
    }
  })().catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

if (chrome.sidePanel.onOpened) chrome.sidePanel.onOpened.addListener(async () => { const tab = await activeTab(); if (tab) await setLauncherVisible(tab.id, false); });
if (chrome.sidePanel.onClosed) chrome.sidePanel.onClosed.addListener(async () => { const tab = await activeTab(); if (tab) await setLauncherVisible(tab.id, true); });

ensureNativePort();

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const registry = await previewTabRegistry().catch(() => ({}));
  let changed = false;
  for (const [projectKey, entry] of Object.entries(registry)) {
    if (entry?.tabId === tabId) {
      delete registry[projectKey];
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ [PREVIEW_TAB_STORAGE_KEY]: registry }).catch(() => {});
});
