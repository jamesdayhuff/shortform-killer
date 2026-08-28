/* Shortform Killer — service worker.
 *
 * Owns the persisted on/off state and keeps the declarativeNetRequest
 * ruleset in sync with it. Without this, switching the extension off would
 * un-hide Shorts in the feed but still block /shorts/ URLs.
 */

const RULESET_ID = 'shorts_block';

async function applyState(enabled) {
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    enabled
      ? { enableRulesetIds: [RULESET_ID] }
      : { disableRulesetIds: [RULESET_ID] }
  );

  await chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
}

async function syncFromStorage() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await applyState(enabled);
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get('enabled');
  if (stored.enabled === undefined) {
    await chrome.storage.local.set({ enabled: true });
  }
  await syncFromStorage();
});

/* Service workers get torn down and restarted; re-sync on every wake. */
chrome.runtime.onStartup.addListener(syncFromStorage);
syncFromStorage();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) {
    applyState(changes.enabled.newValue);
  }
});
