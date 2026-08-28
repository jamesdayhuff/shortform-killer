# Shortform Killer

A Chrome extension that removes YouTube Shorts from the surfaces you actually
browse, and hard-blocks direct `/shorts/` links with an interstitial that tells
you to go do five pushups instead.

No build step, no dependencies, no network calls, no analytics.

## Install

1. Clone or download this repo.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.

The toolbar icon opens a single on/off switch. Toggling it takes effect
immediately on any open YouTube tab — no reload needed. When it's off the
badge reads `OFF` and YouTube behaves normally.

## What it does

**Hides Shorts** from the home feed (both the carousel shelf and individual
tiles), from search results, from the left sidebar nav, and from the channel
Shorts tab. Because the tile rules key off the link target rather than the
page, the subscriptions feed and the watch-page sidebar get cleaned up too.

**Blocks `/shorts/` URLs** — pasted, bookmarked, or clicked in from another
app — and redirects to a block page. There is no skip button.

## How it works

Two independent layers, because YouTube is a single-page app:

| Layer | Handles | Mechanism |
| --- | --- | --- |
| `declarativeNetRequest` (`rules.json`) | Hard navigations: pasted URLs, new tabs, external links, bookmarks | Redirects `main_frame` requests for `/shorts` to the block page at the network layer. YouTube never loads at all. |
| Content script guard (`content.js`) | In-page navigation, which makes no document request and so never triggers the rule above | Watches YouTube's `yt-navigate-*` events plus patched `history.pushState`, then `location.replace()`s to the block page. |

Hiding is CSS-first. `hide.css` is injected at `document_start`, so Shorts are
never painted in the first place — there's no flash of content that then
disappears. Every rule is gated behind `html[data-sfk-on="1"]`, which means
the on/off switch is a single attribute flip rather than a re-injection.
Nothing is ever removed from the DOM, only `display: none`d, so switching off
restores the page exactly.

A small `MutationObserver` handles only the two cases CSS can't express: the
"Shorts" filter chip, which has to be matched by its visible text, and grid
sections left empty after their contents are hidden.

Detection is by URL and DOM markers only — never video duration — so a
legitimate 45-second long-form video is never caught by mistake.

## Files

```
manifest.json        MV3 manifest
rules.json           declarativeNetRequest ruleset (the /shorts redirect)
hide.css             every hiding selector, in one place
content.js           attribute toggle, SPA URL guard, observer safety net
background.js        service worker: state, ruleset enable/disable, badge
popup.html/.css/.js  the on/off switch
blocked.html/.css/.js  the interstitial
tools/make_icons.py  regenerates icons/ using only the Python stdlib
```

## Maintenance note

The selectors in `hide.css` target YouTube's internal custom elements
(`grid-shelf-view-model`, `ytm-shorts-lockup-view-model`, and friends). These
are not a public API and YouTube changes them without warning. If Shorts
reappear on one surface after a YouTube update, the fix is a selector in that
one file — this is inherent to every extension in this category.

Two quirks found while verifying against live YouTube, worth knowing before
you edit anything:

- **The search Shorts shelf is `grid-shelf-view-model`**, not the older
  `ytd-reel-shelf-renderer` (which now matches nothing on search — it's kept
  only as a fallback for other surfaces). Hide the shelf itself and *not* its
  enclosing `ytd-item-section-renderer`: that section also contains all the
  ordinary search results, so hiding it blanks the entire page.
- **The expanded sidebar's Shorts entry has no `href`.** It's a `role="link"`
  with only a localized `title`, so it can't be matched by URL like the other
  nav items. It's caught two ways: `a[title="Shorts"]` for English, plus the
  Shorts glyph's SVG path data, which is language-independent.

Verified on live YouTube search: 31 visible Shorts links → 0, with all 39
regular video links untouched, and everything restored exactly when toggled
back off.

## License

MIT
