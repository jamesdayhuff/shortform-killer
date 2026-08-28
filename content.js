/* Shortform Killer — content script.
 *
 * Runs at document_start on YouTube and Facebook so the site's stylesheet
 * is already applied before either app paints. Two jobs:
 *   1. own the html[data-sfk-on] attribute that gates every hiding rule
 *   2. catch in-page (SPA) navigation into a short-form feed, which never
 *      hits the network and so never triggers the declarativeNetRequest
 *      rule
 */

const ON_ATTR = 'data-sfk-on';
const root = document.documentElement;

/* Per-site config. `id` is passed to the block page as ?from=, which is how
 * it knows which site to offer to send you back to. */
const SITES = [
  {
    id: 'youtube',
    host: /(^|\.)youtube\.com$/i,
    isBlockedPath: (p) => p === '/shorts' || p.startsWith('/shorts/'),
  },
  {
    id: 'facebook',
    host: /(^|\.)facebook\.com$/i,
    isBlockedPath: (p) => /^\/reels?(\/|$)/i.test(p),
  },
];

const site = SITES.find((s) => s.host.test(location.hostname));
if (site) start();

function start() {
  /* Assume enabled until storage says otherwise. The storage read is async,
   * and a brief flash of *missing* short-form is a far better failure than
   * a flash of visible short-form. */
  root.setAttribute(ON_ATTR, '1');

  let enabled = true;

  function setEnabled(next) {
    enabled = next;
    if (next) {
      root.setAttribute(ON_ATTR, '1');
      guard();
      scheduleSweep();
    } else {
      root.removeAttribute(ON_ATTR);
    }
  }

  chrome.storage.local.get({ enabled: true }, (state) => setEnabled(state.enabled));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) setEnabled(changes.enabled.newValue);
  });

  /* --- SPA navigation guard ------------------------------------------ */

  function guard() {
    if (!enabled || !site.isBlockedPath(location.pathname)) return;
    /* replace() rather than assign() — we don't want the blocked feed
     * sitting in history where the back button walks straight into it. */
    location.replace(chrome.runtime.getURL('blocked.html?from=' + site.id));
  }

  guard();

  /* YouTube's own SPA navigation events. Harmless no-ops on Facebook. */
  window.addEventListener('yt-navigate-start', guard, true);
  window.addEventListener('yt-navigate-finish', guard, true);
  window.addEventListener('popstate', guard);

  /* Facebook routes through the history API with no custom event, so the
   * patch below is what catches it there. */
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      guard();
      return result;
    };
  }

  /* --- Observer safety net -------------------------------------------- */
  /* Only for what the stylesheets can't express. Everything else is
   * handled declaratively in hide.css / facebook.css. */

  function sweepYouTube() {
    /* The "Shorts" filter chip above the home feed, which has to be
     * matched on its visible text. */
    for (const chip of document.querySelectorAll('yt-chip-cloud-chip-renderer')) {
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
      const isShorts = section.querySelector(
        '[is-shorts], ytm-shorts-lockup-view-model, a[href^="/shorts/"]'
      );
      if (!isShorts) continue;
      if (section.querySelector('a[href^="/watch"]')) continue; // mixed shelf, leave it
      section.setAttribute('data-sfk-hide', '1');
    }
  }

  function sweepFacebook() {
    /* Facebook's markup is obfuscated generated class names with no stable
     * hooks, so the nav entry is found by its link target and then hidden
     * at whatever the nearest row-like ancestor turns out to be. Scoped to
     * [role="navigation"] so Reels appearing in the feed are left alone —
     * clicking one of those is caught by the URL guard instead. */
    for (const nav of document.querySelectorAll('[role="navigation"]')) {
      for (const link of nav.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"]')) {
        const row = link.closest('[role="listitem"]') || link;
        if (!row.hasAttribute('data-sfk-hide')) row.setAttribute('data-sfk-hide', '1');
      }
    }
  }

  const sweep = site.id === 'youtube' ? sweepYouTube : sweepFacebook;

  let scheduled = false;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));

  function scheduleSweep() {
    if (scheduled || !enabled) return;
    scheduled = true;
    idle(() => {
      scheduled = false;
      if (enabled) sweep();
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
}
