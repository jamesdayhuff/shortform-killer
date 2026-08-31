/* Shortform Killer — service worker.
 *
 * Owns the persisted per-site on/off state and keeps each site's
 * declarativeNetRequest ruleset in sync with it. Without this, switching a
 * site off would un-hide its short-form in the feed but still block its
 * URLs.
 *
 * State lives in chrome.storage.local under one boolean per site id
 * ("youtube", "facebook"). Every other script reads the same keys.
 */

const SITES = [
  { id: 'youtube', ruleset: 'youtube_rules', name: 'YouTube', abbr: 'YT' },
  { id: 'facebook', ruleset: 'facebook_rules', name: 'Facebook', abbr: 'FB' },
];

const IDS = SITES.map((s) => s.id);
const DEFAULTS = Object.fromEntries(IDS.map((id) => [id, true]));

async function applyState(state) {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: SITES.filter((s) => state[s.id]).map((s) => s.ruleset),
    disableRulesetIds: SITES.filter((s) => !state[s.id]).map((s) => s.ruleset),
  });

  /* Badge carries the state that isn't the default: nothing when every site
   * is covered, OFF when none is, and the abbreviation of the one site
   * still being blocked in between. The title spells it out, because two
   * letters on their own don't say which way round it is. */
  const on = SITES.filter((s) => state[s.id]);
  let badge = '';
  let title = 'Shortform Killer — blocking ' + SITES.map((s) => s.name).join(' + ');

  if (!on.length) {
    badge = 'OFF';
    title = 'Shortform Killer — paused everywhere';
  } else if (on.length < SITES.length) {
    badge = on[0].abbr;
    title = 'Shortform Killer — blocking ' + on[0].name + ' only';
  }

  await chrome.action.setBadgeText({ text: badge });
  await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
  await chrome.action.setTitle({ title });
}

async function syncFromStorage() {
  await applyState(await chrome.storage.local.get(DEFAULTS));
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['enabled', ...IDS]);

  /* Up to 1.1 a single "enabled" key covered every site. Carry whatever it
   * held onto both new keys, so somebody who had the extension paused
   * doesn't get it switched back on by the update. */
  const legacy = stored.enabled;
  const seed = {};
  for (const id of IDS) {
    if (stored[id] === undefined) seed[id] = legacy === undefined ? true : legacy;
  }

  if (Object.keys(seed).length) await chrome.storage.local.set(seed);
  if (legacy !== undefined) await chrome.storage.local.remove('enabled');

  await syncFromStorage();
});

/* Service workers get torn down and restarted; re-sync on every wake. */
chrome.runtime.onStartup.addListener(syncFromStorage);
syncFromStorage();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && IDS.some((id) => id in changes)) syncFromStorage();
});
