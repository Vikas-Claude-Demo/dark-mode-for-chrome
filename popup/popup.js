/*
 * Dark Mode for Chrome — popup.js
 * Popup controller for master toggle, site pause, theme mode and schedule.
 */

'use strict';

const masterToggle = document.getElementById('masterToggle');
const masterDot = document.getElementById('masterDot');
const masterSubLabel = document.getElementById('masterSubLabel');
const statusBanner = document.getElementById('statusBanner');
const pauseBtn = document.getElementById('pauseBtn');
const pauseSubLabel = document.getElementById('pauseSubLabel');
const pauseRow = document.getElementById('pauseRow');
const modeGrid = document.getElementById('modeGrid');
const scheduleToggle = document.getElementById('scheduleToggle');
const scheduleSubLabel = document.getElementById('scheduleSubLabel');
const scheduleTimeRow = document.getElementById('scheduleTimeRow');
const onHourInput = document.getElementById('onHourInput');
const offHourInput = document.getElementById('offHourInput');
const saveScheduleBtn = document.getElementById('saveScheduleBtn');
const whitelistBtn = document.getElementById('whitelistBtn');
const rateBtn = document.getElementById('rateBtn');
const whitelistPanel = document.getElementById('whitelistPanel');
const closeWhitelistBtn = document.getElementById('closeWhitelistBtn');
const whitelistBody = document.getElementById('whitelistBody');
const headerVersion = document.getElementById('headerVersion');

const STORAGE_KEYS = ['darkEnabled', 'whitelist', 'scheduleEnabled', 'onHour', 'offHour', 'themeMode'];
const RESTRICTED_URL_PATTERNS = [
  /^chrome:\/\//i,
  /^edge:\/\//i,
  /^about:/i,
  /^view-source:/i,
  /^https:\/\/chromewebstore\.google\.com\//i,
  /^https:\/\/chrome\.google\.com\/webstore\//i,
];

let currentHostname = '';
let currentTabUrl = '';

function normalizeMode(mode) {
  return ['classic', 'midnight', 'mono'].includes(mode) ? mode : 'classic';
}

function modeLabel(mode) {
  switch (normalizeMode(mode)) {
    case 'midnight':
      return 'Midnight Black';
    case 'mono':
      return 'Black & White';
    case 'classic':
    default:
      return 'Classic Dark';
  }
}

function isRestrictedUrl(url) {
  return !url || RESTRICTED_URL_PATTERNS.some((pattern) => pattern.test(url));
}

async function init() {
  // Keep popup version in sync with the packaged extension version.
  if (headerVersion && chrome.runtime?.getManifest) {
    headerVersion.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      currentTabUrl = tab.url;
      try {
        currentHostname = new URL(tab.url).hostname;
      } catch (_) {}
    }
  } catch (_) {}

  chrome.storage.sync.get(STORAGE_KEYS, renderState);
}

function renderState(state) {
  const darkEnabled = state.darkEnabled !== false;
  const whitelist = state.whitelist || [];
  const scheduleEnabled = !!state.scheduleEnabled;
  const onHour = state.onHour ?? 20;
  const offHour = state.offHour ?? 7;
  const themeMode = normalizeMode(state.themeMode);
  const restrictedPage = isRestrictedUrl(currentTabUrl);
  const isWhitelisted = whitelist.includes(currentHostname);

  masterToggle.checked = darkEnabled;
  if (darkEnabled) {
    masterDot.className = isWhitelisted ? 'status-dot paused' : 'status-dot active';
    masterSubLabel.textContent = restrictedPage
      ? `${modeLabel(themeMode)} selected`
      : (isWhitelisted
          ? `Paused on ${currentHostname || 'this site'}`
          : `${modeLabel(themeMode)} active on this site`);
  } else {
    masterDot.className = 'status-dot';
    masterSubLabel.textContent = 'Protection is off';
  }

  statusBanner.hidden = !restrictedPage;
  statusBanner.textContent = restrictedPage
    ? 'Chrome internal pages and the Chrome Web Store do not allow extension styling.'
    : '';

  if (!currentHostname || !darkEnabled || restrictedPage) {
    pauseRow.style.opacity = '0.45';
    pauseRow.style.pointerEvents = 'none';
  } else {
    pauseRow.style.opacity = '1';
    pauseRow.style.pointerEvents = '';
  }
  pauseBtn.textContent = isWhitelisted ? 'Resume' : 'Pause';
  pauseBtn.className = isWhitelisted ? 'action-btn paused' : 'action-btn';
  pauseSubLabel.textContent = restrictedPage
    ? 'Unavailable on this page'
    : (isWhitelisted ? 'Dark mode paused' : 'Dark mode active');

  modeGrid.querySelectorAll('.mode-card').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === themeMode);
  });

  scheduleToggle.checked = scheduleEnabled;
  onHourInput.value = onHour;
  offHourInput.value = offHour;
  scheduleTimeRow.classList.toggle('visible', scheduleEnabled);
  scheduleSubLabel.textContent = scheduleEnabled
    ? `${formatHour(onHour)} – ${formatHour(offHour)} daily`
    : 'Tap to set a daily schedule';
}

function formatHour(hour) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${ampm}`;
}

function reload() {
  chrome.storage.sync.get(STORAGE_KEYS, renderState);
}

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

masterToggle.addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'DMFC_TOGGLE', enabled: masterToggle.checked }, reload);
});

pauseBtn.addEventListener('click', () => {
  if (!currentHostname) return;
  chrome.runtime.sendMessage({ type: 'DMFC_WHITELIST_TOGGLE', hostname: currentHostname }, reload);
});

modeGrid.querySelectorAll('.mode-card').forEach((button) => {
  button.addEventListener('click', () => {
    chrome.storage.sync.set({ themeMode: normalizeMode(button.dataset.mode) }, reload);
  });
});

scheduleToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ scheduleEnabled: scheduleToggle.checked }, reload);
});

saveScheduleBtn.addEventListener('click', () => {
  const onHour = Math.min(23, Math.max(0, parseInt(onHourInput.value, 10) || 20));
  const offHour = Math.min(23, Math.max(0, parseInt(offHourInput.value, 10) || 7));
  chrome.storage.sync.set({ onHour, offHour }, reload);
});

whitelistBtn.addEventListener('click', () => {
  renderWhitelistPanel();
  whitelistPanel.classList.add('visible');
});

closeWhitelistBtn.addEventListener('click', () => {
  whitelistPanel.classList.remove('visible');
});

function renderWhitelistPanel() {
  chrome.storage.sync.get(['whitelist'], (data) => {
    const list = data.whitelist || [];
    if (list.length === 0) {
      whitelistBody.innerHTML = '<p class="empty-msg">No sites paused.</p>';
      return;
    }

    whitelistBody.innerHTML = list
      .map((hostname) => `
        <div class="whitelist-item">
          <span class="whitelist-hostname" title="${esc(hostname)}">${esc(hostname)}</span>
          <button class="whitelist-remove" data-host="${esc(hostname)}">Remove</button>
        </div>`)
      .join('');

    whitelistBody.querySelectorAll('.whitelist-remove').forEach((button) => {
      button.addEventListener('click', () => {
        chrome.runtime.sendMessage(
          { type: 'DMFC_WHITELIST_TOGGLE', hostname: button.dataset.host },
          () => {
            renderWhitelistPanel();
            reload();
          }
        );
      });
    });
  });
}

rateBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://chromewebstore.google.com/detail/dark-mode-for-chrome' });
});

init();
