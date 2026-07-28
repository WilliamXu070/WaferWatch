#!/usr/bin/env python3
"""Stepwise Lumerical .lsf checker.

Feeds optimize.lsf (or any .lsf) to Lumerical in increasing chunks,
with a hard stop at the first chunk that fails. This helps identify exactly
which script line starts failing during base-script evaluation.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import argparse
import re
import sys
import textwrap

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from configs import current_lnoi


def _strip_line_comment(line: str) -> str:
    # Lumerical uses # and // for comments.
    if "#" in line:
        line = line.split("#", 1)[0]
    if "//" in line:
        line = line.split("//", 1)[0]
    return line


def _chunk_by_statement(lines):
    """Group .lsf text into executable statement chunks.

    This keeps control blocks together (for/if + braces) so eval() does not fail
    just because a multi-line block is incomplete.
    """
    chunks = []
    current = []
    brace_depth = 0

    for i, line in enumerate(lines, start=1):
        current.append((i, line))

        code = _strip_line_comment(line)
        stripped = code.strip()
        if not stripped:
            continue

        brace_depth += stripped.count("{")
        brace_depth -= stripped.count("}")

        # Inside a block, keep adding lines until we close it.
        if brace_depth > 0:
            continue

        # If we're not inside a block, treat this as a complete executable chunk
        # when we finish a statement or a closing brace line.
        if stripped.endswith(";") or stripped.endswith("}") or stripped.endswith("]"):
            chunks.append(current)
            current = []

    if current:
        chunks.append(current)

    return chunks


def _parse_lumapi_error(err_msg: str):
    match = re.search(r"prompt\s+line\s*[:=]?\s*(\d+)", err_msg, re.IGNORECASE)
    return int(match.group(1)) if match else None


def _extract_context(lines, fail_line, span=6):
    start_ctx = max(1, fail_line - span)
    end_ctx = min(len(lines), fail_line + span)
    return list(range(start_ctx, end_ctx + 1))


def _guess_cause(error_text: str, fail_line_text: str):
    err = (error_text or "").lower()
    line = fail_line_text.lower()

    causes = []

    if "setlayer" in line and "background material" in line:
        causes.append("This line sets a layer's background material. The material name must exist before this line.")
    if "setmaterial" in line:
        causes.append("This line writes material property; check material name and property names for this object.")
    if "addmaterial" in line:
        causes.append("This line creates/reuses a material; failure often means missing material type or duplicate/invalid name.")

    if "could not find" in err or "not found" in err:
        causes.append("Lumerical reported a missing object/material. Verify prior 'addmaterial'/'setmaterial' lines were executed and names match exactly.")
    if "syntax" in err and "line" in err:
        causes.append("Syntax/grammar failure in script block. Check parentheses/comma/semicolon around this line.")
    if "property" in err and "does not exist" in err:
        causes.append("Property mismatch. This version of Lumerical may use different property names.")
    if "prompt line" in err:
        causes.append("Error parser reported a prompt line; that number should match the script line shown below if numbering is intact.")

    if not causes:
        causes.append("No automatic pattern matched. Run line-mode refinement below for exact failing statement.")

    return causes


def _log(log_fh, msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_fh.write(f"[{ts}] {msg}\n")
    log_fh.flush()
    print(msg)


def _save_failed_prefix(lines, end_line: int, base_path: Path):
    failed = "".join(lines[:end_line])
    out = base_path.with_name(base_path.stem + f"_failed_until_{end_line}.lsf")
    out.write_text(failed)
    return out


def _collect_local_history(lines, fail_line):
    start = max(1, fail_line - 20)
    return [(i, lines[i - 1].rstrip()) for i in range(start, fail_line)]


def _line_refine(fdtd, base_prefix_lines, fail_chunk):
    """Find the first failing line inside a failed chunk.

    Returns: (line_no, error_text, tested_prefix) or (None, None, base_prefix_lines).
    """
    working_prefix = list(base_prefix_lines)

    for (ln, line_text) in fail_chunk:
        test_prefix = "".join(working_prefix + [line_text])
        try:
            fdtd.eval("switchtolayout; selectall; delete;")
            fdtd.eval(test_prefix)
            working_prefix.append(line_text)
        except Exception as exc:
            return ln, str(exc), working_prefix

    return None, None, working_prefix


def main():
    parser = argparse.ArgumentParser(description="Debug Lumerical .lsf line/block failures.")
    parser.add_argument(
        "--lsf",
        type=Path,
        default=PROJECT_ROOT / "bend" / "fdtd_lumopt" / "optimize.lsf",
        help="Path to the .lsf file to test.")
    parser.add_argument(
        "--radius",
        type=float,
        default=current_lnoi.RADIUS_M,
        help="radius replacement value",
    )
    parser.add_argument(
        "--output-x",
        type=float,
        default=None,
        help="output_x replacement value (defaults to radius)")
    parser.add_argument(
        "--log",
        type=Path,
        default=(
            PROJECT_ROOT
            / "artifacts"
            / "simulation_outputs"
            / "environment_checks"
            / "optimize_lsf_debug.log"
        ),
        help="Log file path")
    parser.add_argument(
        "--no-delete-log",
        action="store_true",
        help="Append to an existing log instead of overwriting")
    parser.add_argument(
        "--line-mode",
        action="store_true",
        help="Run one line per chunk (strict line-by-line; useful for debugging but can fail inside unclosed blocks)")
    parser.add_argument(
        "--refine",
        action="store_true",
        help="After a chunk fails, run line-by-line isolate inside that chunk to find exact statement")
    parser.add_argument(
        "--context",
        type=int,
        default=8,
        help="Number of context lines printed around the failure (default: 8)")
    args = parser.parse_args()

    output_x = args.radius if args.output_x is None else args.output_x

    text = args.lsf.read_text()
    replaced = text
    replacements = current_lnoi.lsf_replacements(
        radius_m=args.radius,
        output_x_m=output_x,
    )
    for token, value in replacements.items():
        replaced = replaced.replace(token, value)
    lines = replaced.splitlines(keepends=True)
    placeholders = sorted(set(re.findall(r"__[^\s]+__", replaced)))
    if placeholders:
        raise SystemExit(f"Unreplaced placeholders remain: {placeholders}. Provide matching --radius/--output-x arguments or extend replacements.")

    try:
        import lumapi
    except Exception as exc:
        raise SystemExit(f"Could not import lumapi: {exc}\nRun this on a machine with Lumerical Python API set up.")

    if args.line_mode:
        # Strict line-level stepping (not block-aware).
        chunks = [[(i + 1, l)] for i, l in enumerate(lines)]
    else:
        # Block-aware stepping (default): safer for for/if loops.
        chunks = _chunk_by_statement(lines)

    if not args.no_delete_log:
        if args.log.exists():
            args.log.unlink()

    args.log.parent.mkdir(parents=True, exist_ok=True)
    with args.log.open("a", encoding="utf-8") as log_fh:
        _log(log_fh, f"Testing {args.lsf}")
        _log(log_fh, f"Total lines: {len(lines)}, chunks: {len(chunks)}")

        try:
            fdtd = lumapi.FDTD()
        except Exception as exc:
            raise SystemExit(f"Could not start Lumerical session: {exc}")

        prefix_lines = []

        for chunk_idx, chunk in enumerate(chunks, start=1):
            start_line = chunk[0][0]
            end_line = chunk[-1][0]
            prefix_lines.extend(l for _, l in chunk)
            prefix_script = "".join(prefix_lines)

            # keep each attempt in a clean layout state
            try:
                fdtd.eval("switchtolayout; selectall; delete;")
                fdtd.eval(prefix_script)
            except Exception as exc:  # lumapi raises LumApiError in runtime
                error_text = str(exc)
                prompt_line = _parse_lumapi_error(error_text)
                fail_line = prompt_line if prompt_line is not None else end_line

                _log(log_fh, "\n" + "=" * 70)
                _log(log_fh, f"FAIL at chunk {chunk_idx}: script lines {start_line}..{end_line}")
                _log(log_fh, f"Likely failing near script line: {fail_line}")
                if 1 <= fail_line <= len(lines):
                    _log(log_fh, f"Line {fail_line}: {lines[fail_line - 1].rstrip()}")
                _log(log_fh, f"Error: {error_text}")

                # Optional exact line isolation inside the failed chunk.
                if not args.line_mode and args.refine:
                    prior = list(prefix_lines[:-len(chunk)])
                    ref_line, ref_error, working_prefix = _line_refine(fdtd, prior, chunk)
                    if ref_line is not None:
                        fail_line = ref_line
                        error_text = ref_error
                        _log(log_fh, f"[refine] Exact failing statement is line {fail_line}")
                        _log(log_fh, f"    {lines[fail_line - 1].rstrip()}")
                        prefix_lines[:] = list(working_prefix)

                # print likely causes
                causes = _guess_cause(error_text, lines[fail_line - 1].rstrip() if 1 <= fail_line <= len(lines) else "")
                _log(log_fh, "Likely reasons:")
                for item in causes:
                    wrapped = textwrap.fill(item, width=88)
                    _log(log_fh, f"  - {wrapped}")

                failed_file = _save_failed_prefix(lines, fail_line, args.lsf)
                _log(log_fh, f"Saved failing-prefix script: {failed_file}")

                # print local context around failure
                _log(log_fh, "Context:")
                for ln in _extract_context(lines, fail_line, span=max(1, args.context)):
                    mark = "--> " if ln == fail_line else "    "
                    _log(log_fh, f"{mark}{ln:4d}: {lines[ln - 1].rstrip()}")

                _log(log_fh, "Recent setup near failure (before failed line):")
                for ln, text in _collect_local_history(lines, fail_line):
                    _log(log_fh, f"    {ln:4d}: {text}")

                _log(log_fh, "Suggestion: rerun with --line-mode --refine --no-delete-log for step-by-step pinpointing.")
                _log(log_fh, "Stopped at first failing chunk.")
                _log(log_fh, "=" * 70)
                return

            _log(log_fh, f"[ok] chunk {chunk_idx:04d} (lines {start_line}..{end_line})")

        _log(log_fh, "Done: base script executed successfully end-to-end.")


if __name__ == "__main__":
    main()
