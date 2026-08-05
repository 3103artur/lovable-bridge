"use strict";

(() => {
  if (window.__lovableBridgeVisualSelector?.version === "1.6.0-R24") return;

  const MAX_SELECTIONS = 10;
  const ROOT_ID = "lb-visual-selector-root";
  const TOOLBAR_ID = "lb-visual-selector-toolbar";
  const EDITOR_ID = "lb-visual-crop-editor";
  const DELETE_DIALOG_ID = "lb-visual-delete-dialog";
  const GUIDE_X_ID = "lb-visual-guide-x";
  const GUIDE_Y_ID = "lb-visual-guide-y";
  const HOVER_CLASS = "lb-visual-hover";
  const SELECTED_CLASS = "lb-visual-selected";
  const DELETE_CLASS = "lb-visual-delete-pending";

  const state = {
    version: "1.6.0-R24",
    active: false,
    locked: false,
    projectKey: "",
    sessionId: "",
    selections: [],
    hoverTarget: null,
    badges: new Map(),
    originals: new WeakMap(),
    editor: null,
    moveMode: false,
    moveBaseline: null,
    drag: null,
    undoStack: []
  };

  function esc(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  }

  function cssPath(element) {
    if (!(element instanceof Element)) return "";
    if (element.id && document.querySelectorAll(`#${esc(element.id)}`).length === 1) {
      return `#${esc(element.id)}`;
    }
    const parts = [];
    let node = element;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.localName;
      if (!part) break;
      if (node.id) {
        part += `#${esc(node.id)}`;
        parts.unshift(part);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((child) => child.localName === node.localName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
      if (parts.length >= 9) break;
    }
    return parts.join(" > ");
  }

  function backgroundUrl(element) {
    const value = getComputedStyle(element).backgroundImage || "";
    const match = value.match(/^url\(["']?(.*?)["']?\)$/i);
    return match?.[1] || "";
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width >= 32 && rect.height >= 32 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
  }

  function isBridgeUi(element) {
    return Boolean(element?.closest?.(`#${ROOT_ID}, #${TOOLBAR_ID}, #${EDITOR_ID}, #${DELETE_DIALOG_ID}, #lb-visual-toast, #${GUIDE_X_ID}, #${GUIDE_Y_ID}`));
  }

  function normalizedCandidate(element) {
    if (!(element instanceof Element)) return null;
    if (element instanceof SVGElement && element.localName !== "svg") return element.closest("svg") || element;
    return element;
  }

  function isSelectable(element) {
    element = normalizedCandidate(element);
    if (!(element instanceof Element) || isBridgeUi(element)) return false;
    if (["html", "body", "script", "style", "link", "meta", "head"].includes(element.localName)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width >= 12 && rect.height >= 12 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0 && style.pointerEvents !== "none";
  }

  function elementKind(element) {
    if (element.matches("img")) return "image";
    if (backgroundUrl(element)) return "background";
    const tag = element.localName;
    const role = String(element.getAttribute("role") || "").toLowerCase();
    if (tag === "header") return "header";
    if (tag === "footer") return "footer";
    if (tag === "nav") return "navigation";
    if (tag === "main") return "main";
    if (tag === "section") return "section";
    if (tag === "form") return "form";
    if (tag === "button" || role === "button") return "button";
    if (tag === "a") return "link";
    if (["svg", "i"].includes(tag) || role === "img") return "icon";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (["p", "span", "strong", "em", "small", "label"].includes(tag)) return "text";
    if (["input", "textarea", "select"].includes(tag)) return "field";
    if (["article", "aside"].includes(tag)) return tag;
    return "container";
  }

  function directText(element) {
    const parts = [];
    for (const node of element.childNodes || []) {
      if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent || "");
    }
    return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 220);
  }

  function nearestHeading(element) {
    let node = element;
    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      const heading = node.matches?.("h1,h2,h3,h4,h5,h6") ? node : node.querySelector?.("h1,h2,h3,h4,h5,h6");
      const text = String(heading?.innerText || heading?.textContent || "").replace(/\s+/g, " ").trim();
      if (text) return text.slice(0, 180);
    }
    return "";
  }

  function hierarchyHint(element) {
    const parts = [];
    let node = element;
    for (let depth = 0; node && depth < 6 && node.localName !== "body"; depth += 1, node = node.parentElement) {
      const kind = elementKind(node);
      const id = node.id ? `#${node.id}` : "";
      const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/).slice(0, 2).filter(Boolean).map((value) => `.${value}`).join("") : "";
      parts.unshift(`${kind}:${node.localName}${id}${cls}`);
    }
    return parts.join(" > ").slice(0, 700);
  }

  function targetFromEvent(event) {
    const path = event.composedPath?.() || [];
    for (const raw of path) {
      const node = normalizedCandidate(raw);
      if (isSelectable(node)) return node;
    }
    return null;
  }

  function nearestText(element) {
    let node = element.parentElement;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      const text = String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      if (text && text.length < 500) return text.slice(0, 180);
    }
    return "";
  }

  function sourceFor(element) {
    return element.matches("img") ? (element.currentSrc || element.src || "") : backgroundUrl(element);
  }

  function safeDecode(value) {
    try { return decodeURIComponent(String(value || "")); }
    catch { return String(value || ""); }
  }

  function sourceDetails(element) {
    const raw = sourceFor(element);
    const srcAttribute = element.matches("img") ? String(element.getAttribute("src") || "") : "";
    if (!raw) return { raw: "", srcAttribute, sourcePathHint: "", sourceFile: "", sourceOrigin: "", sourceKind: "none" };
    let sourcePathHint = "";
    let sourceFile = "";
    let sourceOrigin = "";
    let sourceKind = "unknown";

    try {
      const url = new URL(raw, location.href);
      sourceOrigin = url.origin;
      if (url.protocol === "data:") {
        sourceKind = "inline-data";
      } else if (url.protocol === "blob:") {
        sourceKind = "blob";
      } else {
        const pathname = safeDecode(url.pathname).replace(/\\/g, "/");
        sourceFile = pathname.split("/").filter(Boolean).pop() || "";
        if (/^https?:$/i.test(url.protocol)) {
          sourceKind = url.origin === location.origin ? "local-preview" : "remote";
          if (url.origin === location.origin) {
            if (pathname.startsWith("/@fs/")) sourcePathHint = pathname.slice(5);
            else if (pathname.startsWith("/src/")) sourcePathHint = pathname.slice(1);
            else if (pathname.startsWith("/public/")) sourcePathHint = pathname.slice(1);
            else if (pathname && pathname !== "/") sourcePathHint = `public${pathname}`;
          }
        }
      }
    } catch {
      const clean = safeDecode(raw).split(/[?#]/)[0].replace(/\\/g, "/");
      sourceFile = clean.split("/").filter(Boolean).pop() || "";
      sourcePathHint = clean.replace(/^\//, "");
      sourceKind = clean ? "relative" : "unknown";
    }

    if (!sourceFile && srcAttribute && !/^data:|^blob:/i.test(srcAttribute)) {
      const clean = safeDecode(srcAttribute).split(/[?#]/)[0].replace(/\\/g, "/");
      sourceFile = clean.split("/").filter(Boolean).pop() || "";
    }

    return { raw, srcAttribute, sourcePathHint, sourceFile, sourceOrigin, sourceKind };
  }

  function sourceLocationHint(element) {
    const interesting = [
      "data-lov-id", "data-source", "data-source-file", "data-file",
      "data-component-path", "data-component", "data-testid"
    ];
    let node = element;
    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      for (const name of interesting) {
        const value = String(node.getAttribute?.(name) || "").trim();
        if (value) return `${name}=${value.slice(0, 240)}`;
      }
    }
    return "";
  }

  function transformDetails(element, style) {
    if (!element.matches("img")) return { zoom: 1, rotation: 0 };
    const transform = String(style.transform || "none");
    if (!transform || transform === "none") return { zoom: 1, rotation: 0 };
    try {
      const matrix = new DOMMatrixReadOnly(transform);
      const zoom = Math.sqrt((matrix.a ** 2) + (matrix.b ** 2));
      let rotation = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
      if (rotation > 180) rotation -= 360;
      if (rotation < -180) rotation += 360;
      return {
        zoom: Math.max(1, Math.min(3, Number.isFinite(zoom) ? zoom : 1)),
        rotation: Math.max(-180, Math.min(180, Number.isFinite(rotation) ? rotation : 0))
      };
    } catch {
      return { zoom: 1, rotation: 0 };
    }
  }

  function defaultCrop(element) {
    const style = getComputedStyle(element);
    const position = element.matches("img") ? style.objectPosition : style.backgroundPosition;
    const values = String(position || "50% 50%").match(/(-?[\d.]+)%?\s+(-?[\d.]+)%?/);
    const transform = transformDetails(element, style);
    return {
      x: values ? Math.max(0, Math.min(100, Number(values[1]))) : 50,
      y: values ? Math.max(0, Math.min(100, Number(values[2]))) : 50,
      zoom: transform.zoom,
      rotation: transform.rotation
    };
  }

  function describe(element, existing = null) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const selector = cssPath(element);
    const details = sourceDetails(element);
    const kind = elementKind(element);
    const media = kind === "image" || kind === "background";
    const sourceKey = details.sourcePathHint || details.sourceFile || details.raw.slice(0, 300) || kind;
    return {
      key: existing?.key || `${location.pathname}|${selector}|${sourceKey}`,
      selector,
      route: `${location.pathname}${location.search}`,
      pageTitle: document.title,
      type: element.matches("img") ? "img" : (backgroundUrl(element) ? "background" : kind),
      elementKind: kind,
      tagName: element.localName,
      role: String(element.getAttribute("role") || ""),
      source: details.raw,
      sourceAttribute: details.srcAttribute,
      sourcePathHint: details.sourcePathHint,
      sourceFile: details.sourceFile,
      sourceOrigin: details.sourceOrigin,
      sourceKind: details.sourceKind,
      sourceLocationHint: sourceLocationHint(element),
      elementId: element.id || "",
      className: typeof element.className === "string" ? element.className.slice(0, 500) : "",
      alt: element.matches("img") ? (element.alt || "") : "",
      directText: directText(element),
      nearbyText: nearestText(element),
      nearestHeading: nearestHeading(element),
      hierarchy: hierarchyHint(element),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      naturalWidth: element.matches("img") ? Number(element.naturalWidth || 0) : 0,
      naturalHeight: element.matches("img") ? Number(element.naturalHeight || 0) : 0,
      objectFit: element.matches("img") ? style.objectFit : "",
      objectPosition: element.matches("img") ? style.objectPosition : "",
      backgroundPosition: backgroundUrl(element) ? style.backgroundPosition : "",
      crop: media ? (existing?.crop || defaultCrop(element)) : null,
      move: existing?.move ? { ...existing.move } : null,
      deleteRequested: Boolean(existing?.deleteRequested)
    };
  }

  function currentRoute() {
    return `${location.pathname}${location.search}`;
  }

  function elementFor(selection) {
    if (selection?.route && selection.route !== currentRoute()) return null;
    try {
      const element = document.querySelector(selection.selector);
      if (element) return element;
    } catch {}
    if (selection.source) {
      const candidates = [...document.querySelectorAll("img, body *")].filter((element) => sourceFor(element) === selection.source);
      return candidates.length === 1 ? candidates[0] : null;
    }
    return null;
  }

  function storeOriginal(element) {
    if (state.originals.has(element)) return;
    state.originals.set(element, {
      objectFit: element.style.objectFit,
      objectPosition: element.style.objectPosition,
      transform: element.style.transform,
      transformOrigin: element.style.transformOrigin,
      backgroundPosition: element.style.backgroundPosition,
      backgroundSize: element.style.backgroundSize,
      translate: element.style.translate,
      opacity: element.style.opacity,
      filter: element.style.filter,
      parentOverflow: element.parentElement?.style.overflow || ""
    });
  }

  function applyCrop(element, crop) {
    if (!element || !crop) return;
    storeOriginal(element);
    const x = Math.max(0, Math.min(100, Number(crop.x || 50)));
    const y = Math.max(0, Math.min(100, Number(crop.y || 50)));
    const zoom = Math.max(1, Math.min(3, Number(crop.zoom || 1)));
    const rotation = Math.max(-180, Math.min(180, Number(crop.rotation || 0)));
    if (element.matches("img")) {
      if (element.parentElement) element.parentElement.style.overflow = "hidden";
      element.style.objectFit = "cover";
      element.style.objectPosition = `${x}% ${y}%`;
      element.style.transformOrigin = `${x}% ${y}%`;
      const transforms = [];
      if (zoom > 1.001) transforms.push(`scale(${zoom})`);
      if (Math.abs(rotation) > 0.01) transforms.push(`rotate(${rotation}deg)`);
      element.style.transform = transforms.join(" ");
    } else {
      element.style.backgroundPosition = `${x}% ${y}%`;
      element.style.backgroundSize = zoom > 1.001 ? `${Math.round(zoom * 100)}% auto` : "cover";
    }
  }

  function applyMove(element, move) {
    if (!element) return;
    storeOriginal(element);
    const dx = Number(move?.dx || 0);
    const dy = Number(move?.dy || 0);
    element.style.translate = `${dx}px ${dy}px`;
  }

  function applyDeletePreview(element, requested) {
    if (!element) return;
    storeOriginal(element);
    element.classList.toggle(DELETE_CLASS, Boolean(requested));
    if (requested) {
      element.style.opacity = "0.24";
      element.style.filter = "grayscale(1)";
    } else {
      const original = state.originals.get(element);
      element.style.opacity = original?.opacity || "";
      element.style.filter = original?.filter || "";
    }
  }

  function applySelectionPreview(selection) {
    const element = elementFor(selection);
    if (!element) return;
    if (selection.crop) applyCrop(element, selection.crop);
    if (selection.move) applyMove(element, selection.move);
    applyDeletePreview(element, selection.deleteRequested);
  }

  function restoreOriginal(element) {
    const original = state.originals.get(element);
    if (!original) return;
    element.style.objectFit = original.objectFit;
    element.style.objectPosition = original.objectPosition;
    element.style.transform = original.transform;
    element.style.transformOrigin = original.transformOrigin;
    element.style.backgroundPosition = original.backgroundPosition;
    element.style.backgroundSize = original.backgroundSize;
    element.style.translate = original.translate;
    element.style.opacity = original.opacity;
    element.style.filter = original.filter;
    element.classList.remove(DELETE_CLASS);
    if (element.parentElement) element.parentElement.style.overflow = original.parentOverflow;
  }

  function sendState() {
    const payload = {
      type: "visual-selection-update",
      projectKey: state.projectKey,
      sessionId: state.sessionId,
      previewUrl: location.href,
      active: state.active,
      locked: state.locked,
      currentRoute: currentRoute(),
      pageTitle: document.title,
      selections: state.selections.map((selection, index) => ({ ...selection, order: index + 1 }))
    };
    chrome.runtime.sendMessage(payload).catch(() => {});
  }

  function removeBadges() {
    for (const badge of state.badges.values()) badge.remove();
    state.badges.clear();
  }

  function updateBadges() {
    removeBadges();
    if (!state.active && !state.locked) return;
    state.selections.forEach((selection, index) => {
      const element = elementFor(selection);
      if (!element) return;
      element.classList.add(SELECTED_CLASS);
      const rect = element.getBoundingClientRect();
      const badge = document.createElement("span");
      badge.className = "lb-visual-order-badge";
      badge.textContent = String(index + 1);
      badge.style.left = `${Math.max(4, rect.left + 5)}px`;
      badge.style.top = `${Math.max(4, rect.top + 5)}px`;
      document.documentElement.appendChild(badge);
      state.badges.set(selection.key, badge);
    });
  }

  function clearClasses() {
    document.querySelectorAll(`.${HOVER_CLASS}`).forEach((element) => element.classList.remove(HOVER_CLASS));
    document.querySelectorAll(`.${SELECTED_CLASS}`).forEach((element) => element.classList.remove(SELECTED_CLASS));
    removeBadges();
  }

  function refreshVisuals() {
    clearClasses();
    updateBadges();
    updateToolbar();
  }

  function selectionIndex(element) {
    const selector = cssPath(element);
    const route = currentRoute();
    return state.selections.findIndex((item) => item.route === route && item.selector === selector);
  }

  function toggleSelection(element, additive) {
    const index = selectionIndex(element);
    if (index >= 0) {
      state.selections.splice(index, 1);
    } else {
      if (!additive) state.selections = [];
      if (state.selections.length >= MAX_SELECTIONS) {
        showToast(`Máximo de ${MAX_SELECTIONS} elementos por comando.`);
        return;
      }
      state.selections.push(describe(element));
    }
    refreshVisuals();
    sendState();
  }

  function replaceLastSelection(element) {
    if (!state.selections.length || !isSelectable(element)) return false;
    const index = state.selections.length - 1;
    const previous = state.selections[index];
    const previousElement = elementFor(previous);
    if (previousElement) restoreOriginal(previousElement);
    state.selections[index] = describe(element);
    refreshVisuals();
    sendState();
    return true;
  }

  function selectParentOfLast() {
    if (!state.selections.length) return showToast("Selecione um elemento primeiro.");
    const current = elementFor(state.selections[state.selections.length - 1]);
    let parent = current?.parentElement || null;
    while (parent && !isSelectable(parent)) parent = parent.parentElement;
    if (!parent || parent.localName === "body") return showToast("Não há outro container selecionável acima.");
    replaceLastSelection(parent);
    showToast(`Selecionado: ${elementKind(parent)} (${parent.localName}).`);
  }

  function selectSectionOfLast() {
    if (!state.selections.length) return showToast("Selecione um elemento primeiro.");
    const current = elementFor(state.selections[state.selections.length - 1]);
    let node = current;
    let candidate = null;
    while (node && node.localName !== "body") {
      const kind = elementKind(node);
      if (["section", "header", "footer", "navigation", "main", "article", "aside", "form"].includes(kind)) { candidate = node; break; }
      const cls = typeof node.className === "string" ? node.className : "";
      if (/section|hero|header|footer|card|panel|wrapper|container/i.test(cls) && isSelectable(node)) candidate = node;
      node = node.parentElement;
    }
    if (!candidate) return showToast("Não foi possível identificar uma seção acima do elemento.");
    replaceLastSelection(candidate);
    showToast(`Seção selecionada: ${elementKind(candidate)} (${candidate.localName}).`);
  }

  function showToast(text) {
    let toast = document.getElementById("lb-visual-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "lb-visual-toast";
      document.documentElement.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add("is-visible");
    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
  }

  function ensureToolbar() {
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) return toolbar;
    toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.innerHTML = `
      <div class="lb-toolbar-main">
        <strong>Seleção visual</strong>
        <span id="lb-visual-count">0/10 selecionadas</span>
      </div>
      <div class="lb-toolbar-help" id="lb-toolbar-help">Clique em qualquer elemento • Ctrl/Cmd adiciona • Setas refinam o movimento • Delete solicita exclusão</div>
      <div class="lb-toolbar-actions">
        <button type="button" data-action="parent">↑ Pai</button>
        <button type="button" data-action="section">Selecionar seção</button>
        <button type="button" data-action="move">Mover</button>
        <button type="button" data-action="delete" class="danger">Excluir</button>
        <button type="button" data-action="clear">Limpar</button>
        <button type="button" data-action="done" class="primary">Concluir</button>
      </div>`;
    toolbar.addEventListener("click", (event) => {
      const action = event.target.closest("button")?.dataset.action;
      if (action === "parent") selectParentOfLast();
      if (action === "section") selectSectionOfLast();
      if (action === "move") toggleMoveMode();
      if (action === "delete") requestDeleteSelected();
      if (action === "clear") clearSelections();
      if (action === "done") {
        if (state.moveMode) finishMoveMode(true);
        disable();
      }
    });
    document.documentElement.appendChild(toolbar);
    return toolbar;
  }

  function updateToolbar() {
    const toolbar = ensureToolbar();
    toolbar.classList.toggle("is-visible", state.active);
    toolbar.classList.toggle("is-moving", state.moveMode);
    const count = toolbar.querySelector("#lb-visual-count");
    if (count) count.textContent = `${state.selections.length}/10 elemento(s)`;
    const moveButton = toolbar.querySelector('[data-action="move"]');
    if (moveButton) {
      moveButton.classList.toggle("active", state.moveMode);
      moveButton.textContent = state.moveMode ? "Movendo…" : "Mover";
      moveButton.disabled = !state.selections.length;
    }
    const deleteButton = toolbar.querySelector('[data-action="delete"]');
    if (deleteButton) deleteButton.disabled = !state.selections.length;
    const help = toolbar.querySelector("#lb-toolbar-help");
    if (help) help.textContent = state.moveMode
      ? "Arraste ou use as setas • Shift = 10 px • Enter aplica • Esc cancela • Delete exclui"
      : "Clique em qualquer elemento • Ctrl/Cmd adiciona • Setas refinam no modo Mover • Delete solicita exclusão";
  }

  function selectedEntries() {
    return state.selections.map((selection) => ({ selection, element: elementFor(selection) })).filter((entry) => entry.element);
  }

  function clonePreviewState() {
    return state.selections.map((selection) => ({
      key: selection.key,
      move: selection.move ? { ...selection.move, originalRect: selection.move.originalRect ? { ...selection.move.originalRect } : null, finalRect: selection.move.finalRect ? { ...selection.move.finalRect } : null, alignment: selection.move.alignment ? { ...selection.move.alignment } : null } : null,
      deleteRequested: Boolean(selection.deleteRequested)
    }));
  }

  function pushUndo() {
    state.undoStack.push(clonePreviewState());
    if (state.undoStack.length > 20) state.undoStack.shift();
  }

  function restorePreviewSnapshot(snapshot) {
    if (!Array.isArray(snapshot)) return;
    for (const item of snapshot) {
      const selection = state.selections.find((entry) => entry.key === item.key);
      if (!selection) continue;
      selection.move = item.move ? { ...item.move } : null;
      selection.deleteRequested = Boolean(item.deleteRequested);
      const element = elementFor(selection);
      if (!element) continue;
      restoreOriginal(element);
      applySelectionPreview(selection);
    }
    hideGuides();
    refreshVisuals();
    sendState();
  }

  function undoPreviewAction() {
    const snapshot = state.undoStack.pop();
    if (!snapshot) return showToast("Não há outro ajuste visual para desfazer.");
    restorePreviewSnapshot(snapshot);
    showToast("Último ajuste visual desfeito.");
  }

  function ensureGuides() {
    let xGuide = document.getElementById(GUIDE_X_ID);
    let yGuide = document.getElementById(GUIDE_Y_ID);
    if (!xGuide) {
      xGuide = document.createElement("div");
      xGuide.id = GUIDE_X_ID;
      document.documentElement.appendChild(xGuide);
    }
    if (!yGuide) {
      yGuide = document.createElement("div");
      yGuide.id = GUIDE_Y_ID;
      document.documentElement.appendChild(yGuide);
    }
    return { xGuide, yGuide };
  }

  function hideGuides() {
    const { xGuide, yGuide } = ensureGuides();
    xGuide.classList.remove("is-visible");
    yGuide.classList.remove("is-visible");
  }

  function guideCandidates(element) {
    const scope = element.closest("section,main,article,aside,header,footer") || element.parentElement || document.body;
    const nodes = [scope, ...scope.querySelectorAll("section,article,aside,div,p,h1,h2,h3,h4,h5,h6,img,button,a")];
    const unique = [];
    for (const candidate of nodes) {
      if (!(candidate instanceof Element) || candidate === element || candidate.contains(element) || element.contains(candidate) || isBridgeUi(candidate)) continue;
      if (state.selections.some((selection) => elementFor(selection) === candidate)) continue;
      const rect = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      if (rect.width < 20 || rect.height < 12 || rect.bottom < 0 || rect.top > innerHeight || style.display === "none" || style.visibility === "hidden") continue;
      unique.push({ candidate, rect });
      if (unique.length >= 180) break;
    }
    return unique;
  }

  function referenceLabel(element) {
    return directText(element) || nearestHeading(element) || element.getAttribute("aria-label") || element.id || elementKind(element);
  }

  function snapMove(element, selection, dx, dy) {
    applyMove(element, { dx, dy });
    const rect = element.getBoundingClientRect();
    let bestX = null;
    let bestY = null;
    const ownX = [rect.left, rect.left + rect.width / 2, rect.right];
    const ownY = [rect.top, rect.top + rect.height / 2, rect.bottom];
    for (const { candidate, rect: other } of guideCandidates(element)) {
      const otherX = [other.left, other.left + other.width / 2, other.right];
      const otherY = [other.top, other.top + other.height / 2, other.bottom];
      for (let a = 0; a < ownX.length; a += 1) for (let b = 0; b < otherX.length; b += 1) {
        const delta = otherX[b] - ownX[a];
        if (Math.abs(delta) <= 6 && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, line: otherX[b], candidate, edge: ["left", "center", "right"][b] };
      }
      for (let a = 0; a < ownY.length; a += 1) for (let b = 0; b < otherY.length; b += 1) {
        const delta = otherY[b] - ownY[a];
        if (Math.abs(delta) <= 6 && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, line: otherY[b], candidate, edge: ["top", "center", "bottom"][b] };
      }
    }
    if (bestX) dx += bestX.delta;
    if (bestY) dy += bestY.delta;
    applyMove(element, { dx, dy });
    const finalRect = element.getBoundingClientRect();
    const { xGuide, yGuide } = ensureGuides();
    if (bestX) {
      xGuide.style.left = `${bestX.line}px`;
      xGuide.classList.add("is-visible");
    } else xGuide.classList.remove("is-visible");
    if (bestY) {
      yGuide.style.top = `${bestY.line}px`;
      yGuide.classList.add("is-visible");
    } else yGuide.classList.remove("is-visible");
    return {
      dx, dy,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      originalRect: selection.move?.originalRect || {
        left: Math.round(finalRect.left - dx), top: Math.round(finalRect.top - dy), width: Math.round(finalRect.width), height: Math.round(finalRect.height)
      },
      finalRect: { left: Math.round(finalRect.left), top: Math.round(finalRect.top), width: Math.round(finalRect.width), height: Math.round(finalRect.height) },
      alignment: bestX || bestY ? {
        horizontal: bestX?.edge || "",
        vertical: bestY?.edge || "",
        reference: referenceLabel((bestX || bestY).candidate).slice(0, 160),
        referenceSelector: cssPath((bestX || bestY).candidate)
      } : null,
      applyScope: "responsive-layout"
    };
  }

  function moveBy(deltaX, deltaY, { absoluteBaselines = null } = {}) {
    const entries = selectedEntries();
    if (!entries.length) return;
    const single = entries.length === 1;
    entries.forEach(({ selection, element }) => {
      const baseline = absoluteBaselines?.get(selection.key) || selection.move || { dx: 0, dy: 0 };
      const targetX = Number(baseline.dx || 0) + deltaX;
      const targetY = Number(baseline.dy || 0) + deltaY;
      if (single) selection.move = snapMove(element, selection, targetX, targetY);
      else {
        applyMove(element, { dx: targetX, dy: targetY });
        const rect = element.getBoundingClientRect();
        selection.move = {
          dx: targetX, dy: targetY, viewportWidth: innerWidth, viewportHeight: innerHeight,
          originalRect: selection.move?.originalRect || { left: Math.round(rect.left - targetX), top: Math.round(rect.top - targetY), width: Math.round(rect.width), height: Math.round(rect.height) },
          finalRect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
          alignment: null, applyScope: "responsive-layout"
        };
      }
    });
    refreshVisuals();
  }

  function startMoveMode() {
    if (!state.selections.length) return showToast("Selecione um elemento antes de mover.");
    if (state.moveMode) return;
    pushUndo();
    state.moveBaseline = new Map(state.selections.map((selection) => [selection.key, selection.move ? { ...selection.move } : { dx: 0, dy: 0 }]));
    state.moveMode = true;
    document.documentElement.classList.add("lb-visual-move-mode");
    updateToolbar();
    showToast("Modo Mover: arraste ou use as setas. Shift move 10 px; Enter aplica; Esc cancela.");
  }

  function finishMoveMode(save) {
    if (!state.moveMode) return;
    if (!save && state.moveBaseline) {
      for (const selection of state.selections) {
        const baseline = state.moveBaseline.get(selection.key) || null;
        selection.move = baseline && (Number(baseline.dx) || Number(baseline.dy)) ? { ...baseline } : null;
        const element = elementFor(selection);
        if (element) {
          restoreOriginal(element);
          applySelectionPreview(selection);
        }
      }
      state.undoStack.pop();
      showToast("Movimento cancelado.");
    } else {
      showToast("Posição visual registrada. Use ‘Aplicar posição’ no painel para gravar no código.");
    }
    state.moveMode = false;
    state.moveBaseline = null;
    state.drag = null;
    document.documentElement.classList.remove("lb-visual-move-mode");
    hideGuides();
    refreshVisuals();
    sendState();
  }

  function toggleMoveMode() {
    if (state.moveMode) finishMoveMode(true);
    else startMoveMode();
  }

  function requestDeleteSelected() {
    if (!state.selections.length) return showToast("Selecione um elemento antes de excluir.");
    if (state.selections.every((selection) => selection.deleteRequested)) {
      pushUndo();
      state.selections.forEach((selection) => {
        selection.deleteRequested = false;
        const element = elementFor(selection);
        if (element) applyDeletePreview(element, false);
      });
      refreshVisuals();
      sendState();
      return showToast("Exclusão pendente cancelada.");
    }
    document.getElementById(DELETE_DIALOG_ID)?.remove();
    const dialog = document.createElement("div");
    dialog.id = DELETE_DIALOG_ID;
    const count = state.selections.length;
    const sample = state.selections.slice(0, 2).map((selection) => selection.directText || selection.nearestHeading || selectedLabel(selection)).filter(Boolean).join(" • ");
    dialog.innerHTML = `
      <div class="lb-delete-dialog" role="dialog" aria-modal="true">
        <strong>Excluir ${count === 1 ? "o elemento selecionado" : `${count} elementos selecionados`}?</strong>
        <p>${sample ? sample.replace(/[<>&]/g, "") : "O elemento será removido do código depois da confirmação no painel."}</p>
        <span>A exclusão fica apenas marcada no preview até você clicar em “Aplicar exclusão”.</span>
        <div><button type="button" data-action="cancel">Cancelar</button><button type="button" data-action="confirm" class="danger">Marcar para excluir</button></div>
      </div>`;
    function close(confirmDelete) {
      if (confirmDelete) {
        pushUndo();
        state.selections.forEach((selection) => {
          selection.deleteRequested = true;
          const element = elementFor(selection);
          if (element) applyDeletePreview(element, true);
        });
        refreshVisuals();
        sendState();
        showToast("Exclusão marcada. Use ‘Aplicar exclusão’ no painel para gravar no código.");
      }
      dialog.remove();
    }
    dialog.addEventListener("click", (event) => {
      const action = event.target.closest("button")?.dataset.action;
      if (action === "confirm") close(true);
      if (action === "cancel" || event.target === dialog) close(false);
    });
    document.documentElement.appendChild(dialog);
  }

  function selectedLabel(selection) {
    return selection.directText || selection.nearestHeading || selection.alt || selection.elementKind || "elemento";
  }

  function isTypingTarget(target) {
    return Boolean(target?.closest?.("input,textarea,select,[contenteditable='true'],[contenteditable='']"));
  }

  function selectedElementFromEvent(event) {
    const path = event.composedPath?.() || [];
    for (const raw of path) {
      if (!(raw instanceof Element)) continue;
      const match = state.selections.find((selection) => elementFor(selection) === raw);
      if (match) return { selection: match, element: raw };
    }
    return null;
  }

  function onPointerDown(event) {
    if (!state.active || !state.moveMode || state.editor || event.button !== 0) return;
    const hit = selectedElementFromEvent(event);
    if (!hit) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const baselines = new Map(state.selections.map((selection) => [selection.key, selection.move ? { ...selection.move } : { dx: 0, dy: 0 }]));
    state.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, baselines };
    try { hit.element.setPointerCapture(event.pointerId); } catch {}
  }

  function onPointerMove(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    event.preventDefault();
    moveBy(event.clientX - state.drag.startX, event.clientY - state.drag.startY, { absoluteBaselines: state.drag.baselines });
  }

  function onPointerUp(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    event.preventDefault();
    state.drag = null;
    hideGuides();
    sendState();
  }

  function clearSelections() {
    for (const selection of state.selections) {
      const element = elementFor(selection);
      if (element) restoreOriginal(element);
    }
    state.selections = [];
    state.locked = false;
    state.moveMode = false;
    state.moveBaseline = null;
    state.drag = null;
    state.undoStack = [];
    document.documentElement.classList.remove("lb-visual-selection-locked", "lb-visual-move-mode");
    hideGuides();
    refreshVisuals();
    sendState();
  }

  function openEditor(element) {
    const kind = elementKind(element);
    if (kind !== "image" && kind !== "background") {
      showToast("O ajuste de X, Y, zoom e rotação está disponível apenas para imagens.");
      return;
    }
    let index = selectionIndex(element);
    if (index < 0) {
      if (state.selections.length >= MAX_SELECTIONS) return;
      state.selections.push(describe(element));
      index = state.selections.length - 1;
    }
    const selection = state.selections[index];
    const originalCrop = { ...selection.crop };
    const source = selection.source;
    if (!source) return;

    document.getElementById(EDITOR_ID)?.remove();
    const editor = document.createElement("div");
    editor.id = EDITOR_ID;
    editor.innerHTML = `
      <div class="lb-crop-dialog" role="dialog" aria-modal="true">
        <div class="lb-crop-header">
          <div><strong>Enquadrar imagem ${index + 1}</strong><span>Arraste a imagem ou use os controles de posição, zoom e rotação.</span></div>
          <button type="button" data-action="cancel" aria-label="Fechar">×</button>
        </div>
        <div class="lb-crop-stage"><img alt="Prévia do enquadramento"></div>
        <div class="lb-crop-controls">
          <label>Zoom <input data-control="zoom" type="range" min="100" max="250" step="1"></label>
          <label>Horizontal <input data-control="x" type="range" min="0" max="100" step="1"></label>
          <label>Vertical <input data-control="y" type="range" min="0" max="100" step="1"></label>
          <label>Rotação <input data-control="rotation" type="range" min="-180" max="180" step="1"></label>
        </div>
        <div class="lb-crop-values"></div>
        <div class="lb-crop-actions">
          <button type="button" data-action="reset">Centralizar</button>
          <button type="button" data-action="cancel">Cancelar</button>
          <button type="button" data-action="save" class="primary">Salvar enquadramento</button>
        </div>
      </div>`;

    const image = editor.querySelector(".lb-crop-stage img");
    image.src = source;
    const controls = {
      zoom: editor.querySelector('[data-control="zoom"]'),
      x: editor.querySelector('[data-control="x"]'),
      y: editor.querySelector('[data-control="y"]'),
      rotation: editor.querySelector('[data-control="rotation"]')
    };
    const working = { rotation: 0, ...selection.crop };
    const rotationSupported = selection.type === "img";
    controls.zoom.value = String(Math.round((working.zoom || 1) * 100));
    controls.x.value = String(Math.round(working.x ?? 50));
    controls.y.value = String(Math.round(working.y ?? 50));
    controls.rotation.value = String(Math.round(working.rotation || 0));
    controls.rotation.disabled = !rotationSupported;
    if (!rotationSupported) controls.rotation.closest("label").title = "Rotação disponível somente para elementos de imagem.";

    function render() {
      working.zoom = Number(controls.zoom.value) / 100;
      working.x = Number(controls.x.value);
      working.y = Number(controls.y.value);
      working.rotation = rotationSupported ? Number(controls.rotation.value) : 0;
      image.style.objectPosition = `${working.x}% ${working.y}%`;
      image.style.transformOrigin = `${working.x}% ${working.y}%`;
      image.style.transform = `scale(${working.zoom}) rotate(${working.rotation}deg)`;
      const rotationText = rotationSupported ? ` • Rotação ${Math.round(working.rotation)}°` : " • Rotação indisponível";
      editor.querySelector(".lb-crop-values").textContent = `X ${Math.round(working.x)}% • Y ${Math.round(working.y)}% • Zoom ${Math.round(working.zoom * 100)}%${rotationText}`;
      applyCrop(element, working);
    }
    Object.values(controls).forEach((control) => control.addEventListener("input", render));

    const stage = editor.querySelector(".lb-crop-stage");
    let drag = null;
    stage.addEventListener("pointerdown", (event) => {
      drag = { x: event.clientX, y: event.clientY, startX: Number(controls.x.value), startY: Number(controls.y.value) };
      stage.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    stage.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const rect = stage.getBoundingClientRect();
      controls.x.value = String(Math.max(0, Math.min(100, drag.startX - ((event.clientX - drag.x) / rect.width) * 100)));
      controls.y.value = String(Math.max(0, Math.min(100, drag.startY - ((event.clientY - drag.y) / rect.height) * 100)));
      render();
    });
    stage.addEventListener("pointerup", () => { drag = null; });
    stage.addEventListener("wheel", (event) => {
      event.preventDefault();
      const next = Math.max(100, Math.min(250, Number(controls.zoom.value) + (event.deltaY < 0 ? 5 : -5)));
      controls.zoom.value = String(next);
      render();
    }, { passive: false });

    function close(save) {
      if (save) {
        selection.crop = { ...working };
        applyCrop(element, selection.crop);
        state.selections[index] = describe(element, selection);
        state.selections[index].crop = { ...working };
      } else {
        selection.crop = originalCrop;
        applyCrop(element, originalCrop);
      }
      editor.remove();
      state.editor = null;
      refreshVisuals();
      sendState();
    }

    editor.addEventListener("click", (event) => {
      const action = event.target.closest("button")?.dataset.action;
      if (action === "save") close(true);
      if (action === "cancel") close(false);
      if (action === "reset") {
        controls.zoom.value = "100";
        controls.x.value = "50";
        controls.y.value = "50";
        controls.rotation.value = "0";
        render();
      }
    });
    editor.addEventListener("keydown", (event) => { if (event.key === "Escape") close(false); });
    document.documentElement.appendChild(editor);
    state.editor = editor;
    render();
  }

  function onMove(event) {
    if (!state.active || state.editor) return;
    const target = targetFromEvent(event);
    if (state.hoverTarget && state.hoverTarget !== target) state.hoverTarget.classList.remove(HOVER_CLASS);
    state.hoverTarget = target;
    if (target && selectionIndex(target) < 0) target.classList.add(HOVER_CLASS);
  }

  function onClick(event) {
    if (!state.active || state.editor) return;
    if (state.moveMode) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    const target = targetFromEvent(event);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    toggleSelection(target, Boolean(event.ctrlKey || event.metaKey));
  }

  function onDoubleClick(event) {
    if (!state.active || state.editor) return;
    const target = targetFromEvent(event);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openEditor(target);
  }

  function onKey(event) {
    if (!state.active || state.editor || isTypingTarget(event.target)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      return undoPreviewAction();
    }
    if ((event.key === "Delete" || event.key === "Backspace") && state.selections.length) {
      event.preventDefault();
      return requestDeleteSelected();
    }
    if (state.moveMode && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      moveBy(dx, dy);
      sendState();
      return;
    }
    if (event.key === "Enter" && state.moveMode) {
      event.preventDefault();
      return finishMoveMode(true);
    }
    if (event.key === "Escape" && state.moveMode) {
      event.preventDefault();
      return finishMoveMode(false);
    }
    if (event.key === "Escape") disable();
  }

  function enable(payload = {}) {
    state.projectKey = String(payload.projectKey || state.projectKey || "");
    state.sessionId = String(payload.sessionId || `${Date.now()}`);
    const route = currentRoute();
    if (Array.isArray(payload.selections)) {
      state.selections = payload.selections.filter((item) => !item.route || item.route === route).slice(0, MAX_SELECTIONS);
    }
    state.active = true;
    state.locked = false;
    document.documentElement.classList.remove("lb-visual-selection-locked");
    document.documentElement.classList.add("lb-visual-selection-active");
    for (const selection of state.selections) applySelectionPreview(selection);
    refreshVisuals();
    sendState();
    showToast("Seleção universal ativada. Clique em qualquer elemento; Ctrl/Cmd adiciona outros.");
  }

  function disable() {
    if (state.moveMode) finishMoveMode(true);
    state.active = false;
    state.locked = state.selections.length > 0;
    document.documentElement.classList.remove("lb-visual-selection-active");
    document.documentElement.classList.toggle("lb-visual-selection-locked", state.locked);
    if (state.hoverTarget) state.hoverTarget.classList.remove(HOVER_CLASS);
    state.hoverTarget = null;
    refreshVisuals();
    sendState();
    if (state.locked) showToast(`Seleção fixada em ${currentRoute()}. Ela permanecerá visível até ser limpa ou reativada.`);
  }

  function editByKey(key) {
    const selection = state.selections.find((item) => item.key === key);
    const element = selection ? elementFor(selection) : null;
    if (element) openEditor(element);
  }

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("dblclick", onDoubleClick, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", updateBadges, true);
  window.addEventListener("resize", updateBadges, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "lb-visual-selection-enable") {
      enable(message);
      sendResponse({ ok: true, selections: state.selections });
    } else if (message?.type === "lb-visual-selection-disable") {
      disable();
      sendResponse({ ok: true });
    } else if (message?.type === "lb-visual-selection-clear") {
      clearSelections();
      sendResponse({ ok: true });
    } else if (message?.type === "lb-visual-selection-edit") {
      editByKey(message.key);
      sendResponse({ ok: true });
    } else if (message?.type === "lb-visual-selection-get") {
      sendResponse({
        ok: true,
        active: state.active,
        locked: state.locked,
        route: currentRoute(),
        previewUrl: location.href,
        pageTitle: document.title,
        selections: state.selections
      });
    }
    return true;
  });

  let lastKnownRoute = currentRoute();
  window.setInterval(() => {
    const nextRoute = currentRoute();
    if (nextRoute === lastKnownRoute) return;
    lastKnownRoute = nextRoute;
    if (state.selections.length) {
      state.selections = [];
      state.active = false;
      state.locked = false;
      document.documentElement.classList.remove("lb-visual-selection-active", "lb-visual-selection-locked");
      refreshVisuals();
      sendState();
      showToast(`A página mudou para ${nextRoute}. A seleção anterior foi limpa para evitar editar a rota errada.`);
    }
  }, 500);

  window.__lovableBridgeVisualSelector = { version: "1.6.0-R24", enable, disable, clearSelections, editByKey, state };
})();
