import argparse
import os
import re
from pathlib import Path

LOCAL_CACHE = Path(__file__).resolve().parent / ".plot_cache"
LOCAL_CACHE.mkdir(exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(LOCAL_CACHE / "matplotlib"))
os.environ.setdefault("XDG_CACHE_HOME", str(LOCAL_CACHE / "xdg"))

import numpy as np
from scipy.interpolate import PchipInterpolator

import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection


# Geometry constants mirrored from optimize.py and base.lsf.
R = 25e-6
W = 1.83e-6
H = 1.0e-6
L_IN = 8e-6
L_OUT = 8e-6
WG_OVERLAP = 0.2e-6
MESH_SIZE = 50e-9

NUM_SEGMENTS = 100
CENTERLINE_EVAL_POINTS = 2000
KAPPA_SLEW_LIMIT = 2.05e9

S_TOTAL = (np.pi / 2.0) * R
S_KNOTS = np.linspace(0.0, S_TOTAL, NUM_SEGMENTS + 1)


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _polygon_area(points):
    x = points[:, 0]
    y = points[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - y * np.roll(x, -1))


def load_final_parameters(path):
    text = Path(path).read_text()
    match = re.search(r"FINAL_PARAMETERS\s*=\s*np\.array\(\s*\[(.*?)\]\s*\)", text, re.S)
    if not match:
        raise ValueError(f"Could not find FINAL_PARAMETERS = np.array([...]) in {path}")

    values = [float(value) for value in re.findall(r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?", match.group(1))]
    params = np.asarray(values, dtype=float)
    if params.size != NUM_SEGMENTS:
        raise ValueError(f"Expected {NUM_SEGMENTS} parameters, found {params.size}")
    return params


def bend_geometry(params):
    """Reconstruct the same optimized 90 degree bend used by LumOpt."""
    params = np.asarray(params, dtype=float)
    ds_segment = S_TOTAL / NUM_SEGMENTS
    delta_kappa = _sigmoid(params) * (KAPPA_SLEW_LIMIT * ds_segment)

    kappa_knots = np.zeros(NUM_SEGMENTS + 1)
    kappa_knots[1:] = np.cumsum(delta_kappa)

    s_fine = np.linspace(0.0, S_TOTAL, CENTERLINE_EVAL_POINTS)
    kappa_f = PchipInterpolator(S_KNOTS, kappa_knots)
    kappa_dense = kappa_f(s_fine)

    angle_span = np.trapezoid(kappa_dense, s_fine)
    if angle_span <= 0 or not np.isfinite(angle_span):
        angle_span = np.pi / 2.0

    kappa_scale = min(1.0, (np.pi / 2.0) / angle_span)
    if kappa_scale < 1.0:
        kappa_knots *= kappa_scale
        kappa_f = PchipInterpolator(S_KNOTS, kappa_knots)
        kappa_dense = kappa_f(s_fine)

    ds = np.diff(s_fine)
    dtheta = 0.5 * (kappa_dense[:-1] + kappa_dense[1:]) * ds
    theta = np.concatenate(([0.0], np.cumsum(dtheta)))

    dx = 0.5 * (np.cos(theta[:-1]) + np.cos(theta[1:])) * ds
    dy = 0.5 * (np.sin(theta[:-1]) + np.sin(theta[1:])) * ds
    x = np.concatenate(([0.0], np.cumsum(dx)))
    y = np.concatenate(([0.0], np.cumsum(dy)))
    center = np.column_stack((x, y))

    normal = np.column_stack((-np.sin(theta), np.cos(theta)))
    outer = center + (W / 2.0) * normal
    inner = center - (W / 2.0) * normal
    polygon = np.vstack((outer, inner[::-1]))
    if _polygon_area(polygon) < 0:
        polygon = polygon[::-1]

    curvature_derivative = np.gradient(kappa_dense, s_fine, edge_order=2)
    return {
        "polygon": polygon,
        "center": center,
        "outer": outer,
        "inner": inner,
        "s": s_fine,
        "theta": theta,
        "kappa": kappa_dense,
        "kappa_knots": kappa_knots,
        "dkappa_ds": curvature_derivative,
    }


def runtime_regions(center):
    end_x, end_y = center[-1]
    return {
        "input wg": {
            "center": (-L_IN / 2.0 + WG_OVERLAP / 2.0, 0.0, H / 2.0),
            "span": (L_IN + WG_OVERLAP, W, H),
            "color": "#2f9e44",
            "alpha": 0.42,
        },
        "output wg": {
            "center": (end_x, end_y + L_OUT / 2.0 - WG_OVERLAP / 2.0, H / 2.0),
            "span": (W, L_OUT + WG_OVERLAP, H),
            "color": "#2f9e44",
            "alpha": 0.42,
        },
        "varFDTD": {
            "center": (max(end_x, 0.0) / 2.0, max(end_y, 0.0) / 2.0, H / 2.0),
            "span": (max(45e-6, max(end_x, 0.0) + 12e-6), max(45e-6, max(end_y, 0.0) + 12e-6), 4e-6),
            "color": "#845ef7",
            "alpha": 0.08,
        },
        "design mesh": {
            "center": (max(end_x, 0.0) / 2.0, max(end_y, 0.0) / 2.0, H / 2.0),
            "span": (max(R + 12e-6, max(end_x, 0.0) + 12e-6), max(R + 12e-6, max(end_y, 0.0) + 12e-6), H + 1e-6),
            "color": "#ff922b",
            "alpha": 0.10,
        },
        "source": {
            "x": -L_IN + 1e-6,
            "y0": -3e-6,
            "y1": 3e-6,
            "z": H / 2.0,
            "color": "#1c7ed6",
        },
        "fom monitor": {
            "x": end_x,
            "y": end_y + L_OUT - 1e-6,
            "x0": end_x - 3e-6,
            "x1": end_x + 3e-6,
            "z": H / 2.0,
            "color": "#d6336c",
        },
        "opt fields": {
            "center": (max(end_x, 0.0) / 2.0, max(end_y, 0.0) / 2.0, H / 2.0),
            "span": (R + 12e-6, R + 12e-6, 0.0),
            "color": "#0ca678",
            "alpha": 0.12,
        },
    }


def cuboid_faces(center, span):
    cx, cy, cz = center
    sx, sy, sz = span
    x0, x1 = cx - sx / 2.0, cx + sx / 2.0
    y0, y1 = cy - sy / 2.0, cy + sy / 2.0
    z0, z1 = cz - sz / 2.0, cz + sz / 2.0
    vertices = np.array(
        [
            [x0, y0, z0],
            [x1, y0, z0],
            [x1, y1, z0],
            [x0, y1, z0],
            [x0, y0, z1],
            [x1, y0, z1],
            [x1, y1, z1],
            [x0, y1, z1],
        ]
    )
    return [
        vertices[[0, 1, 2, 3]],
        vertices[[4, 5, 6, 7]],
        vertices[[0, 1, 5, 4]],
        vertices[[1, 2, 6, 5]],
        vertices[[2, 3, 7, 6]],
        vertices[[3, 0, 4, 7]],
    ]


def polygon_prism_faces(polygon, z0=0.0, z1=H, stride=5):
    top = np.column_stack((polygon[:, 0], polygon[:, 1], np.full(len(polygon), z1)))
    bottom = np.column_stack((polygon[::-1, 0], polygon[::-1, 1], np.full(len(polygon), z0)))

    side_polygon = polygon[::stride]
    if np.linalg.norm(side_polygon[0] - polygon[-1]) > 1e-18:
        side_polygon = np.vstack((side_polygon, polygon[-1]))

    sides = []
    for idx in range(len(side_polygon)):
        p0 = side_polygon[idx]
        p1 = side_polygon[(idx + 1) % len(side_polygon)]
        sides.append(
            np.array(
                [
                    [p0[0], p0[1], z0],
                    [p1[0], p1[1], z0],
                    [p1[0], p1[1], z1],
                    [p0[0], p0[1], z1],
                ]
            )
        )
    return [top, bottom] + sides


def add_poly_collection(ax, faces, color, alpha, edgecolor=None, linewidth=0.3):
    scaled_faces = [face * 1e6 for face in faces]
    collection = Poly3DCollection(
        scaled_faces,
        facecolors=color,
        edgecolors=edgecolor or color,
        linewidths=linewidth,
        alpha=alpha,
    )
    ax.add_collection3d(collection)
    return collection


def add_rect_outline_2d(ax, center, span, label, color, alpha=0.15):
    import matplotlib.patches as patches

    cx, cy, _ = center
    sx, sy, _ = span
    rect = patches.Rectangle(
        ((cx - sx / 2.0) * 1e6, (cy - sy / 2.0) * 1e6),
        sx * 1e6,
        sy * 1e6,
        facecolor=color,
        edgecolor=color,
        alpha=alpha,
        linewidth=1.4,
        label=label,
    )
    ax.add_patch(rect)


def equalize_3d_axes(ax, x_values, y_values, z_values):
    x_min, x_max = np.min(x_values), np.max(x_values)
    y_min, y_max = np.min(y_values), np.max(y_values)
    z_min, z_max = np.min(z_values), np.max(z_values)

    x_mid = 0.5 * (x_min + x_max)
    y_mid = 0.5 * (y_min + y_max)
    z_mid = 0.5 * (z_min + z_max)
    radius = 0.5 * max(x_max - x_min, y_max - y_min, z_max - z_min)

    ax.set_xlim(x_mid - radius, x_mid + radius)
    ax.set_ylim(y_mid - radius, y_mid + radius)
    ax.set_zlim(max(-0.5, z_mid - radius * 0.18), z_mid + radius * 0.18)


def make_plot(parameters_path, output_path, show=False):
    params = load_final_parameters(parameters_path)
    geom = bend_geometry(params)
    regions = runtime_regions(geom["center"])

    fig = plt.figure(figsize=(18, 9), constrained_layout=True)
    spec = fig.add_gridspec(1, 2, width_ratios=(1.35, 1.0))
    ax3d = fig.add_subplot(spec[0, 0], projection="3d")
    ax_top = fig.add_subplot(spec[0, 1])

    add_poly_collection(
        ax3d,
        polygon_prism_faces(geom["polygon"], z0=0.0, z1=H, stride=5),
        color="#4dabf7",
        alpha=0.72,
        edgecolor="#1971c2",
        linewidth=0.12,
    )
    ax3d.plot(
        geom["center"][:, 0] * 1e6,
        geom["center"][:, 1] * 1e6,
        np.full(len(geom["center"]), H * 1e6 + 0.08),
        color="#c92a2a",
        linewidth=2.0,
        label="bend centerline",
    )

    for name in ("input wg", "output wg", "varFDTD", "design mesh"):
        region = regions[name]
        add_poly_collection(
            ax3d,
            cuboid_faces(region["center"], region["span"]),
            color=region["color"],
            alpha=region["alpha"],
            linewidth=0.25,
        )

    source = regions["source"]
    ax3d.plot(
        [source["x"] * 1e6, source["x"] * 1e6],
        [source["y0"] * 1e6, source["y1"] * 1e6],
        [source["z"] * 1e6, source["z"] * 1e6],
        color=source["color"],
        linewidth=4,
        label="mode source",
    )
    fom = regions["fom monitor"]
    ax3d.plot(
        [fom["x0"] * 1e6, fom["x1"] * 1e6],
        [fom["y"] * 1e6, fom["y"] * 1e6],
        [fom["z"] * 1e6, fom["z"] * 1e6],
        color=fom["color"],
        linewidth=4,
        label="fom monitor",
    )

    x_extent = np.concatenate(
        [
            geom["polygon"][:, 0] * 1e6,
            np.array([-L_IN, regions["output wg"]["center"][0] + W]) * 1e6,
        ]
    )
    y_extent = np.concatenate(
        [
            geom["polygon"][:, 1] * 1e6,
            np.array([-W, regions["output wg"]["center"][1] + L_OUT / 2.0]) * 1e6,
        ]
    )
    equalize_3d_axes(ax3d, x_extent, y_extent, np.array([0.0, 4.0]))
    ax3d.set_xlabel("x (um)")
    ax3d.set_ylabel("y (um)")
    ax3d.set_zlabel("z (um)")
    ax3d.set_title("3D reconstruction of Lumerical simulated structure")
    ax3d.view_init(elev=28, azim=-54)
    ax3d.legend(loc="upper left")

    ax_top.fill(
        geom["polygon"][:, 0] * 1e6,
        geom["polygon"][:, 1] * 1e6,
        color="#74c0fc",
        alpha=0.7,
        label="optimized LN bend",
    )
    ax_top.plot(geom["center"][:, 0] * 1e6, geom["center"][:, 1] * 1e6, color="#c92a2a", linewidth=1.6)
    for name in ("input wg", "output wg", "varFDTD", "design mesh"):
        region = regions[name]
        add_rect_outline_2d(ax_top, region["center"], region["span"], name, region["color"], alpha=max(region["alpha"], 0.12))
    field = regions["opt fields"]
    add_rect_outline_2d(ax_top, field["center"], field["span"], "opt fields monitor", field["color"], alpha=0.16)
    ax_top.plot([source["x"] * 1e6, source["x"] * 1e6], [source["y0"] * 1e6, source["y1"] * 1e6], color=source["color"], linewidth=2.4)
    ax_top.plot([fom["x0"] * 1e6, fom["x1"] * 1e6], [fom["y"] * 1e6, fom["y"] * 1e6], color=fom["color"], linewidth=2.4)
    ax_top.set_aspect("equal", adjustable="box")
    ax_top.set_xlabel("x (um)")
    ax_top.set_ylabel("y (um)")
    ax_top.set_title("Top view: bend, base.lsf guides, monitors, mesh/FDTD")
    ax_top.grid(alpha=0.25)
    ax_top.legend(loc="upper left", fontsize=8)

    end_x, end_y = geom["center"][-1] * 1e6
    fig.suptitle(
        f"Optimized LN 90 degree bend | endpoint=({end_x:.2f}, {end_y:.2f}) um | W={W * 1e6:.2f} um | H={H * 1e6:.2f} um | mesh={MESH_SIZE * 1e9:.0f} nm",
        fontsize=14,
    )

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=260)
    if show:
        plt.show()
    plt.close(fig)
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Plot the optimized LumOpt/Lumerical bend geometry in 3D.")
    parser.add_argument("--parameters", default="parameters.txt", help="Path to parameters.txt containing FINAL_PARAMETERS.")
    parser.add_argument("--output", default="lumerical_structure_3d.png", help="Output image path.")
    parser.add_argument("--show", action="store_true", help="Open an interactive matplotlib window after saving.")
    args = parser.parse_args()

    output = make_plot(args.parameters, args.output, show=args.show)
    print(f"Saved 3D Lumerical structure demonstration to {output}")


if __name__ == "__main__":
    main()
