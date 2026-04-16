/*
 * Dark Mode for Chrome — content.js
 * Runs at document_start in every frame on every page.
 *
 * Strategy: inject a <style> element synchronously before first paint and
 * keep it alive even if the page mutates aggressively. Theme mode is driven
 * from storage so the popup can switch modes live across all tabs.
 */

(function () {
  'use strict';

  if (window.__dmfcInitialized__) {
    return;
  }
  window.__dmfcInitialized__ = true;

  const STYLE_ID = '__dmfc_style__';
  const DEFAULT_MODE = 'classic';

  let isDark = false;
  let currentMode = DEFAULT_MODE;
  let domGuard = null;
  let shadowGuard = null;

  function normalizeMode(mode) {
    return ['classic', 'midnight', 'mono'].includes(mode) ? mode : DEFAULT_MODE;
  }

  function getModeFilters(mode) {
    switch (normalizeMode(mode)) {
      case 'midnight':
        return {
          root: 'invert(1) hue-rotate(180deg) brightness(0.9) contrast(1.08)',
          media: 'invert(1) hue-rotate(180deg) brightness(1.05) contrast(0.96)',
        };
      case 'mono':
        return {
          root: 'grayscale(1) invert(1) contrast(1.12)',
          media: 'grayscale(1) invert(1) contrast(1.12)',
        };
      case 'classic':
      default:
        return {
          root: 'invert(1) hue-rotate(180deg)',
          media: 'invert(1) hue-rotate(180deg)',
        };
    }
  }

  function buildPageCss(mode) {
    const filters = getModeFilters(mode);
    return `
html {
  filter: ${filters.root} !important;
  color-scheme: dark !important;
  background: #fff !important;
}
html img,
html video,
html picture,
html canvas,
html svg image,
html embed,
html object,
html input[type="image"] {
  filter: ${filters.media} !important;
}
html [style*="background-image"] {
  filter: ${filters.media} !important;
}
html iframe {
  filter: ${filters.media} !important;
}
html ::-webkit-scrollbar {
  background: #1a1a1a !important;
  width: 8px !important;
  height: 8px !important;
}
html ::-webkit-scrollbar-thumb {
  background: #444 !important;
}
    `.trim();
  }

  function buildShadowCss(mode) {
    const filters = getModeFilters(mode);
    return `
      :host {
        filter: ${filters.root} !important;
        color-scheme: dark !important;
        background: #fff !important;
      }
      :host img,
      :host video,
      :host picture,
      :host canvas,
      :host iframe,
      :host embed,
      :host [style*="background-image"] {
        filter: ${filters.media} !important;
      }
    `;
  }

  const shadowSheet = typeof CSSStyleSheet !== 'undefined' ? new CSSStyleSheet() : null;
  if (shadowSheet) {
    shadowSheet.replaceSync(buildShadowCss(currentMode));
  }

  function injectStyle() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      (document.head || document.documentElement).prepend(el);
    }
    el.textContent = buildPageCss(currentMode);
  }

  function ejectStyle() {
    const el = document.getElementById(STYLE_ID);
    if (el) el.remove();
  }

  function startDomGuard() {
    if (domGuard) return;
    domGuard = new MutationObserver(() => {
      if (isDark && !document.getElementById(STYLE_ID)) {
        injectStyle();
      }
    });
    domGuard.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopDomGuard() {
    if (domGuard) {
      domGuard.disconnect();
      domGuard = null;
    }
  }

  function adoptIntoRoot(root) {
    if (!shadowSheet || !root || !root.adoptedStyleSheets) return;
    if (root.adoptedStyleSheets.includes(shadowSheet)) return;
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, shadowSheet];
  }

  function walkShadows(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.shadowRoot) adoptIntoRoot(node.shadowRoot);
    if (node.querySelectorAll) {
      node.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) adoptIntoRoot(el.shadowRoot);
      });
    }
  }

  function startShadowGuard() {
    if (shadowGuard) return;
    walkShadows(document.documentElement);
    shadowGuard = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) walkShadows(node);
        }
      }
    });
    shadowGuard.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopShadowGuard() {
    if (shadowGuard) {
      shadowGuard.disconnect();
      shadowGuard = null;
    }
    if (!shadowSheet) return;
    document.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot && el.shadowRoot.adoptedStyleSheets) {
        el.shadowRoot.adoptedStyleSheets =
          el.shadowRoot.adoptedStyleSheets.filter((sheet) => sheet !== shadowSheet);
      }
    });
  }

  function updateThemeMode(mode) {
    currentMode = normalizeMode(mode);
    if (shadowSheet) {
      shadowSheet.replaceSync(buildShadowCss(currentMode));
    }
    if (isDark) injectStyle();
  }

  function enable() {
    isDark = true;
    injectStyle();
    startDomGuard();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startShadowGuard, { once: true });
    } else {
      startShadowGuard();
    }
  }

  function disable() {
    isDark = false;
    ejectStyle();
    stopDomGuard();
    stopShadowGuard();
  }

  function hostname() {
    try {
      return location.hostname;
    } catch (_) {
      return '';
    }
  }

  function applyState(state) {
    updateThemeMode(state.themeMode);
    const enabled = state.darkEnabled !== false
      && !(state.whitelist || []).includes(hostname());
    enabled ? enable() : disable();
  }

  enable();

  chrome.storage.sync.get(['darkEnabled', 'whitelist', 'themeMode'], applyState);

  chrome.storage.onChanged.addListener((_, area) => {
    if (area !== 'sync') return;
    chrome.storage.sync.get(['darkEnabled', 'whitelist', 'themeMode'], applyState);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DMFC_APPLY') applyState(msg.state);
  });
})();
