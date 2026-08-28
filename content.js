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

  /* Declared up here, not next to the observer, because setEnabled() below
   * calls scheduleSweep() and that reads all three. Chrome's storage
   * callback happens to be async today, which hides the ordering, but a
   * synchronous call would hit the temporal dead zone and kill the script. */
  const sweep = site.id === 'youtube' ? sweepYouTube : sweepFacebook;
  let scheduled = false;
  const idle = (cb) =>
    window.requestIdleCallback ? window.requestIdleCallback(cb) : setTimeout(cb, 200);

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

  /* Facebook routes through the history API and fires no event of its own.
   * Patching history.pushState from in here would do nothing: this script
   * runs in an isolated world with its own copy of the JS globals, so the
   * page's call still reaches the untouched original. fb-history.js is
   * injected into the page's world instead and re-broadcasts the call as
   * this event, which does cross the world boundary. */
  window.addEventListener('sfk:navigate', guard);

  /* Safety net under all of the above: catch any URL change, however it
   * happened, on the next DOM mutation. Wired into the observer below. */
  let lastHref = location.href;

  function guardOnHrefChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    guard();
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

  /* A shelf has to hold at least this many Reels before it is touched. An
   * ordinary post that links one Reel has one; the carousel has a row. This
   * is the main guard against hiding somebody's actual post. */
  const SHELF_MIN_REELS = 3;

  /* Share of a container's links that must point at Reels for it still to
   * be the shelf rather than a chunk of surrounding feed. Not 1.0, so one
   * stray link in the card doesn't stop the climb. */
  const SHELF_MIN_RATIO = 0.8;

  const REEL_LINK = 'a[href*="/reel/"]';

  /* Boundaries the climb must never cross. Hitting any of these means we
   * are about to swallow the feed or a real post. */
  const CLIMB_STOP = '[role="feed"], [role="main"], [role="banner"], [role="complementary"]';

  /* Facebook ships generated class names, so there is no selector for the
   * card. Climb from the carousel to the card that wraps it, stopping the
   * moment the subtree stops being purely Reels. Hiding only the carousel
   * would leave the "Reels" heading and an empty card behind, so the climb
   * is what makes the whole block disappear.
   *
   * Note the [role="article"] stop is a descendant check: climbing *to* a
   * card that is itself an article is fine, climbing past it is not. */
  function cardFor(start) {
    let best = start;
    let node = start;

    /* Generous bound: the real boundary should be one of the hard stops
     * below, not this counter. Facebook nests the carousel roughly 17
     * levels inside its feed card, so a tight cap silently stops the climb
     * part-way and leaves the empty card behind. */
    for (let i = 0; i < 30; i++) {
      node = node.parentElement;
      if (!node || node === document.body) break;
      if (node.matches(CLIMB_STOP)) break;
      if (node.querySelector('[role="feed"]')) break;
      if (node.querySelector('[role="article"]')) break; // reached a real post

      const reels = node.querySelectorAll(REEL_LINK).length;
      const total = node.querySelectorAll('a[href]').length;
      if (total && reels / total < SHELF_MIN_RATIO) break;

      best = node;
    }

    return best;
  }

  function sweepFacebook() {
    /* Facebook's markup is obfuscated generated class names with no stable
     * hooks, so everything here is found by link target, ARIA role and
     * structure — never by class name or visible text. */

    /* 1. The Reels entry in the left nav. */
    for (const nav of document.querySelectorAll('[role="navigation"]')) {
      for (const link of nav.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"]')) {
        const row = link.closest('[role="listitem"]') || link;
        if (!row.hasAttribute('data-sfk-hide')) row.setAttribute('data-sfk-hide', '1');
      }
    }

    /* 2. The Reels carousel in the home feed. Facebook marks it up as a
     * region; we identify it by the Reel links it holds rather than by its
     * aria-label, which is localized. */
    const shelves = new Set();

    for (const region of document.querySelectorAll('[role="region"]')) {
      if (region.querySelectorAll(REEL_LINK).length >= SHELF_MIN_REELS) shelves.add(region);
    }

    /* Fallback for a layout with no region wrapper: climb just far enough
     * from a Reel link to gather the row. */
    if (!shelves.size) {
      for (const link of document.querySelectorAll(REEL_LINK)) {
        if (link.closest('[role="navigation"]')) continue;
        let node = link;
        for (let i = 0; i < 10 && node.parentElement; i++) {
          node = node.parentElement;
          if (node.querySelectorAll(REEL_LINK).length >= SHELF_MIN_REELS) {
            shelves.add(node);
            break;
          }
        }
      }
    }

    for (const shelf of shelves) {
      if (shelf.closest('[role="navigation"]')) continue;
      if (shelf.closest('[data-sfk-hide="1"]')) continue;
      cardFor(shelf).setAttribute('data-sfk-hide', '1');
    }
  }

  function scheduleSweep() {
    if (scheduled || !enabled) return;
    scheduled = true;
    idle(() => {
      scheduled = false;
      if (enabled) sweep();
    });
  }

  function observe() {
    /* The href check runs inline rather than through scheduleSweep's idle
     * callback — it is one string compare, and it has to beat the Reel to
     * the screen. */
    const onMutation = () => {
      guardOnHrefChange();
      scheduleSweep();
    };

    new MutationObserver(onMutation).observe(document.body, {
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
