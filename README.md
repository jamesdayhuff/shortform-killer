# Shortform Killer

A Chrome extension that removes **YouTube Shorts** and **Facebook Reels** from
the surfaces you actually browse, and hard-blocks direct links to them with an
interstitial that tells you to go do five pushups instead.

No build step, no dependencies, no network calls, no analytics.

## Install

1. Clone or download this repo.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.

The toolbar icon opens a single on/off switch that covers both sites.
Toggling it takes effect immediately on any open tab — no reload needed. When
it's off the badge reads `OFF` and both sites behave normally.

## What it does

**YouTube** — hides Shorts from the home feed (both the carousel shelf and
individual tiles), from search results, from the left sidebar nav, and from
the channel Shorts tab. Because the tile rules key off the link target rather
than the page, the subscriptions feed and the watch-page sidebar get cleaned
up too. Any `/shorts/` URL is blocked.

**Facebook** — hides the **Reels** entry in the left nav, hides the Reels
carousel in the home feed, and blocks any `/reel/` or `/reels/` URL.

## How it works

Two independent layers, because both sites are single-page apps:

| Layer | Handles | Mechanism |
| --- | --- | --- |
| `declarativeNetRequest` (`rules.json`) | Hard navigations: pasted URLs, new tabs, external links, bookmarks | Redirects `main_frame` requests at the network layer. The site never loads at all. |
| Content script guard (`content.js`) | In-page navigation, which makes no document request and so never triggers the rule above | Watches YouTube's `yt-navigate-*` events and the patched `history.pushState` that Facebook routes through, then `location.replace()`s to the block page. |

Hiding is CSS-first. The stylesheets are injected at `document_start`, so
short-form content is never painted in the first place — there's no flash of
content that then disappears. Every rule is gated behind
`html[data-sfk-on="1"]`, which means the on/off switch is a single attribute
flip rather than a re-injection. Nothing is ever removed from the DOM, only
`display: none`d, so switching off restores the page exactly.

Detection is by URL and DOM markers only — never video duration — so a
legitimate 45-second long-form video is never caught by mistake.

### The block page knows where you came from

Both blocking layers pass a `?from=` parameter, so the shared interstitial
adapts: arrive from a Short and it reads *"watch just one **Short**?"* with a
**back to YouTube** button; arrive from a Reel and it reads ***Reel*** with a
**back to Facebook** button. An unrecognised or missing `from` falls back to
the referrer, then to YouTube, so the button is never dead.

### Finding the Reels carousel without a selector

Facebook ships generated class names and nests the carousel about seventeen
levels inside its feed card, so there is nothing stable to target. The card
is found structurally instead: start at the `[role="region"]` holding the
Reel links, then climb until the subtree stops being almost entirely Reels.
Hiding only the carousel would leave the "Reels" heading and an empty card,
so the climb is what makes the whole block go.

Every step is bounded. The climb stops at `[role="feed"]` / `[role="main"]`,
stops the moment an ancestor contains a `[role="article"]` (a real post), and
stops if fewer than 80% of the container's links are Reels. A card must hold
at least **3** Reels to be touched at all, so a post that merely links one
Reel is left alone. Every ambiguous case resolves to *leave it alone* —
hiding somebody's real post is a much worse failure than missing a shelf.

## Scope: what is deliberately not covered

- **Bare `facebook.com/reel`** (no trailing slash) is caught by the content
  script rather than the network rule. The network rules match `/reel/` and
  `/reels/` *with* the slash on purpose: `||facebook.com/reel` would also
  match a legitimate page like `facebook.com/reelbigfish`. The tradeoff is a
  brief flash on one rare URL instead of blocking real pages.

## Files

```
manifest.json        MV3 manifest
rules.json           declarativeNetRequest rules (the URL blocks)
hide.css             YouTube selectors, in one place
facebook.css         Facebook selectors, in one place
content.js           attribute toggle, SPA URL guard, observer safety net
background.js        service worker: state, ruleset enable/disable, badge
popup.html/.css/.js  the on/off switch
blocked.html/.css/.js  the interstitial
tools/make_icons.py  regenerates icons/ using only the Python stdlib
tools/check.py       pre-flight check: manifest, rules, page asset wiring
tools/make_fb_fixture.py  builds the Facebook feed regression test
tools/fixtures/      captured real Reels-card markup + generated test page
```

Run the pre-flight check before reloading the extension:

```
python3 tools/check.py
```

It verifies three things that each broke the extension once:

- **No filename anywhere starts with `_`.** Chrome reserves that prefix and
  refuses to load the *entire* extension if it finds one, reporting
  `Could not load manifest` while naming a file that has nothing to do with
  the manifest. A stray scratch file called `_fbfixture.html` caused exactly
  that. Chrome's own `_metadata` and `_locales` are allowed. **Keep scratch
  and temp files outside the extension folder.**
- **Assets are *referenced*, not merely present** — a missing `<script src>`
  shipped once, with the file sitting right there on disk.
- **Every redirect target is in `web_accessible_resources`** — an omission
  there makes the redirect fail silently, with no error anywhere.

## Maintenance note

The selectors target each site's internal markup. This is not a public API
and both sites change it without warning. If short-form content reappears on
one surface, the fix is a selector in `hide.css` or `facebook.css`.

**YouTube** — verified against the live site: 31 visible Shorts links went to
0 with all 39 regular video links untouched, and everything restored exactly
when toggled off. Two quirks worth knowing before editing:

- **The search Shorts shelf is `grid-shelf-view-model`**, not the older
  `ytd-reel-shelf-renderer` (which now matches nothing on search — it's kept
  only as a fallback for other surfaces). Hide the shelf itself and *not* its
  enclosing `ytd-item-section-renderer`: that section also contains all the
  ordinary search results, so hiding it blanks the entire page.
- **The expanded sidebar's Shorts entry has no `href`.** It's a `role="link"`
  with only a localized `title`, so it can't be matched by URL like the other
  nav items. It's caught two ways: `a[title="Shorts"]` for English, plus the
  Shorts glyph's SVG path data, which is language-independent.

**Facebook** — the URL blocking is verified (`/reel/<id>` serves a real page;
path matching was tested against 16 cases including the `reelbigfish`
false-positive). The feed and nav hiding is verified against **captured real
markup** rather than the live site, since Facebook is behind a login wall:

```
python3 tools/make_fb_fixture.py
open tools/fixtures/feed-test.html
```

That wraps the real Reels card in a realistic feed and asserts the card and
nav entry are hidden while every neighbouring post, the feed itself, and a
lone Reel link inside a genuine post all survive. Ten assertions, currently
all passing. If Facebook changes its markup, re-capture
`tools/fixtures/reels-card.html` from a real feed and re-run it.
