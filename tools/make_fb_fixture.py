#!/usr/bin/env python3
"""Build a self-checking test page for the Facebook feed logic.

Facebook sits behind a login wall, so the shelf-hiding heuristic in
content.js cannot be verified against the live site. This wraps a captured
copy of the real Reels card (tools/fixtures/reels-card.html) in a realistic
feed and asserts that the card is hidden while every neighbouring post
survives.

    python3 tools/make_fb_fixture.py && open tools/fixtures/feed-test.html

The page prints PASS/FAIL per assertion. content.js is used verbatim except
for three seams: the site matcher and URL guard read injected values instead
of the real location, and the block-page redirect is captured rather than
followed.
"""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = os.path.join(ROOT, "tools", "fixtures")

ASSERTIONS = {
    "nav-reels": True,          # the left-nav Reels entry
    "REELS-CARD-ROOT": True,    # the whole in-feed Reels card
    "nav-home": False,
    "nav-market": False,
    "post-before": False,
    "post-after": False,
    "post-one-reel": False,     # a real post that links a single Reel
    "pymk": False,
}


def main():
    source = open(os.path.join(ROOT, "content.js")).read()
    seamed = (
        source.replace("location.hostname", "window.__host")
        .replace("location.pathname", "window.__path")
        .replace("location.replace(chrome.runtime.getURL", "window.__nav=(chrome.runtime.getURL")
    )
    assert "window.__host" in seamed and "location.hostname" not in seamed, "seam failed"

    card = open(os.path.join(FIXTURES, "reels-card.html")).read()
    opens, closes = card.count("<div"), card.count("</div>")
    assert opens == closes, "reels-card.html is unbalanced (%d open, %d close)" % (opens, closes)

    page = TEMPLATE.format(card=card, source=seamed, expect=repr(ASSERTIONS).replace("True", "true").replace("False", "false").replace("'", '"'))
    out = os.path.join(FIXTURES, "feed-test.html")
    open(out, "w").write(page)
    print("wrote %s" % os.path.relpath(out, ROOT))


TEMPLATE = """<!doctype html><meta charset="utf-8"><title>Facebook feed test</title>
<style>
 body{{font:14px system-ui;margin:20px}}
 [data-sfk-on="1"] [data-sfk-hide="1"]{{display:none!important}}
 #report{{position:fixed;top:0;right:0;background:#111;color:#eee;padding:12px 16px;
  font:12px ui-monospace,monospace;max-height:100vh;overflow:auto;z-index:99999}}
 .pass{{color:#4ade80}} .fail{{color:#f87171}}
</style>
<pre id="report">running…</pre>
<script>
window.__errs=[];
window.addEventListener('error',e=>window.__errs.push(String(e.message)));
window.__host='www.facebook.com'; window.__path='/';
window.chrome={{runtime:{{getURL:(p)=>'chrome-extension://x/'+p}},
 storage:{{local:{{get:(d,cb)=>cb({{enabled:true}})}},onChanged:{{addListener(){{}}}}}}}};
</script>

<div role="navigation">
  <div role="listitem" id="nav-home"><a href="/">Home</a></div>
  <div role="listitem" id="nav-reels"><a href="/reel/?s=ifu">Reels</a></div>
  <div role="listitem" id="nav-market"><a href="/marketplace/">Marketplace</a></div>
</div>

<div role="main"><div role="feed">
  <div role="article" id="post-before">
    <a href="/stealthhealthcookbook">STEALTHHEALTHCOOKBOOK.COM</a>
    <a href="/posts/12345">A Full Freezer. No Free Time Lost.</a>
    <a href="/photo/?fbid=1">photo</a>
  </div>
{card}
  <div role="article" id="post-after">
    <a href="/friend">Friend</a><a href="/posts/999">nice</a><a href="/photo/?fbid=2">pic</a>
  </div>
  <div role="article" id="post-one-reel">
    <a href="/friend2">Friend2</a><a href="/posts/777">check this reel out</a>
    <a href="/reel/555555">single Reel inside a real post</a>
  </div>
  <div id="pymk">
    <h3>People you may know</h3>
    <a href="/profile.php?id=1">a</a><a href="/profile.php?id=2">b</a>
  </div>
</div></div>

<script>
{source}
</script>

<script>
setTimeout(() => {{
  const expect = {expect};
  const hidden = id => {{
    const el = document.getElementById(id);
    if (!el) return 'MISSING';
    return el.hasAttribute('data-sfk-hide') || !!el.closest('[data-sfk-hide="1"]');
  }};
  const lines = [];
  let failures = 0;
  for (const [id, want] of Object.entries(expect)) {{
    const got = hidden(id);
    const ok = got === want;
    if (!ok) failures++;
    lines.push((ok ? 'pass  ' : 'FAIL  ') + id.padEnd(18) + 'hidden=' + got + ' (want ' + want + ')');
  }}
  const feed = document.querySelector('[role="feed"]').hasAttribute('data-sfk-hide');
  const main = document.querySelector('[role="main"]').hasAttribute('data-sfk-hide');
  if (feed || main) {{ failures++; lines.push('FAIL  feed/main was hidden'); }}
  else lines.push('pass  feed and main untouched');
  const orphan = [...document.querySelectorAll('h3')]
    .filter(h => h.textContent.trim() === 'Reels' && !h.closest('[data-sfk-hide="1"]')).length;
  if (orphan) {{ failures++; lines.push('FAIL  orphan "Reels" heading left behind'); }}
  else lines.push('pass  no orphan heading');
  if (window.__errs.length) {{ failures++; lines.push('FAIL  script errors: ' + window.__errs.join('; ')); }}
  const el = document.getElementById('report');
  el.className = failures ? 'fail' : 'pass';
  el.textContent = (failures ? failures + ' FAILURE(S)' : 'ALL PASS') + '\\n\\n' + lines.join('\\n');
}}, 800);
</script>
"""

if __name__ == "__main__":
    main()
