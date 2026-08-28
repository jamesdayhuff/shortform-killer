/* Shortform Killer — content script.
 *
 * Runs at document_start so the CSS in hide.css is already applied before
 * YouTube paints anything. Two jobs:
 *   1. own the html[data-sfk-on] attribute that gates every hiding rule
 *   2. catch in-page (SPA) navigation to /shorts, which never hits the
 *      network and so never triggers the declarativeNetRequest rule
 */

const ON_ATTR = 'data-sfk-on';
const root = document.documentElement;

/* Assume enabled until storage says otherwise. The storage read is async,
 * and a brief flash of *missing* Shorts is a far better failure than a
 * flash of visible ones. */
root.setAttribute(ON_ATTR, '1');

let enabled = true;

function setEnabled(next) {
  enabled = next;
  if (next) {
    root.setAttribute(ON_ATTR, '1');
    guard();
  } else {
    root.removeAttribute(ON_ATTR);
  }
}

chrome.storage.local.get({ enabled: true }, (state) => {
  setEnabled(state.enabled);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) setEnabled(changes.enabled.newValue);
});

/* --- SPA navigation guard -------------------------------------------- */

function isShortsPath() {
  return location.pathname === '/shorts' || location.pathname.startsWith('/shorts/');
}

function guard() {
  if (!enabled || !isShortsPath()) return;
  /* replace() rather than assign() — we don't want the Short sitting in
   * history where the back button walks straight into it again. */
  location.replace(chrome.runtime.getURL('blocked.html'));
}

guard();

/* YouTube's own SPA navigation events. */
window.addEventListener('yt-navigate-start', guard, true);
window.addEventListener('yt-navigate-finish', guard, true);
window.addEventListener('popstate', guard);

/* Fallback for navigations that don't emit the yt-* events. */
for (const method of ['pushState', 'replaceState']) {
  const original = history[method];
  history[method] = function (...args) {
    const result = original.apply(this, args);
    guard();
    return result;
  };
}

/* --- Observer safety net --------------------------------------------- */
/* Only for the two things the CSS can't express: chips matched by their
 * visible text, and shelf wrappers left empty once their contents are
 * hidden. Everything else is handled declaratively in hide.css. */

const CHIP_SELECTOR = 'yt-chip-cloud-chip-renderer, ytd-feed-filter-chip-bar-renderer yt-chip-cloud-chip-renderer';

function sweep() {
  if (!enabled) return;

  /* The "Shorts" filter chip above the home feed. */
  for (const chip of document.querySelectorAll(CHIP_SELECTOR)) {
    if (chip.hasAttribute('data-sfk-hide')) continue;
    if (chip.textContent.trim().toLowerCase() === 'shorts') {
      chip.setAttribute('data-sfk-hide', '1');
    }
  }

  /* A shelf wrapper left at zero height once its Shorts are hidden would
   * otherwise leave a gap in the grid. Require a positive Shorts marker
   * before hiding — a section that is merely still loading is also zero
   * height, and marking that one would hide real content permanently. */
  for (const section of document.querySelectorAll('ytd-rich-section-renderer')) {
    if (section.hasAttribute('data-sfk-hide')) continue;
    const isShorts =
      section.querySelector('[is-shorts], ytm-shorts-lockup-view-model, a[href^="/shorts/"]') !== null;
    if (!isShorts) continue;
    if (section.querySelector('a[href^="/watch"]')) continue; // mixed shelf, leave it
    section.setAttribute('data-sfk-hide', '1');
  }
}

let scheduled = false;
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));

function scheduleSweep() {
  if (scheduled || !enabled) return;
  scheduled = true;
  idle(() => {
    scheduled = false;
    sweep();
  });
}

function observe() {
  new MutationObserver(scheduleSweep).observe(document.body, {
    childList: true,
    subtree: true,
  });
  sweep();
}

if (document.body) {
  observe();
} else {
  document.addEventListener('DOMContentLoaded', observe, { once: true });
}
