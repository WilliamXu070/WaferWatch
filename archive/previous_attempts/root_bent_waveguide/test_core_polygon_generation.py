import argparse
from pathlib import Path

import numpy as np

from bent_core_polygon import polygon_diagnostics, single_core_polygon
from bent_waveguide_config import (
    DEFAULT_FOOTPRINT,
    DEFAULT_INPUT_ARM_LENGTH,
    DEFAULT_OUTPUT_ARM_LENGTH,
    sidewall_bottom_width,
)


def case_vectors(n, bound, random_cases, seed):
    rng = np.random.default_rng(seed)
    cases = [("zero", np.zeros(n))]

    for index in [0, n//4, n//2, n - 1]:
        params = np.zeros(n)
        params[index] = bound
        cases.append(("single_plus_%02d" % index, params))
        params = np.zeros(n)
        params[index] = -bound
        cases.append(("single_minus_%02d" % index, params))

    alternating = np.empty(n)
    alternating[0::2] = bound
    alternating[1::2] = -bound
    cases.append(("alternating_bounds", alternating))
    cases.append(("all_plus_bound", np.full(n, bound)))
    cases.append(("all_minus_bound", np.full(n, -bound)))

    for i in range(random_cases):
        cases.append(("random_%02d" % i, rng.uniform(-bound, bound, n)))

    return cases


def write_plot(output_dir, name, points, center, diagnostics):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return

    fig, ax = plt.subplots(figsize=(8, 8))
    indices = np.arange(points.shape[0])
    ax.plot(points[:, 0]*1e6, points[:, 1]*1e6, "-", color="0.6", linewidth=0.8)
    sc = ax.scatter(points[:, 0]*1e6, points[:, 1]*1e6, c=indices, s=5, cmap="turbo")
    ax.plot(center[:, 0]*1e6, center[:, 1]*1e6, "k-", linewidth=1.0)
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.25)
    ax.set_title("%s, max edge %.1f nm" % (name, diagnostics["max_edge"]*1e9))
    ax.set_xlabel("x (um)")
    ax.set_ylabel("y (um)")
    fig.colorbar(sc, ax=ax, label="polygon vertex index")
    fig.tight_layout()
    fig.savefig(output_dir / ("%s_polygon.png" % name), dpi=220)
    plt.close(fig)


def validate(name, params, args):
    points, center, theta, bend_center, bend_theta = single_core_polygon(
        params=params,
        footprint=args.footprint,
        wg_width=args.width,
        input_arm_length=args.input_arm,
        output_arm_length=args.output_arm,
        samples=args.samples,
    )
    diagnostics = polygon_diagnostics(points)

    expected_start = np.array([-args.input_arm, 0.0])
    expected_bend_end = np.array([args.footprint, args.footprint])
    expected_end = np.array([args.footprint, args.footprint + args.output_arm])

    failures = []
    if diagnostics["signed_area"] <= 0:
        failures.append("polygon orientation is not CCW")
    if diagnostics["near_zero_edges"]:
        failures.append("near-zero polygon edges: %s" % diagnostics["near_zero_edges"])
    max_edge_limit = args.max_edge if args.max_edge is not None else 1.05*args.width
    if diagnostics["max_edge"] > max_edge_limit:
        failures.append("max edge %.3g exceeds %.3g" % (diagnostics["max_edge"], max_edge_limit))
    if not np.allclose(center[0], expected_start, atol=1e-15):
        failures.append("center start %s != %s" % (center[0], expected_start))
    if not np.allclose(bend_center[-1], expected_bend_end, atol=1e-15):
        failures.append("bend end %s != %s" % (bend_center[-1], expected_bend_end))
    if not np.allclose(center[-1], expected_end, atol=1e-15):
        failures.append("center end %s != %s" % (center[-1], expected_end))
    if abs(theta[0]) > 2e-2:
        failures.append("input tangent %.4g rad is not horizontal" % theta[0])
    if abs(theta[-1] - np.pi/2) > 2e-2:
        failures.append("output tangent %.4g rad is not vertical" % theta[-1])

    print(
        "%-22s points=%4d max_edge_nm=%8.3f bbox_um=(%.3f, %.3f, %.3f, %.3f)"
        % (
            name,
            diagnostics["points"],
            diagnostics["max_edge"]*1e9,
            diagnostics["bbox"][0]*1e6,
            diagnostics["bbox"][1]*1e6,
            diagnostics["bbox"][2]*1e6,
            diagnostics["bbox"][3]*1e6,
        )
    )

    return points, center, diagnostics, failures


def main():
    parser = argparse.ArgumentParser(description="Stress-test bent waveguide single-core polygon generation.")
    parser.add_argument("--n", type=int, default=64)
    parser.add_argument("--bound", type=float, default=3e-6)
    parser.add_argument("--footprint", type=float, default=DEFAULT_FOOTPRINT)
    parser.add_argument("--width", type=float, default=sidewall_bottom_width())
    parser.add_argument("--input-arm", type=float, default=DEFAULT_INPUT_ARM_LENGTH)
    parser.add_argument("--output-arm", type=float, default=DEFAULT_OUTPUT_ARM_LENGTH)
    parser.add_argument("--samples", type=int, default=1600)
    parser.add_argument("--random-cases", type=int, default=20)
    parser.add_argument("--seed", type=int, default=4)
    parser.add_argument("--max-edge", type=float, default=None)
    parser.add_argument("--plot-failures-only", action="store_true")
    parser.add_argument("--output-dir", default="core_polygon_test_outputs")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(exist_ok=True)

    all_failures = []
    for name, params in case_vectors(args.n, args.bound, args.random_cases, args.seed):
        points, center, diagnostics, failures = validate(name, params, args)
        if failures:
            all_failures.append((name, failures))
        if failures or not args.plot_failures_only:
            write_plot(output_dir, name, points, center, diagnostics)
            np.savetxt(
                output_dir / ("%s_points_um.csv" % name),
                np.column_stack((np.arange(points.shape[0]), points*1e6)),
                delimiter=",",
                header="idx,x_um,y_um",
                comments="",
            )

    if all_failures:
        print("\nFAILURES")
        for name, failures in all_failures:
            print(name)
            for failure in failures:
                print("  - " + failure)
        raise SystemExit(1)

    print("\nAll polygon generation cases passed.")
    print("Plots and point CSVs written to:", output_dir)


if __name__ == "__main__":
    main()
