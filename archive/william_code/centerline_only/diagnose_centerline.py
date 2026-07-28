import argparse
from pathlib import Path

import numpy as np

from centerline_config import (
    DEFAULT_FOOTPRINT,
    DEFAULT_INPUT_ARM_LENGTH,
    DEFAULT_OUTPUT_ARM_LENGTH,
    sidewall_bottom_width,
)
from centerline_geometry import (
    centerline_core_polygon,
    edge_lengths,
    validate_centerline_geometry,
)


def case_vectors(n, bound, random_cases, seed):
    rng = np.random.default_rng(seed)
    cases = [("zero", np.zeros(n))]
    for index in sorted(set([0, n//4, n//2, n - 1])):
        params = np.zeros(n)
        params[index] = bound
        cases.append(("single_plus_%02d" % index, params))
        params = np.zeros(n)
        params[index] = -bound
        cases.append(("single_minus_%02d" % index, params))
    cases.append(("all_plus_bound", np.full(n, bound)))
    cases.append(("all_minus_bound", np.full(n, -bound)))
    alternating = np.empty(n)
    alternating[0::2] = bound
    alternating[1::2] = -bound
    cases.append(("alternating_bounds", alternating))
    for i in range(random_cases):
        cases.append(("random_%02d" % i, rng.uniform(-bound, bound, n)))
    return cases


def write_plot(output_dir, name, report, args):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return

    points = report["points"]
    center = report["center"]
    bend_center = report["bend_center"]

    fig, ax = plt.subplots(figsize=(8, 8))
    ax.plot(points[:, 0]*1e6, points[:, 1]*1e6, color="0.6", linewidth=0.8)
    ax.scatter(points[:, 0]*1e6, points[:, 1]*1e6, c=np.arange(points.shape[0]), s=4, cmap="turbo")
    ax.plot(center[:, 0]*1e6, center[:, 1]*1e6, color="black", linewidth=1.0)
    ax.plot(bend_center[:, 0]*1e6, bend_center[:, 1]*1e6, color="red", linewidth=1.0)
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.25)
    ax.set_xlabel("x (um)")
    ax.set_ylabel("y (um)")
    ax.set_title("%s, min radius %.3f um" % (name, report["min_radius"]*1e6))
    ax.set_xlim((-args.input_arm - 2e-6)*1e6, (args.footprint + 4e-6)*1e6)
    ax.set_ylim((-4e-6)*1e6, (args.footprint + args.output_arm + 3e-6)*1e6)
    fig.tight_layout()
    fig.savefig(output_dir / ("%s.png" % name), dpi=220)
    plt.close(fig)


def derivative_report(args):
    params = np.zeros(args.n)
    base_points, *_ = centerline_core_polygon(
        params=params,
        footprint=args.footprint,
        wg_width=args.width,
        input_arm_length=args.input_arm,
        output_arm_length=args.output_arm,
        samples=args.samples,
    )
    shifts = []
    gradients = []
    for index in range(args.n):
        plus = params.copy()
        minus = params.copy()
        plus[index] += args.shape_dx
        minus[index] -= args.shape_dx
        plus_points, *_ = centerline_core_polygon(
            plus, args.footprint, args.width, args.input_arm, args.output_arm, args.samples
        )
        minus_points, *_ = centerline_core_polygon(
            minus, args.footprint, args.width, args.input_arm, args.output_arm, args.samples
        )
        shift = np.linalg.norm(plus_points - base_points, axis=1)
        grad = (plus_points - minus_points)/(2.0*args.shape_dx)
        shifts.append(float(np.max(shift)))
        gradients.append(float(np.max(np.linalg.norm(grad, axis=1))))

    shifts = np.asarray(shifts)
    gradients = np.asarray(gradients)
    print("\n=== Shape-Derivative Geometry Probe ===")
    print("shape dx:", args.shape_dx)
    print("max vertex shift from +shape_dx min/median/max nm:",
          np.min(shifts)*1e9, np.median(shifts)*1e9, np.max(shifts)*1e9)
    print("controls with shift < 1 nm:", int(np.sum(shifts < 1e-9)), "of", args.n)
    print("controls with shift < mesh/10:", int(np.sum(shifts < args.mesh/10.0)), "of", args.n)
    print("finite polygon gradient norm min/median/max:",
          np.min(gradients), np.median(gradients), np.max(gradients))


def main():
    parser = argparse.ArgumentParser(description="Offline diagnostics for centerline-only curvature geometry.")
    parser.add_argument("--n", type=int, default=16)
    parser.add_argument("--bound", type=float, default=2.0)
    parser.add_argument("--footprint", type=float, default=DEFAULT_FOOTPRINT)
    parser.add_argument("--width", type=float, default=sidewall_bottom_width())
    parser.add_argument("--input-arm", type=float, default=DEFAULT_INPUT_ARM_LENGTH)
    parser.add_argument("--output-arm", type=float, default=DEFAULT_OUTPUT_ARM_LENGTH)
    parser.add_argument("--samples", type=int, default=1600)
    parser.add_argument("--shape-dx", type=float, default=0.05)
    parser.add_argument("--mesh", type=float, default=50e-9)
    parser.add_argument("--random-cases", type=int, default=12)
    parser.add_argument("--seed", type=int, default=8)
    parser.add_argument("--plot", action="store_true")
    parser.add_argument("--plot-failures-only", action="store_true")
    parser.add_argument("--output-dir", default="centerline_diagnostic_outputs")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(exist_ok=True)

    all_failures = []
    for name, params in case_vectors(args.n, args.bound, args.random_cases, args.seed):
        report = validate_centerline_geometry(
            params=params,
            footprint=args.footprint,
            width=args.width,
            input_arm=args.input_arm,
            output_arm=args.output_arm,
            samples=args.samples,
        )
        d = report["diagnostics"]
        lengths = edge_lengths(report["points"])
        print(
            "%-22s failures=%2d points=%4d max_edge_nm=%8.3f min_radius_um=%8.3f bbox_um=(%.3f, %.3f, %.3f, %.3f)"
            % (
                name,
                len(report["failures"]),
                d["points"],
                np.max(lengths)*1e9,
                report["min_radius"]*1e6,
                d["bbox"][0]*1e6,
                d["bbox"][1]*1e6,
                d["bbox"][2]*1e6,
                d["bbox"][3]*1e6,
            )
        )
        if report["failures"]:
            all_failures.append((name, report["failures"]))
        if args.plot and (report["failures"] or not args.plot_failures_only):
            write_plot(output_dir, name, report, args)

    derivative_report(args)

    if all_failures:
        print("\nFAILURES")
        for name, failures in all_failures:
            print(name)
            for failure in failures:
                print("  - " + failure)
        raise SystemExit(1)

    print("\nAll centerline-only geometry cases passed.")
    print("Diagnostic output directory:", output_dir)


if __name__ == "__main__":
    main()
