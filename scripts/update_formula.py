#!/usr/bin/env python3
"""Rewrite the formula to point at a published release.

The version and the four checksums are written from one source in one pass, so
they cannot end up describing different releases -- which is what happened when
they were maintained by hand and left the formula uninstallable.

Every substitution must find its target. If the formula's shape changes in a
way this script does not recognise, it exits non-zero rather than writing a
half-updated file.

Usage: update_formula.py <tag> [path/to/linelord.rb]
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

REPO = "MarkusAugust/linelord"

# Matches an `url ".../v#{version}/<asset>"` line together with the `sha256`
# line that belongs to it, capturing the asset name and the hash's position.
URL_SHA = re.compile(
    r'(url ".*/v#\{version\}/(?P<asset>[^"]+)"\s*\n\s*sha256 ")'
    r'(?P<sha>[0-9a-f]{64})(")'
)


def platform_assets(digests):
    """The published assets a formula is expected to offer.

    checksums.txt is published alongside the binaries and is not a download
    the formula installs, so it is the one name excluded.
    """
    return {name for name in digests if name != "checksums.txt"}


def release_digests(tag):
    request = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/releases/tags/{tag}",
        headers={"Accept": "application/vnd.github+json"},
    )
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        request.add_header("Authorization", f"Bearer {token}")

    try:
        with urllib.request.urlopen(request) as response:
            release = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            sys.exit(f"FAIL: no release tagged {tag} in {REPO}")
        raise

    digests = {}
    for asset in release["assets"]:
        digest = asset.get("digest") or ""
        if digest.startswith("sha256:"):
            digests[asset["name"]] = digest[len("sha256:") :]

    if not digests:
        sys.exit(
            f"FAIL: {tag} exposes no sha256 digests. The release may still be "
            "uploading; re-run this job once its assets have settled."
        )
    return digests


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)

    tag = sys.argv[1]
    path = sys.argv[2] if len(sys.argv) > 2 else "Formula/linelord.rb"
    version = tag[1:] if tag.startswith("v") else tag

    source = open(path, encoding="utf-8").read()
    digests = release_digests(tag)

    updated, version_count = re.subn(
        r'version "[^"]+"', f'version "{version}"', source, count=1
    )
    if version_count != 1:
        sys.exit(f"FAIL: no version line to update in {path}")

    missing = []
    changed = []
    referenced = set()

    def substitute(match):
        asset = match.group("asset")
        referenced.add(asset)
        published = digests.get(asset)
        if published is None:
            missing.append(asset)
            return match.group(0)
        if published != match.group("sha"):
            changed.append(asset)
        return match.group(1) + published + match.group(4)

    updated, sha_count = URL_SHA.subn(substitute, updated)

    if sha_count == 0:
        sys.exit(f"FAIL: no url/sha256 pairs recognised in {path}")
    if missing:
        sys.exit(
            f"FAIL: {tag} does not publish: {', '.join(sorted(missing))}. "
            "The formula was left untouched."
        )

    # Counting matches is not enough. If one platform's url/sha pair were
    # renamed or reshaped, the regex would simply skip it, the other three
    # would update cleanly, and a formula silently missing a platform would be
    # committed. Every platform the release publishes has to be accounted for.
    unreferenced = platform_assets(digests) - referenced
    if unreferenced:
        sys.exit(
            f"FAIL: {tag} publishes {', '.join(sorted(unreferenced))}, which "
            f"{path} does not offer. Add the url/sha256 pair for it, or stop "
            "publishing the asset. The formula was left untouched."
        )

    open(path, "w", encoding="utf-8").write(updated)

    print(f"{path} now points at {tag} ({sha_count} checksums)")
    for asset in changed:
        print(f"  updated {asset}")
    if not changed and version_count:
        print("  checksums were already current")


if __name__ == "__main__":
    main()
