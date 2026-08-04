(() => {
  "use strict";

  const BUTTON_ID = "lovable-bridge-launcher";

  function ensureButton() {
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;

    button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.setAttribute("aria-label", "Abrir Lovable Bridge");
    button.title = "Abrir Lovable Bridge";
    button.textContent = "LB";
    button.hidden = true;
    button.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-panel" }).catch(() => {});
    });

    (document.body || document.documentElement).appendChild(button);
    return button;
  }

  function setVisible(visible) {
    const button = ensureButton();
    button.hidden = !visible;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "launcher-visibility") {
      setVisible(Boolean(message.visible));
    }
  });

  const start = () => {
    ensureButton();
    chrome.runtime
      .sendMessage({ type: "get-launcher-state" })
      .then((response) => setVisible(Boolean(response?.visible)))
      .catch(() => setVisible(false));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
