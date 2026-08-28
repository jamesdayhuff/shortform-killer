# Privacy Policy — Shortform Killer

**Last updated:** 28 August 2026

Shortform Killer is a Chrome extension that hides YouTube Shorts and Facebook
Reels and redirects their URLs to a block page.

## The short version

Shortform Killer does not collect, store, transmit, or sell any personal data.
There is no server, no analytics, no tracking, and no network request of any
kind made by the extension.

## What the extension stores

The extension stores exactly one value on your own device, via Chrome's
`storage.local` API:

| Name      | Type    | Purpose                                     |
| --------- | ------- | ------------------------------------------- |
| `enabled` | boolean | Whether blocking is currently switched on.  |

This is the state of the on/off toggle in the extension popup. It never leaves
your computer. Removing the extension removes it.

## What the extension does not do

- It does not collect personally identifiable information (name, address,
  email address, age, or identification number).
- It does not collect health, financial, authentication, or location
  information.
- It does not read, record, or transmit your browsing history, the pages you
  visit, or their contents.
- It does not read or transmit form input, keystrokes, or clipboard contents.
- It does not use cookies, fingerprinting, or any advertising or analytics SDK.
- It does not contain remote code. All JavaScript and CSS is bundled in the
  published package.
- It does not sell or transfer data to third parties, because it holds no data
  to sell or transfer.

## Permissions, and why each is needed

**`storage`** — to remember the single on/off boolean described above, so the
setting survives a browser restart.

**`declarativeNetRequest`** — to redirect navigations to `youtube.com/shorts`,
`facebook.com/reel/`, and `facebook.com/reels/` to a block page included in the
extension. The rules are static and ship in `rules.json`. This API lets Chrome
apply the rules itself; the extension never observes, reads, or logs your
network traffic.

**Host access to `youtube.com` and `facebook.com`** — to run a content script
on those two sites that hides Shorts and Reels elements from the page, and to
apply the redirect rules there. The content script only adds and removes CSS
classes on the page. It does not read page content or send anything anywhere.
No other websites are accessed.

## Children's privacy

The extension collects no data from anyone, including children under 13.

## Changes to this policy

Any change to this policy will be committed to this repository, and the
"Last updated" date above will change. The revision history is public at
https://github.com/jamesdayhuff/shortform-killer/commits/main/PRIVACY.md

## Contact

Questions about this policy: hello@bluejay.digital

Source code: https://github.com/jamesdayhuff/shortform-killer
