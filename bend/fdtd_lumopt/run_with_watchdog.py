#!/usr/bin/env python3
"""Run optimize.py with a one-hour iteration-checkpoint watchdog.

This launcher exists because a dead Lumerical/lumapi IPC call can freeze the
child Python process before normal try/except cleanup can run.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


WINDOWS_LUMERICAL_IMAGES = [
    "fdtd-solutions.exe",
    "fdtd-engine.exe",
    "fdtd-run-local.exe",
    "mode-solutions.exe",
    "mode-engine.exe",
    "interconnect.exe",
    "lumerical.exe",
]

POSIX_LUMERICAL_PATTERNS = [
    "fdtd-solutions",
    "fdtd-engine",
    "fdtd-run-local",
    "mode-solutions",
    "mode-engine",
    "lumerical",
]


def _timestamp() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _log(message: str, log_path: Path) -> None:
    line = f"[{_timestamp()}] {message}"
    print(line, flush=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")
        fh.flush()


def _params_checkpoint_mtime(params_file: Path) -> float | None:
    return params_file.stat().st_mtime if params_file.exists() else None


def _start_child(script: Path, env: dict[str, str]) -> subprocess.Popen:
    kwargs = {
        "cwd": str(script.parent),
        "env": env,
    }
    if os.name == "nt":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen([sys.executable, str(script)], **kwargs)


def _kill_child_tree(proc: subprocess.Popen, log_path: Path) -> None:
    if proc.poll() is not None:
        return

    _log(f"Killing child process tree, pid={proc.pid}", log_path)
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            time.sleep(5)
            if proc.poll() is None:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except ProcessLookupError:
            pass

    try:
        proc.wait(timeout=15)
    except subprocess.TimeoutExpired:
        pass


def _kill_lumerical_orphans(log_path: Path) -> None:
    _log("Killing orphaned Lumerical/FDTD processes", log_path)
    if os.name == "nt":
        for image in WINDOWS_LUMERICAL_IMAGES:
            subprocess.run(
                ["taskkill", "/IM", image, "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
    else:
        for pattern in POSIX_LUMERICAL_PATTERNS:
            subprocess.run(
                ["pkill", "-f", pattern],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )


def main() -> int:
    root = Path(__file__).resolve().parent
    project_root = root.parents[1]
    parser = argparse.ArgumentParser(description="Restart optimize.py when accepted-iteration checkpoints stop updating.")
    parser.add_argument("--script", default=str(root / "optimize.py"), help="Optimization script to run")
    parser.add_argument(
        "--checkpoint-dir",
        default=str(project_root / "artifacts" / "checkpoints" / "fdtd_lumopt"),
        help="Checkpoint directory",
    )
    parser.add_argument("--params-file", default=None, help="Parameter checkpoint file to watch and resume from")
    parser.add_argument("--stale-minutes", type=float, default=60.0, help="Restart after this many minutes without an accepted-iteration checkpoint")
    parser.add_argument("--check-seconds", type=float, default=60.0, help="Watchdog polling interval")
    parser.add_argument("--max-restarts", type=int, default=5, help="Maximum automatic restarts")
    parser.add_argument("--no-kill-lumerical-orphans", action="store_true", help="Only kill the child process tree, not orphaned Lumerical processes")
    parser.add_argument("--fresh", action="store_true", help="Disable checkpoint resume for the first child run")
    args = parser.parse_args()

    script = Path(args.script).resolve()
    checkpoint_dir = Path(args.checkpoint_dir).resolve()
    params_file = Path(args.params_file).resolve() if args.params_file else checkpoint_dir / "latest_params.npz"
    log_path = checkpoint_dir / "watchdog.log"
    stale_seconds = max(1.0, args.stale_minutes * 60.0)
    check_seconds = max(1.0, args.check_seconds)

    restarts = 0
    first_run = True

    while True:
        env = os.environ.copy()
        env["KEEP_FDTD_OPEN_ON_STOP"] = "0"
        env["WATCHDOG_RESTART_INDEX"] = str(restarts)
        env["RESUME_PARAMS_FILE"] = str(params_file)
        if first_run and args.fresh:
            env["RESUME_FROM_CHECKPOINT"] = "0"
        else:
            env["RESUME_FROM_CHECKPOINT"] = "1"

        first_run = False
        last_seen_mtime = _params_checkpoint_mtime(params_file)
        last_activity = last_seen_mtime or time.time()

        _log(
            f"Starting child run {restarts + 1}; resume={env['RESUME_FROM_CHECKPOINT']}; params={params_file}; script={script}",
            log_path,
        )
        proc = _start_child(script, env)

        try:
            while True:
                code = proc.poll()
                if code is not None:
                    if code == 0:
                        _log("Child exited successfully; watchdog finished", log_path)
                        return 0
                    _log(f"Child exited with code {code}", log_path)
                    break

                current_mtime = _params_checkpoint_mtime(params_file)
                if current_mtime and (last_seen_mtime is None or current_mtime > last_seen_mtime):
                    last_seen_mtime = current_mtime
                    last_activity = current_mtime
                    _log("Accepted-iteration checkpoint observed", log_path)

                age = time.time() - last_activity
                if age >= stale_seconds:
                    _log(
                        f"No accepted-iteration checkpoint for {age / 60.0:.1f} min; treating run as hung",
                        log_path,
                    )
                    _kill_child_tree(proc, log_path)
                    if not args.no_kill_lumerical_orphans:
                        _kill_lumerical_orphans(log_path)
                    break

                time.sleep(check_seconds)
        except KeyboardInterrupt:
            _log("Keyboard interrupt; stopping child", log_path)
            _kill_child_tree(proc, log_path)
            return 130

        restarts += 1
        if restarts > args.max_restarts:
            _log(f"Maximum restarts exceeded ({args.max_restarts}); giving up", log_path)
            return 124

        _log(f"Restarting from latest checkpoint after 15 seconds; restart={restarts}", log_path)
        time.sleep(15)


if __name__ == "__main__":
    raise SystemExit(main())
