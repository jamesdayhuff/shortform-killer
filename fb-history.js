/* Shortform Killer — page-world navigation bridge.
 *
 * Injected into the page's own JS world (manifest "world": "MAIN"), which is
 * the whole point of the file: content.js runs in an isolated world holding
 * its own copy of the JS globals, so a history.pushState patch applied there
 * never runs for the page's own call. Facebook routes into /reel/ with
 * pushState and no network request, so neither that patch nor the
 * declarativeNetRequest rule fired and the Reel played through.
 *
 * The only job here is to re-broadcast those calls as a DOM event — events
 * do cross the world boundary — and to otherwise leave history behaving
 * exactly as it did before. content.js listens for SFK_NAVIGATE.
 */

(() => {
  const EVENT = 'sfk:navigate';
  const FLAG = '__sfkNavigationBridge';

  /* Chrome can inject a document_start script more than once per document
   * (bfcache restores, re-injection on update); patching the patch would
   * stack a second wrapper on every call. */
  if (window[FLAG]) return;
  window[FLAG] = true;

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    if (typeof original !== 'function') continue;

    history[method] = function (...args) {
      const result = original.apply(this, args);
      /* Dispatch after the call, so location already reflects the new URL by
       * the time the guard reads it. Wrapped because from the site router's
       * point of view this call must behave exactly like the original one. */
      try {
        window.dispatchEvent(new Event(EVENT));
      } catch (err) {
        /* nothing we can do here, and the site must not see it */
      }
      return result;
    };
  }
})();
