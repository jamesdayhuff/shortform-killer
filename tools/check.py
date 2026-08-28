#!/usr/bin/env python3
"""Pre-flight checks for the unpacked extension.

Exists because a missing <script src> tag in blocked.html shipped once: the
file was present and the manifest was valid, so an existence-only check
passed while the button it wired up did nothing. Verifying that assets are
*referenced*, not merely present, is the point of this script.

    python3 tools/check.py
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
problems = []


def rel(path):
    return os.path.relpath(path, ROOT)


def check_exists(path, why):
    if not os.path.exists(os.path.join(ROOT, path)):
        problems.append("%s is referenced by %s but does not exist" % (path, why))


def main():
    # 1. Manifest parses and everything it points at exists.
    with open(os.path.join(ROOT, "manifest.json")) as handle:
        manifest = json.load(handle)

    for size, path in manifest["icons"].items():
        check_exists(path, "manifest icons[%s]" % size)
    check_exists(manifest["background"]["service_worker"], "manifest background")
    check_exists(manifest["action"]["default_popup"], "manifest action.default_popup")
    for script in manifest["content_scripts"]:
        for path in script.get("js", []) + script.get("css", []):
            check_exists(path, "manifest content_scripts")

    ruleset = manifest["declarative_net_request"]["rule_resources"][0]["path"]
    check_exists(ruleset, "manifest declarative_net_request")
    with open(os.path.join(ROOT, ruleset)) as handle:
        rules = json.load(handle)

    # 2. Every DNR redirect target is web-accessible, or the redirect fails
    #    silently at runtime.
    exposed = set()
    for entry in manifest.get("web_accessible_resources", []):
        exposed.update(entry["resources"])
    for rule in rules:
        target = rule["action"].get("redirect", {}).get("extensionPath")
        if target:
            # extensionPath may carry a query string (?from=youtube); the
            # file on disk and the web_accessible_resources entry are both
            # the bare path.
            page = target.lstrip("/").split("?", 1)[0].split("#", 1)[0]
            check_exists(page, "rules.json redirect")
            if page not in exposed:
                problems.append(
                    "%s is a redirect target but is not in web_accessible_resources "
                    "(the redirect will fail silently)" % page
                )

    # 3. Each HTML page references its own stylesheet and script, and every
    #    referenced local asset exists. This is the check that would have
    #    caught the missing <script src="blocked.js">.
    for name in sorted(os.listdir(ROOT)):
        if not name.endswith(".html"):
            continue
        with open(os.path.join(ROOT, name)) as handle:
            html = handle.read()

        refs = re.findall(r'(?:src|href)="([^"]+)"', html)
        local = [r for r in refs if not r.startswith(("http:", "https:", "#", "data:"))]
        for ref in local:
            check_exists(ref, name)

        stem = name[: -len(".html")]
        for ext in ("css", "js"):
            sibling = "%s.%s" % (stem, ext)
            if os.path.exists(os.path.join(ROOT, sibling)) and sibling not in local:
                problems.append(
                    "%s exists but %s never references it — it will not load"
                    % (sibling, name)
                )

    if problems:
        print("FAIL (%d)" % len(problems))
        for p in problems:
            print("  - %s" % p)
        return 1

    print("OK — manifest, rules, and all page assets check out")
    return 0


if __name__ == "__main__":
    sys.exit(main())
