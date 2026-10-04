#!/usr/bin/env python3
"""Start a LineLord binary in a terminal, see its interface, and leave it.

`--version` exits before the interface is ever drawn, so a binary missing the
native library its renderer loads would pass that and fail on the first real
run. This runs the binary in a pseudo-terminal against a small repository,
waits for the menu, presses q, and checks the terminal was given back.

    python3 scripts/smoke_tui.py ./linelord-linux-x64 [path/to/repository]

With no repository named, it makes one with git in a temporary directory.
Exits non-zero, saying what was wrong, if any step fails.
"""

import os
import pty
import select
import subprocess
import sys
import tempfile
import time

SEEN_WITHIN = 60  # seconds to draw the menu: a cold runner is slow
GONE_WITHIN = 10  # seconds to leave after q


def fail(message: str, output: bytes) -> None:
    tail = output[-2000:].decode("utf-8", "replace")
    print(f"::error::{message}\n--- last output ---\n{tail}", file=sys.stderr)
    sys.exit(1)


def make_repository() -> str:
    path = tempfile.mkdtemp(prefix="linelord-smoke-")
    run = lambda *args: subprocess.run(args, cwd=path, check=True, capture_output=True)
    run("git", "init", "-q", "-b", "master")
    with open(os.path.join(path, "realm.ts"), "w") as handle:
        handle.write("const gorvek = 'Bonereach'\nexport default gorvek\n")
    run("git", "add", ".")
    run(
        "git", "-c", "user.name=Gorvek of Bonereach", "-c", "user.email=gorvek@bonereach.realm",
        "commit", "-q", "-m", "The first line of the realm",
    )
    return path


def read_until(fd: int, output: bytearray, done, within: float) -> bool:
    end = time.time() + within
    while time.time() < end:
        ready, _, _ = select.select([fd], [], [], 0.1)
        if ready:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                return done(output)
            if not chunk:
                return done(output)
            output.extend(chunk)
        if done(output):
            return True
    return done(output)


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    binary = sys.argv[1]
    repository = sys.argv[2] if len(sys.argv) > 2 else make_repository()

    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        os.execv(binary, [binary, "--no-cache", repository])

    output = bytearray()
    # One word, because only the cells that change are written: the spaces in
    # "Choose your battle" are skipped where the screen already had spaces.
    if not read_until(fd, output, lambda seen: b"Choose" in seen, SEEN_WITHIN):
        os.kill(pid, 9)
        fail(f"{binary} did not draw the menu within {SEEN_WITHIN}s", bytes(output))

    os.write(fd, b"q")
    exited = False
    end = time.time() + GONE_WITHIN
    while time.time() < end and not exited:
        read_until(fd, output, lambda seen: False, 0.2)
        finished, status = os.waitpid(pid, os.WNOHANG)
        if finished:
            exited = True
    if not exited:
        os.kill(pid, 9)
        fail(f"{binary} did not leave within {GONE_WITHIN}s of q", bytes(output))
    if os.waitstatus_to_exitcode(status) != 0:
        fail(f"{binary} left with status {os.waitstatus_to_exitcode(status)}", bytes(output))
    if b"\x1b[?1049l" not in output:
        fail(f"{binary} left without giving the terminal back", bytes(output))

    print(f"{binary}: drew the menu, left on q, gave the terminal back")


if __name__ == "__main__":
    main()
