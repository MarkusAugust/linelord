#!/usr/bin/env python3
"""Check that the formula's version and checksums describe a release that exists.

The formula builds its download URL from `version`, but carries the checksums
separately. Nothing ties the two together, and in November 2025 they drifted:
the checksums were updated to 0.7.2 while the version stayed at 0.7.1, so every
`brew install` downloaded the 0.7.1 tarball and rejected it against the 0.7.2
hash. This script is what would have caught that.

Usage: verify_formula.py [path/to/linelord.rb]
"""

import json
import os
import re
import sys
import urllib.request

REPO = "MarkusAugust/linelord"
FORMULA = sys.argv[1] if len(sys.argv) > 1 else "Formula/linelord.rb"


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
    return digests


def main():
    source = open(FORMULA, encoding="utf-8").read()

    version_match = re.search(r'version "([^"]+)"', source)
    if not version_match:
        sys.exit(f"FAIL: no version line in {FORMULA}")
    version = version_match.group(1)
    tag = f"v{version}"

    pairs = re.findall(
        r'url ".*/v#\{version\}/([^"]+)"\s*\n\s*sha256 "([0-9a-f]{64})"', source
    )
    if not pairs:
        sys.exit(f"FAIL: no url/sha256 pairs found in {FORMULA}")

    digests = release_digests(tag)
    print(f"{FORMULA} declares version {version}, checking against {tag}\n")

    failures = []
    for asset, declared in pairs:
        actual = digests.get(asset)
        if actual is None:
            failures.append(f"{asset}: not published in {tag}")
            print(f"  MISSING  {asset}")
        elif actual != declared:
            failures.append(
                f"{asset}: formula says {declared}, {tag} is {actual}"
            )
            print(f"  MISMATCH {asset}")
        else:
            print(f"  ok       {asset}")

    # Checking only the pairs that happen to be present would pass a formula
    # that lost a platform: the remaining three would verify cleanly and the
    # release would ship with one platform silently unavailable. A published
    # binary the formula does not offer is a failure, not a note.
    # checksums.txt is published beside the binaries and is not installed.
    unreferenced = set(digests) - {a for a, _ in pairs} - {"checksums.txt"}
    for asset in sorted(unreferenced):
        failures.append(f"{asset}: published in {tag} but not offered by the formula")
        print(f"  ABSENT   {asset}")

    if failures:
        print("\n" + "\n".join(f"FAIL: {f}" for f in failures))
        sys.exit(1)

    print(f"\nAll {len(pairs)} checksums match {tag}.")


if __name__ == "__main__":
    main()
