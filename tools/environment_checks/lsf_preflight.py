#!/usr/bin/env python3
"""Lightweight preflight for Lumerical LSF scripts.

Checks for common Lumerical-unsupported tokens (e.g. MATLAB-style max/min) so
syntax-like issues are caught before running inside Lumerical.
"""

from __future__ import annotations

import argparse
from pathlib import Path


UNSUPPORTED = {
    "max(": "Lumerical Script does not support MATLAB-style max(). Use if-statements for comparisons.",
    "min(": "Lumerical Script does not support MATLAB-style min(). Use if-statements for comparisons.",
}


def check_file(path: Path) -> int:
    text = path.read_text()
    bad = False

    # strip comments to avoid false positives in notes
    lines = []
    for line in text.splitlines():
        if "#" in line:
            line = line.split("#", 1)[0]
        if "//" in line:
            line = line.split("//", 1)[0]
        lines.append(line)

    for i, line in enumerate(lines, start=1):
        for token, msg in UNSUPPORTED.items():
            if token in line:
                print(f"{path}:{i}: unsupported token '{token.strip()}' - {msg}")
                bad = True

    return 1 if bad else 0



def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("files", nargs="+", help="LSF files to check")
    args = p.parse_args()

    codes = [check_file(Path(f)) for f in args.files]
    return 1 if any(c for c in codes) else 0


if __name__ == "__main__":
    raise SystemExit(main())
