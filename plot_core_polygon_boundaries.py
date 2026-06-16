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


def _edge_lengths(points):
    edges = np.roll(points, -1, axis=0) - points
    return np.sqrt(np.sum(edges**2, axis=1))


def _load_params(path, n):
    if path is None:
        return np.zeros(n)
    params = np.asarray(np.load(path) if path.endswith(".npy") else np.loadtxt(path), dtype=float).ravel()
    if params.size != n:
        raise ValueError("Expected %d params, got %d from %s" % (n, params.size, path))
    return params


def _annotate_ports(ax, footprint, input_arm, output_arm, width):
    ports = {
        "input": (-input_arm, 0.0),
        "bend start": (0.0, 0.0),
        "bend end": (footprint, footprint),
        "output": (footprint, footprint + output_arm),
        "fom": (footprint, footprint + output_arm - 1e-6),
    }
    for label, (x, y) in ports.items():
        ax.plot(x*1e6, y*1e6, "x", color="black", markersize=6)
        ax.text(x*1e6, y*1e6, " " + label, fontsize=8, va="center")

    ax.axvline(-input_arm*1e6, color="0.65", linestyle="--", linewidth=0.8)
    ax.axvline(0, color="0.8", linestyle="--", linewidth=0.8)
    ax.axvline(footprint*1e6, color="0.65", linestyle="--", linewidth=0.8)
    ax.axhline(0, color="0.8", linestyle="--", linewidth=0.8)
    ax.axhline(footprint*1e6, color="0.8", linestyle="--", linewidth=0.8)
    ax.axhline((footprint + output_arm)*1e6, color="0.65", linestyle="--", linewidth=0.8)
    ax.text(-input_arm*1e6, -width*1e6, "x=%.3gum" % (-input_arm*1e6), fontsize=8, ha="left")
    ax.text(
        footprint*1e6,
        (footprint + output_arm + width)*1e6,
        "x=%.3gum / y=%.3gum" % (footprint*1e6, (footprint + output_arm)*1e6),
        fontsize=8,
        ha="center",
    )


def _plot_polygon(ax, points, center, title, footprint, input_arm, output_arm, width, color_by_index=True):
    ax.plot(points[:, 0]*1e6, points[:, 1]*1e6, "-", color="0.55", linewidth=0.75, label="polygon order")
    if color_by_index:
        sc = ax.scatter(points[:, 0]*1e6, points[:, 1]*1e6, c=np.arange(points.shape[0]), s=5, cmap="turbo", label="vertices")
    else:
        sc = ax.scatter(points[:, 0]*1e6, points[:, 1]*1e6, s=5, color="#2563eb", label="vertices")
    ax.plot(center[:, 0]*1e6, center[:, 1]*1e6, "k-", linewidth=1.1, label="centerline")
    _annotate_ports(ax, footprint, input_arm, output_arm, width)
    ax.set_title(title)
    ax.set_xlabel("x (um)")
    ax.set_ylabel("y (um)")
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.25)
    return sc


def make_plots(args):
    params = _load_params(args.params, args.n)
    points, center, theta, bend_center, bend_theta = single_core_polygon(
        params=params,
        footprint=args.footprint,
        wg_width=args.width,
        input_arm_length=args.input_arm,
        output_arm_length=args.output_arm,
        samples=args.samples,
    )
    diagnostics = polygon_diagnostics(points)
    edge_lengths = _edge_lengths(points)
    worst_edges = np.argsort(edge_lengths)[-args.annotate_edges:][::-1]

    output_dir = Path(args.output_dir)
    output_dir.mkdir(exist_ok=True)

    np.savetxt(
        output_dir / "single_core_polygon_points_um.csv",
        np.column_stack((np.arange(points.shape[0]), points*1e6)),
        delimiter=",",
        header="idx,x_um,y_um",
        comments="",
    )
    np.savetxt(
        output_dir / "single_core_centerline_um.csv",
        np.column_stack((np.arange(center.shape[0]), center*1e6)),
        delimiter=",",
        header="idx,x_um,y_um",
        comments="",
    )

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(11, 9))
    sc = _plot_polygon(
        ax,
        points,
        center,
        "Single core polygon, full boundary",
        args.footprint,
        args.input_arm,
        args.output_arm,
        args.width,
    )
    ax.set_xlim((-args.input_arm - 2e-6)*1e6, (args.footprint + 4e-6)*1e6)
    ax.set_ylim((-4e-6)*1e6, (args.footprint + args.output_arm + 3e-6)*1e6)
    fig.colorbar(sc, ax=ax, label="polygon vertex index")
    fig.tight_layout()
    fig.savefig(output_dir / "01_full_boundary_indexed.png", dpi=260)
    plt.close(fig)

    zooms = [
        ("02_input_join_zoom.png", "input arm to bend boundary", (-args.input_arm*1e6 - 0.5, 5.5), (-1.8, 1.8)),
        ("03_bend_body_zoom.png", "bend body boundary", (0.3*args.footprint*1e6, 0.75*args.footprint*1e6), (0.1*args.footprint*1e6, 0.6*args.footprint*1e6)),
        ("04_output_join_zoom.png", "bend to output boundary", (args.footprint*1e6 - 2.5, args.footprint*1e6 + 2.5), (args.footprint*1e6 - 2.5, (args.footprint + args.output_arm)*1e6 + 0.8)),
        ("05_output_end_zoom.png", "output end cap boundary", (args.footprint*1e6 - 1.2, args.footprint*1e6 + 1.2), ((args.footprint + args.output_arm)*1e6 - 1.2, (args.footprint + args.output_arm)*1e6 + 0.8)),
    ]
    for filename, title, xlim, ylim in zooms:
        fig, ax = plt.subplots(figsize=(9, 7))
        sc = _plot_polygon(
            ax,
            points,
            center,
            title,
            args.footprint,
            args.input_arm,
            args.output_arm,
            args.width,
        )
        ax.set_xlim(*xlim)
        ax.set_ylim(*ylim)
        fig.colorbar(sc, ax=ax, label="polygon vertex index")
        fig.tight_layout()
        fig.savefig(output_dir / filename, dpi=260)
        plt.close(fig)

    fig, ax = plt.subplots(figsize=(11, 9))
    _plot_polygon(
        ax,
        points,
        center,
        "Worst edge annotations",
        args.footprint,
        args.input_arm,
        args.output_arm,
        args.width,
        color_by_index=False,
    )
    for idx in worst_edges:
        p0 = points[idx]*1e6
        p1 = points[(idx + 1) % points.shape[0]]*1e6
        mid = 0.5*(p0 + p1)
        ax.plot([p0[0], p1[0]], [p0[1], p1[1]], color="red", linewidth=1.6)
        ax.text(mid[0], mid[1], "%d %.0fnm" % (idx, edge_lengths[idx]*1e9), fontsize=7, color="red")
    ax.set_xlim((-args.input_arm - 2e-6)*1e6, (args.footprint + 4e-6)*1e6)
    ax.set_ylim((-4e-6)*1e6, (args.footprint + args.output_arm + 3e-6)*1e6)
    fig.tight_layout()
    fig.savefig(output_dir / "06_worst_edges.png", dpi=260)
    plt.close(fig)

    print("Diagnostics:")
    for key, value in diagnostics.items():
        if key == "bbox":
            print("  bbox_um =", tuple(v*1e6 for v in value))
        elif key.endswith("edge"):
            print("  %s_nm = %.6g" % (key, value*1e9))
        else:
            print("  %s = %s" % (key, value))
    print("  center_start_um =", center[0]*1e6)
    print("  bend_start_um =", bend_center[0]*1e6)
    print("  bend_end_um =", bend_center[-1]*1e6)
    print("  center_end_um =", center[-1]*1e6)
    print("  output_x_range_last_50_um =", (np.min(center[-50:, 0])*1e6, np.max(center[-50:, 0])*1e6))
    print("Plots written to:", output_dir)


def main():
    parser = argparse.ArgumentParser(description="Generate boundary verification plots for the single core polygon.")
    parser.add_argument("--params", default=None)
    parser.add_argument("--n", type=int, default=64)
    parser.add_argument("--footprint", type=float, default=DEFAULT_FOOTPRINT)
    parser.add_argument("--width", type=float, default=sidewall_bottom_width())
    parser.add_argument("--input-arm", type=float, default=DEFAULT_INPUT_ARM_LENGTH)
    parser.add_argument("--output-arm", type=float, default=DEFAULT_OUTPUT_ARM_LENGTH)
    parser.add_argument("--samples", type=int, default=1600)
    parser.add_argument("--annotate-edges", type=int, default=12)
    parser.add_argument("--output-dir", default="core_polygon_boundary_plots")
    args = parser.parse_args()
    make_plots(args)


if __name__ == "__main__":
    main()
