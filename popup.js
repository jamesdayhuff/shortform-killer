/* Shortform Killer — popup.
 *
 * One row per site, each backed by its own chrome.storage.local boolean
 * keyed on the site id. The service worker watches the same keys and swaps
 * the matching declarativeNetRequest ruleset in and out.
 */

const SITES = {
  youtube: { on: 'Blocking Shorts', off: 'Paused — Shorts allowed' },
  facebook: { on: 'Blocking Reels', off: 'Paused — Reels allowed' },
};

const rows = Object.keys(SITES).map((id) => ({
  id,
  toggle: document.getElementById('toggle-' + id),
  state: document.getElementById('state-' + id),
}));

function render(row, enabled) {
  row.toggle.checked = enabled;
  row.state.textContent = enabled ? SITES[row.id].on : SITES[row.id].off;
}

const defaults = Object.fromEntries(rows.map((row) => [row.id, true]));

chrome.storage.local.get(defaults, (state) => {
  for (const row of rows) render(row, state[row.id]);
});

for (const row of rows) {
  row.toggle.addEventListener('change', () => {
    const enabled = row.toggle.checked;
    render(row, enabled);
    chrome.storage.local.set({ [row.id]: enabled });
  });
}
