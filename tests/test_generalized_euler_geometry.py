#!/usr/bin/env python3
"""Standalone geometry sanity-checks for the generalized-Euler bend.

This mirrors the bend construction used in optimize.py, but runs without
Lumerical or LumOpt so the centerline and polygon can be checked quickly.
"""

from pathlib import Path
import argparse

import matplotlib.pyplot as plt
import numpy as np
import scipy as sp

PROJECT_ROOT = Path(__file__).resolve().parents[1]

WG_LENGTH = 5e-6
WG_WIDTH = 0.8e-6
N_SEGMENTS = 20
N_CENTERLINE_POINTS = 100
N_RAW_POINTS = 400
CURVATURE_CONTROL_SCALE = 0.35


def _cumtrapz(y, x):
    dx = np.diff(x)
    increments = 0.5 * (y[:-1] + y[1:]) * dx
    return np.concatenate(([0.0], np.cumsum(increments)))


def _polygon_area(points):
    x = points[:, 0]
    y = points[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - y * np.roll(x, -1))


def generalized_euler_centerline(
    params,
    radius,
    output_x,
    n_segments=N_SEGMENTS,
    n_raw_points=N_RAW_POINTS,
):
    params = np.asarray(params, dtype=float).ravel()

    if params.size != n_segments:
        raise ValueError("Expected %d geometry parameters, got %d" % (n_segments, params.size))

    control_u = np.linspace(0.0, 1.0, params.size)
    node_u = np.linspace(0.0, 1.0, n_segments + 1)
    control_interp = sp.interpolate.CubicSpline(control_u, params, bc_type="natural")
    kappa_shape = np.exp(CURVATURE_CONTROL_SCALE * control_interp(node_u))

    lengths = np.full(n_segments, 0.5 * np.pi * radius / n_segments)
    raw_turn = np.sum(0.5 * (kappa_shape[:-1] + kappa_shape[1:]) * lengths)
    if raw_turn <= 0.0 or not np.isfinite(raw_turn):
        raise ValueError("Invalid raw turn computed from curvature controls.")

    kappa_nodes = kappa_shape * ((0.5 * np.pi) / raw_turn)

    points = []
    theta0 = 0.0
    x0 = 0.0
    y0 = 0.0
    points_per_segment = max(4, int(np.ceil(n_raw_points / n_segments)))

    for i in range(n_segments):
        length = lengths[i]
        kappa0 = kappa_nodes[i]
        kappa1 = kappa_nodes[i + 1]
        s = np.linspace(0.0, length, points_per_segment)

        theta = theta0 + kappa0 * s + 0.5 * (kappa1 - kappa0) / length * s**2
        x = x0 + _cumtrapz(np.cos(theta), s)
        y = y0 + _cumtrapz(np.sin(theta), s)

        if i == 0:
            points.append(np.column_stack((x, y)))
        else:
            points.append(np.column_stack((x[1:], y[1:])))

        x0 = x[-1]
        y0 = y[-1]
        theta0 = theta[-1]

    center = np.vstack(points)

    if abs(center[-1, 0]) > 0.0:
        center[:, 0] *= output_x / center[-1, 0]
    if abs(center[-1, 1]) > 0.0:
        center[:, 1] *= radius / center[-1, 1]

    center[0] = [0.0, 0.0]
    center[-1] = [output_x, radius]
    return center


def resample_centerline(center, output_x, radius, n=N_CENTERLINE_POINTS):
    deltas = np.diff(center, axis=0)
    ds = np.sqrt(np.sum(deltas**2, axis=1))
    s = np.concatenate(([0.0], np.cumsum(ds)))

    keep = np.concatenate(([True], np.diff(s) > 1e-15))
    s = s[keep]
    center = center[keep]

    s_new = np.linspace(0.0, s[-1], n)
    x_new = sp.interpolate.CubicSpline(s, center[:, 0], bc_type="natural")(s_new)
    y_new = sp.interpolate.CubicSpline(s, center[:, 1], bc_type="natural")(s_new)

    smooth = np.column_stack((x_new, y_new))
    smooth[0] = [0.0, 0.0]
    smooth[-1] = [output_x, radius]
    return smooth


def centerline_to_polygon(center, width):
    dx = np.gradient(center[:, 0], edge_order=2)
    dy = np.gradient(center[:, 1], edge_order=2)
    ds = np.sqrt(dx**2 + dy**2)
    ds[ds == 0.0] = 1.0

    tx = dx / ds
    ty = dy / ds
    normals = np.column_stack((-ty, tx))

    outer = center + 0.5 * width * normals
    inner = center - 0.5 * width * normals
    polygon = np.vstack((outer, inner[::-1]))

    if _polygon_area(polygon) < 0.0:
        polygon = polygon[::-1]
        outer = polygon[: len(center)]
        inner = polygon[len(center) :][::-1]

    return polygon, outer, inner


def tangent_angle_deg(center, at_end=False):
    vec = center[-1] - center[-2] if at_end else center[1] - center[0]
    return np.degrees(np.arctan2(vec[1], vec[0]))


def validate_geometry(name, params, radius, output_x):
    raw_center = generalized_euler_centerline(params, radius=radius, output_x=output_x)
    smooth_center = resample_centerline(raw_center, output_x=output_x, radius=radius)
    polygon, outer, inner = centerline_to_polygon(smooth_center, WG_WIDTH)

    widths = np.sqrt(np.sum((outer - inner) ** 2, axis=1))
    raw_ds = np.sqrt(np.sum(np.diff(raw_center, axis=0) ** 2, axis=1))
    smooth_ds = np.sqrt(np.sum(np.diff(smooth_center, axis=0) ** 2, axis=1))

    summary = {
        "name": name,
        "raw_center": raw_center,
        "smooth_center": smooth_center,
        "polygon": polygon,
        "endpoint_error": float(np.linalg.norm(smooth_center[-1] - np.array([output_x, radius]))),
        "raw_start_angle_deg": float(tangent_angle_deg(raw_center, at_end=False)),
        "raw_end_angle_deg": float(tangent_angle_deg(raw_center, at_end=True)),
        "smooth_start_angle_deg": float(tangent_angle_deg(smooth_center, at_end=False)),
        "smooth_end_angle_deg": float(tangent_angle_deg(smooth_center, at_end=True)),
        "width_mean_um": float(np.mean(widths) * 1e6),
        "width_std_nm": float(np.std(widths) * 1e9),
        "raw_min_step_nm": float(np.min(raw_ds) * 1e9),
        "smooth_min_step_nm": float(np.min(smooth_ds) * 1e9),
        "all_finite": bool(np.isfinite(raw_center).all() and np.isfinite(smooth_center).all() and np.isfinite(polygon).all()),
    }

    summary["passes_basic_checks"] = bool(
        summary["all_finite"]
        and summary["endpoint_error"] < 1e-15
        and abs(summary["raw_start_angle_deg"]) < 0.5
        and abs(summary["raw_end_angle_deg"] - 90.0) < 0.5
    )
    return summary


def plot_case(ax, result, radius, output_x):
    raw_center = result["raw_center"]
    smooth_center = result["smooth_center"]
    polygon = result["polygon"]

    ax.fill(polygon[:, 0] * 1e6, polygon[:, 1] * 1e6, color="lightsteelblue", alpha=0.55)
    ax.plot(raw_center[:, 0] * 1e6, raw_center[:, 1] * 1e6, "--", lw=1.0, color="0.45", label="raw centerline")
    ax.plot(smooth_center[:, 0] * 1e6, smooth_center[:, 1] * 1e6, lw=2.0, color="navy", label="smoothed centerline")

    ax.plot([-WG_LENGTH * 1e6, 0.0], [0.0, 0.0], color="darkgreen", lw=3, label="input guide")
    ax.plot([output_x * 1e6, output_x * 1e6], [radius * 1e6, (radius + WG_LENGTH) * 1e6], color="darkred", lw=3, label="output guide")

    ax.scatter([0.0, output_x * 1e6], [0.0, radius * 1e6], color="black", s=20, zorder=5)
    ax.set_aspect("equal", adjustable="box")
    ax.grid(True, alpha=0.25)
    ax.set_title(result["name"])
    ax.set_xlabel("x (um)")
    ax.set_ylabel("y (um)")

    note = (
        "raw: %.2f° -> %.2f°\n"
        "smooth: %.2f° -> %.2f°\n"
        "width: %.4f um ± %.2f nm"
    ) % (
        result["raw_start_angle_deg"],
        result["raw_end_angle_deg"],
        result["smooth_start_angle_deg"],
        result["smooth_end_angle_deg"],
        result["width_mean_um"],
        result["width_std_nm"],
    )
    ax.text(0.02, 0.98, note, transform=ax.transAxes, va="top", ha="left", fontsize=8,
            bbox={"facecolor": "white", "alpha": 0.85, "edgecolor": "0.8"})


def build_cases(base_output_x, radius):
    u = np.linspace(0.0, 1.0, N_SEGMENTS)
    return [
        ("constant-radius seed", np.zeros(N_SEGMENTS), base_output_x),
        ("front-loaded curvature", 0.65 * (1.0 - u), base_output_x),
        ("back-loaded curvature", 0.65 * u[::-1], 1.2 * base_output_x),
        ("oscillatory control", 0.45 * np.sin(2.0 * np.pi * u), 0.8 * base_output_x),
    ]


def main():
    parser = argparse.ArgumentParser(description="Plot and validate generalized-Euler bend geometries.")
    parser.add_argument("--radius", type=float, default=50e-6, help="Vertical bend endpoint in meters.")
    parser.add_argument("--output-x", type=float, default=None, help="Horizontal bend endpoint in meters.")
    parser.add_argument(
        "--save",
        type=Path,
        default=PROJECT_ROOT / "artifacts" / "plots" / "tests" / "test_geometry.png",
        help="Where to save the plot.",
    )
    parser.add_argument("--show", action="store_true", help="Display the matplotlib window after saving.")
    args = parser.parse_args()

    output_x = args.radius if args.output_x is None else args.output_x
    cases = build_cases(output_x, args.radius)
    results = [validate_geometry(name, params, args.radius, case_output_x) for name, params, case_output_x in cases]

    fig, axes = plt.subplots(2, 2, figsize=(12, 10), constrained_layout=True)
    for ax, result, (_, _, case_output_x) in zip(axes.flat, results, cases):
        plot_case(ax, result, radius=args.radius, output_x=case_output_x)

    handles, labels = axes.flat[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper center", ncol=4)
    fig.suptitle("Generalized-Euler bend geometry sanity check", fontsize=14)
    args.save.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.save, dpi=200)

    print("Saved plot to %s" % args.save)
    for result in results:
        print(
            "%-22s finite=%s basic=%s raw=(%.3f, %.3f) smooth=(%.3f, %.3f) width=%.6f um" % (
                result["name"],
                result["all_finite"],
                result["passes_basic_checks"],
                result["raw_start_angle_deg"],
                result["raw_end_angle_deg"],
                result["smooth_start_angle_deg"],
                result["smooth_end_angle_deg"],
                result["width_mean_um"],
            )
        )

    if args.show:
        plt.show()
    else:
        plt.close(fig)


if __name__ == "__main__":
    main()
