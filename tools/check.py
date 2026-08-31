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


# Chrome reserves a leading underscore for its own use inside an unpacked
# extension. It creates _metadata itself and reads _locales; every other
# such name makes the whole extension fail to load with "Could not load
# manifest", naming a file that has nothing to do with the manifest.
RESERVED_OK = {"_metadata", "_locales"}

# Directories that are not part of the loaded extension.
SKIP_DIRS = {".git", "node_modules"}


def check_no_reserved_names():
    """Reject any path component starting with "_".

    A scratch file called _fbfixture.html once blocked the extension from
    loading at all. Chrome scans the whole directory, so a stray temp file
    anywhere under the root is fatal — keep scratch files outside the
    extension folder.
    """
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in list(dirnames) + filenames:
            if name.startswith("_") and name not in RESERVED_OK:
                where = os.path.join(rel(dirpath), name).lstrip("./")
                problems.append(
                    "%s starts with \"_\", which Chrome reserves — the extension "
                    "will refuse to load. Rename it or move it out of the "
                    "extension folder." % where
                )
        # Don't descend into the reserved directories. Chrome fills _metadata
        # with underscore-prefixed files of its own, and flagging those told
        # you to rename a file Chrome had just written itself.
        dirnames[:] = [d for d in dirnames if d not in RESERVED_OK]


def main():
    # 0. Nothing Chrome will reject outright.
    check_no_reserved_names()

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

    resources = manifest["declarative_net_request"]["rule_resources"]
    worker = None
    with open(os.path.join(ROOT, manifest["background"]["service_worker"])) as handle:
        worker = handle.read()

    # 2. Every DNR redirect target is web-accessible, or the redirect fails
    #    silently at runtime.
    exposed = set()
    for entry in manifest.get("web_accessible_resources", []):
        exposed.update(entry["resources"])

    for resource in resources:
        check_exists(resource["path"], "manifest declarative_net_request")
        if not os.path.exists(os.path.join(ROOT, resource["path"])):
            continue

        # One ruleset per site, switched on and off by id from the service
        # worker. An id the worker never names is a ruleset that can only
        # ever be on, so that site's toggle would half-work: the feed would
        # un-hide and the URLs would still be blocked.
        if resource["id"] not in worker:
            problems.append(
                '%s declares the ruleset "%s" but the service worker never '
                "names it — that site's toggle cannot disable its URL blocks"
                % (manifest["background"]["service_worker"], resource["id"])
            )

        with open(os.path.join(ROOT, resource["path"])) as handle:
            rules = json.load(handle)

        for rule in rules:
            target = rule["action"].get("redirect", {}).get("extensionPath")
            if target:
                # extensionPath may carry a query string (?from=youtube); the
                # file on disk and the web_accessible_resources entry are both
                # the bare path.
                page = target.lstrip("/").split("?", 1)[0].split("#", 1)[0]
                check_exists(page, "%s redirect" % resource["path"])
                if page not in exposed:
                    problems.append(
                        "%s is a redirect target but is not in "
                        "web_accessible_resources (the redirect will fail "
                        "silently)" % page
                    )

    # 3. Every sfk: event a "world": "MAIN" script names has a listener on
    #    the isolated-world side. A main-world script exists only to shout
    #    across the world boundary, and a typo in the event name leaves both
    #    halves present, valid, and completely inert — which is how a Reel
    #    opened by in-page navigation once played straight through.
    def world_js(main):
        paths = []
        for script in manifest["content_scripts"]:
            if (script.get("world") == "MAIN") is main:
                paths.extend(script.get("js", []))
        return [p for p in paths if os.path.exists(os.path.join(ROOT, p))]

    def read(path):
        with open(os.path.join(ROOT, path)) as handle:
            return handle.read()

    # Matched on the string literal rather than the dispatchEvent call, since
    # the name is usually held in a const by the time it is dispatched.
    isolated = "\n".join(read(p) for p in world_js(False))
    listened = set(re.findall(r"""addEventListener\(\s*['"](sfk:[^'"]+)""", isolated))
    for path in world_js(True):
        for event in sorted(set(re.findall(r"""['"](sfk:[^'"]+)['"]""", read(path)))):
            if event not in listened:
                problems.append(
                    '%s names the event "%s" but no isolated-world content '
                    "script listens for it — the bridge dispatches into "
                    "silence" % (path, event)
                )

    # 4. Each HTML page references its own stylesheet and script, and every
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
