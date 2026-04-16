/*
 * Dark Mode for Chrome — background.js (MV3 Service Worker)
 * Handles tab lifecycle, programmatic CSS injection fallback,
 * message relay, and alarm scheduling.
 * NOTE: Service workers are ephemeral in MV3. Never store state in
 * global variables — always read from chrome.storage.
 */

'use strict';

const CONTENT_JS_FILE   = 'content.js';

// ─── Inject into a tab programmatically (fallback for already-open tabs) ───

async function injectIntoTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [CONTENT_JS_FILE],
    });
  } catch (_) {
    // Restricted tab (chrome://, PDF, etc.) — silently skip.
  }
}

// ─── Push state to all open tabs ───

async function broadcastToAllTabs(state) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'DMFC_APPLY', state });
    } catch (_) {
      await injectIntoTab(tab.id);
    }
  }
}

async function getEffectiveDarkEnabled() {
  const data = await chrome.storage.sync.get([
    'darkEnabled',
    'scheduleEnabled',
    'onHour',
    'offHour',
  ]);

  if (!data.scheduleEnabled) {
    return data.darkEnabled !== false;
  }

  return isWithinScheduledWindow(data.onHour ?? 20, data.offHour ?? 7);
}

function isWithinScheduledWindow(onHour, offHour, now = new Date()) {
  const currentHour = now.getHours();
  if (onHour === offHour) return true;
  if (onHour < offHour) {
    return currentHour >= onHour && currentHour < offHour;
  }
  return currentHour >= onHour || currentHour < offHour;
}

async function syncDarkModeWithSchedule() {
  const effectiveEnabled = await getEffectiveDarkEnabled();
  const state = await chrome.storage.sync.get(['darkEnabled', 'whitelist']);

  if (state.darkEnabled !== effectiveEnabled) {
    await chrome.storage.sync.set({ darkEnabled: effectiveEnabled });
    state.darkEnabled = effectiveEnabled;
  }

  await broadcastToAllTabs(state);
}

// ─── Tab lifecycle: inject into new/updated tabs ───

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  const darkEnabled = await getEffectiveDarkEnabled();
  if (!darkEnabled) return;
  await injectIntoTab(tabId);
});

// ─── Message handling from popup.js ───

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === 'DMFC_TOGGLE') {
    chrome.storage.sync.set({ darkEnabled: msg.enabled }, async () => {
      const state = await chrome.storage.sync.get(['darkEnabled', 'whitelist']);
      await broadcastToAllTabs(state);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'DMFC_WHITELIST_TOGGLE') {
    chrome.storage.sync.get(['whitelist'], async (data) => {
      const list = data.whitelist || [];
      const hostname = msg.hostname;
      const idx = list.indexOf(hostname);
      if (idx === -1) { list.push(hostname); } else { list.splice(idx, 1); }
      await chrome.storage.sync.set({ whitelist: list });
      const state = await chrome.storage.sync.get(['darkEnabled', 'whitelist']);
      await broadcastToAllTabs(state);
      sendResponse({ whitelisted: idx === -1 });
    });
    return true;
  }

});

// ─── Alarm: auto dark mode scheduling ───

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const enabled = alarm.name === 'dmfc-auto-on';
  if (alarm.name !== 'dmfc-auto-on' && alarm.name !== 'dmfc-auto-off') return;
  await chrome.storage.sync.set({ darkEnabled: enabled });
  const state = await chrome.storage.sync.get(['darkEnabled', 'whitelist']);
  await broadcastToAllTabs(state);
});

// ─── Schedule alarms based on stored settings ───

async function scheduleAlarms() {
  const data = await chrome.storage.sync.get(['scheduleEnabled', 'onHour', 'offHour']);
  await chrome.alarms.clearAll();
  if (!data.scheduleEnabled) return;
  const onHour  = data.onHour  ?? 20;
  const offHour = data.offHour ?? 7;
  chrome.alarms.create('dmfc-auto-on',  { when: nextAlarmTime(onHour),  periodInMinutes: 1440 });
  chrome.alarms.create('dmfc-auto-off', { when: nextAlarmTime(offHour), periodInMinutes: 1440 });
}

function nextAlarmTime(hour) {
  const now = new Date();
  const t   = new Date();
  t.setHours(hour, 0, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t.getTime();
}

chrome.storage.onChanged.addListener((changes) => {
  if ('scheduleEnabled' in changes || 'onHour' in changes || 'offHour' in changes) {
    scheduleAlarms();
    syncDarkModeWithSchedule();
  }
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarms();
  syncDarkModeWithSchedule();
});

chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarms();
  syncDarkModeWithSchedule();
});

scheduleAlarms();
syncDarkModeWithSchedule();
