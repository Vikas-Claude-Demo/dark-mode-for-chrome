/*
 * Dark Mode for Chrome — newtab.js
 * Handles clock, search, and dark mode toggle on the custom new tab page.
 */

'use strict';

// ─── Clock ───

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clock').textContent = `${h}:${m}`;

  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  document.getElementById('dateLabel').textContent =
    `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
}

updateClock();
setInterval(updateClock, 10000); // update every 10s

// ─── Search ───

const searchForm  = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  let url;
  // Detect if the user typed a URL
  if (/^(https?:\/\/|www\.)/.test(query)) {
    url = query.startsWith('http') ? query : 'https://' + query;
  } else if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(query) && !query.includes(' ')) {
    url = 'https://' + query;
  } else {
    url = 'https://www.google.com/search?q=' + encodeURIComponent(query);
  }

  window.location.href = url;
});

// ─── Dark Mode Status Widget ───

const dmDot       = document.getElementById('dmDot');
const dmLabel     = document.getElementById('dmLabel');
const dmToggleBtn = document.getElementById('dmToggleBtn');

function renderDmStatus(state) {
  const enabled = state.darkEnabled !== false;
  dmDot.className = enabled ? 'dm-dot' : 'dm-dot off';
  dmLabel.textContent = enabled ? 'Dark Mode On' : 'Dark Mode Off';
}

chrome.storage.sync.get(['darkEnabled'], renderDmStatus);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && 'darkEnabled' in changes) {
    chrome.storage.sync.get(['darkEnabled'], renderDmStatus);
  }
});

dmToggleBtn.addEventListener('click', () => {
  chrome.storage.sync.get(['darkEnabled'], (state) => {
    const newVal = state.darkEnabled === false ? true : false;
    chrome.storage.sync.set({ darkEnabled: newVal });
  });
});
