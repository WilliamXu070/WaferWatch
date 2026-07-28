"""Compatibility probe for Luminal / Lumerical optimization stack.

Usage:
  python check_env_for_lumerical_opt.py                    # print quick check
  python check_env_for_lumerical_opt.py --baseline out.json  # write baseline snapshot
  python check_env_for_lumerical_opt.py --check-baseline out.json
  python check_env_for_lumerical_opt.py --emit-requirements out.txt

Goal:
- Verify this exact dependency set imports and is internally API-compatible
  with the snippet you provided.
- Catch the SciPy/LumOpt breakage (`sp.misc.derivative` removed)
- Help compare environments between machines (Anaconda environments).
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
from importlib import import_module
from importlib import metadata
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pkg_resources

sys.path.insert(0, r"C:\\Program Files\\ANSYS Inc\\v251\\Lumerical\\api\\python")



# ----------------------------------------------------------------------------
# Environment + import checks
# ----------------------------------------------------------------------------
CORE_IMPORTS = [
    "numpy",
    "scipy",
    "lumapi",
    "lumopt",
    "lumopt.utilities.load_lumerical_scripts",
    "lumopt.utilities.wavelengths",
    "lumopt.geometries.polygon",
    "lumopt.utilities.materials",
    "lumopt.figures_of_merit.modematch",
    "lumopt.optimizers.generic_optimizers",
    "lumopt.optimization",
]

# Minimum version expectations for interoperability.
# Keep this narrow to avoid false failures, but enough to catch known breakage.
EXPECTED = {
    "numpy": (">=", "1.24"),
    "scipy": (">=", "1.10"),
    "scipy<1.15": ("<=", "1.14.999"),
}


def _version_tuple(v: str):
    return tuple(int(p) for p in v.split(".")[:3])


def _cmp_version(a: str, b: str) -> int:
    a_t = _version_tuple(a)
    b_t = _version_tuple(b)
    return (a_t > b_t) - (a_t < b_t)


def _version_meets(v: str, op: str, limit: str) -> bool:
    c = _cmp_version(v, limit)
    if op == ">=":
        return c >= 0
    if op == ">":
        return c > 0
    if op == "<=":
        return c <= 0
    if op == "<":
        return c < 0
    if op == "==":
        return c == 0
    raise ValueError(op)


def _get_version(pkg: str) -> str:
    try:
        return metadata.version(pkg)
    except Exception:
        return ""


def _module_version(module) -> str:
    for attr in ("__version__", "VERSION", "version"):
        if hasattr(module, attr):
            v = getattr(module, attr)
            if isinstance(v, str):
                return v
            try:
                return str(v)
            except Exception:
                pass
    try:
        return metadata.version(module.__name__.split(".")[0])
    except Exception:
        return ""


def _safe_import(name: str):
    try:
        mod = import_module(name)
        return True, mod, None
    except Exception as exc:  # noqa: BLE001
        return False, None, f"{type(exc).__name__}: {exc}"


def _check_scipy_derivative(modules: Dict[str, Any], report: Dict[str, Any]) -> bool:
    scipy_ok = modules["scipy"]["import_ok"]
    if not scipy_ok:
        report["scipy_derivative"] = {
            "ok": False,
            "details": "SciPy import failed, cannot validate derivative compatibility.",
        }
        return False

    sp = modules["scipy"]["module"]
    has_derivative = hasattr(sp, "misc") and hasattr(sp.misc, "derivative")
    has_version = modules["scipy"].get("version", "")

    result = {
        "scipy_version": has_version,
        "has_sp_misc": hasattr(sp, "misc"),
        "has_sp_misc_derivative": has_derivative,
        "has_alternative_derivative": hasattr(sp, "misc")
        and hasattr(sp.misc, "_deprecated")
        and "derivative" in getattr(sp.misc, "_deprecated", {}),
    }

    # Flag known breakage in LumOpt where optimizer.py expects sp.misc.derivative.
    breakage_risk = False
    risk_msgs: List[str] = []
    if not has_derivative:
        risk_msgs.append(
            "scipy.misc.derivative is missing; this breaks LumOpt optimizer.py finite_diff_approx "
            "in older LumOpt that still calls sp.misc.derivative."
        )
        breakage_risk = True

    if breakage_risk:
        # Detect direct usage to give high confidence.
        try:
            from lumopt.optimizers import optimizer as _lumopt_optimizer

            import inspect

            src = inspect.getsource(_lumopt_optimizer)
            if "sp.misc.derivative" in src:
                risk_msgs.append("Detected `sp.misc.derivative` usage in lumopt.optimizers.optimizer.")
                breakage_risk = True
            else:
                risk_msgs.append("No direct `sp.misc.derivative` string found in source; check runtime path/version exactly.)")
                breakage_risk = True
        except Exception as exc:  # noqa: BLE001
            risk_msgs.append(f"Could not inspect LumOpt optimizer source: {type(exc).__name__}: {exc}")

    result["risk_of_breakage"] = breakage_risk
    result["messages"] = risk_msgs
    result["ok"] = not breakage_risk
    report["scipy_derivative"] = result
    return result["ok"]


def _collect_installed_packages() -> List[str]:
    pkgs: List[str] = []
    for dist in sorted(pkg_resources.working_set, key=lambda d: d.project_name.lower()):
        pkgs.append(f"{dist.project_name}=={dist.version}")
    return pkgs


def _collect_summary(modules: Dict[str, Any]) -> Dict[str, Any]:
    # Snapshot useful for Anaconda-to-Anaconda comparison.
    return {
        "python": {
            "exe": sys.executable,
            "version": sys.version,
            "platform": platform.platform(),
        },
        "packages": _collect_installed_packages(),
        "imports": {
            name: {
                "import_ok": bool(m["import_ok"]),
                "version": m.get("version", ""),
                "file": getattr(m.get("module"), "__file__", ""),
                "error": m.get("error", ""),
            }
            for name, m in modules.items()
        },
    }


def _collect_import_report() -> Tuple[Dict[str, Any], bool]:
    modules: Dict[str, Any] = {}
    all_ok = True

    for name in CORE_IMPORTS:
        ok, mod, err = _safe_import(name)
        modules[name] = {
            "import_ok": ok,
            "module": mod,
            "error": err,
            "version": "",
        }
        if ok:
            modules[name]["version"] = _module_version(mod)
        else:
            all_ok = False

    # Fill top-level package versions where available.
    for key, expected_op, expected_version in [
        ("numpy", *EXPECTED["numpy"]),
        ("scipy", *EXPECTED["scipy"]),
    ]:
        if modules.get(key) and modules[key]["version"]:
            v = modules[key]["version"]
            modules[key]["meets_expected"] = _version_meets(v, expected_op, expected_version)
            if not modules[key]["meets_expected"]:
                all_ok = False

    # explicit upper bound for SciPy via second rule key
    sp_rule = EXPECTED["scipy<1.15"]
    sp_ver = modules["scipy"].get("version", "") if modules.get("scipy") else ""
    if sp_ver:
        sp_upper_ok = _version_meets(sp_ver, sp_rule[0], sp_rule[1])
        modules["scipy"]["meets_upper_cap"] = sp_upper_ok
        if not sp_upper_ok:
            all_ok = False
    else:
        modules["scipy"]["meets_upper_cap"] = False

    # LumAPI path availability check (non-fatal, useful for portability)
    expected_api_path = os.environ.get(
        "LUMERICAL_API_PATH",
        r"C:\\Program Files\\ANSYS Inc\\v251\\Lumerical\\api\\python",
    )
    in_pythonpath = any(expected_api_path.lower() == p.lower() for p in map(str, map(Path, sys.path)))
    path_msg = (
        "LUMERICAL_API_PATH present in sys.path"
        if in_pythonpath
        else "LUMERICAL_API_PATH not found in sys.path; add it or set env var for portability"
    )
    modules["lumapi"]["lumerical_api_path"] = {
        "expected": expected_api_path,
        "in_sys_path": in_pythonpath,
        "message": path_msg,
    }

    # Compatibility of SciPy derivative with current LumOpt.
    if not _check_scipy_derivative(modules, {}
):
        pass

    return modules, all_ok


def _maybe_compare_baseline(current: Dict[str, Any], baseline_path: str, strict: bool = False) -> List[str]:
    issues: List[str] = []
    base_file = Path(baseline_path)
    if not base_file.exists():
        issues.append(f"Baseline file not found: {base_file}")
        return issues

    with base_file.open("r", encoding="utf-8") as fp:
        baseline = json.load(fp)

    # Compare Python executable major/minor/prefix and exact package set for deterministic repro.
    c_pkgs = current.get("packages", [])
    b_pkgs = baseline.get("packages", [])
    if c_pkgs != b_pkgs:
        issues.append("Installed package list differs from baseline (size/order mismatch expected after normalization).")

    c_imports = current.get("imports", {})
    b_imports = baseline.get("imports", {})
    for key in ["numpy", "scipy", "lumopt", "lumapi"]:
        c_mod = c_imports.get(key, {})
        b_mod = b_imports.get(key, {})
        if c_mod.get("version") != b_mod.get("version"):
            issues.append(f"Version mismatch for {key}: current={c_mod.get('version')} baseline={b_mod.get('version')}")

    if strict and issues:
        issues.append("Strict mode enabled: treating any mismatch as blocking.")
    return issues


def _write_requirements(path: str, packages: List[str]) -> None:
    out = Path(path)
    out.write_text("\n".join(packages) + "\n", encoding="utf-8")


def run_checks() -> Dict[str, Any]:
    module_rows: Dict[str, Any] = {}
    all_ok = True

    modules = {}
    for name in CORE_IMPORTS:
        ok, mod, err = _safe_import(name)
        modules[name] = {
            "import_ok": bool(ok),
            "version": _module_version(mod) if ok else "",
            "file": getattr(mod, "__file__", "") if ok else "",
            "error": err or "",
        }

    scipy_ok = modules["scipy"]["import_ok"]
    if scipy_ok:
        try:
            import scipy as sp

            modules["scipy"]["has_misc_derivative"] = (
                hasattr(sp, "misc") and hasattr(sp.misc, "derivative")
            )
        except Exception as exc:  # noqa: BLE001
            modules["scipy"]["has_misc_derivative"] = False
            modules["scipy"]["misc_error"] = f"{type(exc).__name__}: {exc}"

    # enforce expectations from EXPECTED table
    for pkg, rule in [("numpy", EXPECTED["numpy"]), ("scipy", EXPECTED["scipy"]), ("scipy", EXPECTED["scipy<1.15"])]:
        name = pkg
        if name in modules and modules[name]["version"]:
            op, ver = rule
            modules[name]["version_ok"] = _version_meets(modules[name]["version"], op, ver)
            if not modules[name]["version_ok"]:
                all_ok = False

    # explicit cap helper
    if modules.get("scipy") and modules["scipy"].get("version"):
        cap_ok = _version_meets(modules["scipy"]["version"], EXPECTED["scipy<1.15"][0], EXPECTED["scipy<1.15"][1])
        modules["scipy"]["upper_cap_ok"] = cap_ok
        if not cap_ok:
            all_ok = False

    # Lumerical API path presence.
    modules["lumapi"]["api_path_env"] = os.environ.get("LUMERICAL_API_PATH", "")
    modules["lumapi"]["api_path_exists"] = bool(modules["lumapi"].get("api_path_env"))

    # check import failures
    for row in modules.values():
        if not row["import_ok"]:
            all_ok = False

    # specific runtime compatibility test for LumOpt finite-diff path
    derivative_msg: str = ""
    if scipy_ok:
        try:
            import scipy as sp

            if not hasattr(sp, "misc") or not hasattr(sp.misc, "derivative"):
                derivative_msg = "FAIL: scipy.misc.derivative missing (known LumOpt break with old optimizer.py)."
                all_ok = False
            else:
                derivative_msg = "PASS: scipy.misc.derivative present."
        except Exception as exc:  # noqa: BLE001
            derivative_msg = f"FAIL: SciPy runtime exception when checking derivative support: {type(exc).__name__}: {exc}"
            all_ok = False
    else:
        derivative_msg = "FAIL: SciPy import failed; derivative check could not run."
        all_ok = False

    return {
        "timestamp": __import__("time").asctime(),
        "status": "PASS" if all_ok else "FAIL",
        "python": {
            "executable": sys.executable,
            "version": sys.version,
            "platform": platform.platform(),
            "machine": platform.machine(),
            "architecture": platform.architecture(),
        },
        "modules": modules,
        "derivative_check": derivative_msg,
        "packages": _collect_installed_packages(),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check LumOpt/Lumerical environment compatibility across machines")
    parser.add_argument("--baseline", dest="baseline", default=None, help="Path to baseline JSON snapshot to compare against.")
    parser.add_argument("--emit-baseline", dest="emit_baseline", default=None, help="Write baseline snapshot JSON to this path.")
    parser.add_argument("--emit-requirements", dest="emit_requirements", default=None, help="Write full package list to this file.")
    parser.add_argument("--strict", action="store_true", help="Strict baseline comparison: any mismatch exits non-zero.")
    parser.add_argument("--assert", dest="do_assert", action="store_true", help="Exit non-zero for any compatibility failure.")
    parser.add_argument("--check", action="store_true", help="Print concise compatibility summary only.")

    args = parser.parse_args()

    results = run_checks()
    report_lines: List[str] = []

    # If this script is run on the Windows machine, it should still import with local API path.
    report_lines.append(f"Python: {results['python']['executable']}")
    report_lines.append(f"Platform: {results['python']['platform']}")
    report_lines.append(f"Status: {results['status']}")
    report_lines.append(f"SciPy derivative: {results['derivative_check']}")

    for name in ["numpy", "scipy", "lumopt", "lumapi"]:
        m = results["modules"].get(name, {})
        ok = "OK" if m.get("import_ok") else "FAIL"
        ver = m.get("version", "")
        report_lines.append(f"{name}: {ok} {ver}" + (f" [{m.get('file','')} ]" if m.get("file") else ""))

    # Optional baseline comparison.
    baseline_issues: List[str] = []
    if args.baseline:
        baseline_issues = _maybe_compare_baseline(results, args.baseline, strict=args.strict)
        if baseline_issues:
            report_lines.append("Baseline mismatches:")
            report_lines.extend(f"  - {x}" for x in baseline_issues)
        else:
            report_lines.append("Baseline match: PASS")

    # Optional writes.
    if args.emit_baseline:
        Path(args.emit_baseline).write_text(json.dumps(results, indent=2), encoding="utf-8")
        report_lines.append(f"Baseline snapshot written to: {args.emit_baseline}")

    if args.emit_requirements:
        _write_requirements(args.emit_requirements, results["packages"])
        report_lines.append(f"Requirements written to: {args.emit_requirements}")

    if args.check:
        print("\n".join(report_lines))
    else:
        print(json.dumps(results, indent=2))

    if args.do_assert:
        fail = False
        if results["status"] != "PASS":
            fail = True
        if baseline_issues and args.strict:
            fail = True
        if fail:
            raise SystemExit(1)
        raise SystemExit(0)
