/* Extension pages run under a strict CSP — no inline handlers, so the page
 * is wired up here.
 *
 * The block page is shared by every site the extension covers, so it works
 * out where you came from and offers to send you back there rather than
 * always dumping you on YouTube.
 */

const SITES = {
  youtube: { name: 'YouTube', home: 'https://www.youtube.com/', format: 'Short' },
  facebook: { name: 'Facebook', home: 'https://www.facebook.com/', format: 'Reel' },
};

function originSite() {
  /* Both blocking layers pass ?from=, so this is the normal path. */
  const from = new URLSearchParams(location.search).get('from');
  if (from && Object.hasOwn(SITES, from)) return SITES[from];

  /* Fallback for a stale bookmark of this page, or a redirect that somehow
   * arrived without the parameter. */
  try {
    const host = new URL(document.referrer).hostname;
    for (const site of Object.values(SITES)) {
      if (host.endsWith(new URL(site.home).hostname.replace(/^www\./, ''))) return site;
    }
  } catch {
    /* no referrer, or not a parseable URL — fall through */
  }

  return SITES.youtube;
}

const site = originSite();

document.getElementById('format').textContent = site.format;
document.getElementById('dest').textContent = site.name;
document.title = 'Nope.';

document.getElementById('back').addEventListener('click', () => {
  /* Straight to the home page, where the nav entry is already hidden. */
  location.replace(site.home);
});
