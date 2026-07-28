import sys
import os
import numpy as np
import gdstk
from scipy.interpolate import PchipInterpolator

sys.path.insert(0, r"C:\Program Files\ANSYS Inc\v251\Lumerical\api\python")
sys.path.insert(0, r"C:\Users\PIC\Desktop\WeDaBest\LumOpt")

from lumopt.utilities.wavelengths import Wavelengths
from lumopt.geometries.polygon import FunctionDefinedPolygon
from lumopt.figures_of_merit.modematch import ModeMatch
from lumopt.optimizers.generic_optimizers import ScipyOptimizers
from lumopt.optimization import Optimization


def _sigmoid(x):
    return 1 / (1 + np.exp(-x))


def _polygon_area(points: np.ndarray) -> float:
    x = points[:, 0]
    y = points[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - y * np.roll(x, -1))


def _num(v):
    return f"{float(v):.15g}"


# ============================================================
# GOSPEL GEOMETRY PARAMETERS
# Match the FDTD verification script:
#   W_top = 0.9 um
#   H = 0.3 um
#   sidewall = 70 deg
#   LN slab = 0.3 um
#   SiO2 BOX = 4.7 um
#   air background
#
# Optimization uses varFDTD + FunctionDefinedPolygon.
# Final export uses GDS bottom footprint + Layer Builder sidewall.
# ============================================================

R = 25e-6

W_top = 0.9e-6
H = 0.3e-6
theta_sidewall_deg = 70.0

T_LN_slab = 0.3e-6
T_BOX = 4.7e-6

n_air = 1.00
n_SiO2 = 1.44
n_ln = 2.20

# Bottom footprint width for 70 degree sidewall.
# This is the width seen by varFDTD optimization and written to GDS.
W_bot = W_top + 2 * H / np.tan(np.deg2rad(theta_sidewall_deg))
W = W_bot

L_in = 8e-6
L_out = 8e-6
WG_OVERLAP = 0.2e-6

wavelengths = Wavelengths(start=1550e-9, stop=1550e-9, points=1)

script_dir = os.path.dirname(__file__)
base_template = os.path.join(script_dir, "bent_optimized_waveguide.lsf")
if not os.path.exists(base_template):
    raise FileNotFoundError("Could not find base.lsf in script directory.")

base_runtime_script = os.path.join(script_dir, "base_runtime.lsf")


# ============================================================
# OPTIMIZABLE 90 DEGREE BEND
# ============================================================

num_segments = 100

# Prior final parameters from your old run.
FINAL_PARAMETERS = np.array([
    8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
    8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
    7.61722473, 8, 8, 7.15012409, 7.13035446, 7.28150568, 7.05481233, 7.01284343,
    6.03618893, 5.65930189, 5.25973473, 5.42884294, 5.70837556, 4.34931513, 4.08031433, 3.77154924,
    3.97284412, 3.19551698, 3.84706762, 2.87007739, 2.6051482, 3.30981182, 2.48654471, 1.58624323,
    0.43604423, 1.58228282, 1.61901089, 1.64877403, 1.32884313, 0.20761352, 0.35015352, 1.79662236,
    1.53864407, 0.66675978, -0.81190193, -0.89666845, 0.75307424, 0.69565405, -0.31614019, -0.71173202,
    -0.09031953, 0.5942629, 0.86410944, 0.51041575, -0.37324764, -0.26461599, -0.22303369, 0.57406635,
    1.60814363, 1.6465984, 1.2783256, 1.58787588, 0.47968965, 0.14519836, 1.67400531, 1.87038509,
    1.68976327, 2.10630437, 2.18942169, 1.68427693, 2.61159037, 2.6765302, 3.02271604, 2.80814316,
    2.81205414, 2.23836732, 3.63169119, 3.05323522, 3.38069699, 3.87437199, 4.12676747, 4.05052522,
    4.35699329, 4.35016011, 4.5, 4.5
], dtype=float)

# Start from the previous solution so the fixed base/output/FOM position matches the geometry.
# Set this False if you want to restart from the old all-5 initialization.
START_FROM_PRIOR_FINAL = True
if START_FROM_PRIOR_FINAL:
    initial_params = FINAL_PARAMETERS.copy()
else:
    initial_params = np.full(num_segments, 5.0)

bounds = [(-8.0, 8.0)] * num_segments

s_total = (np.pi / 2) * R
s_knots = np.linspace(0.0, s_total, num_segments + 1)
centerline_eval_points = 2000
kappa_slew_limit = 2.05e9

# Critical fix:
# The old script only scaled curvature down if angle_span > pi/2.
# This forced GDS output seam because old final angle was ~82 deg.
# New behavior always scales to exactly 90 deg.
FORCE_FINAL_ANGLE_TO_90 = True


def _centerline_from_params(params=initial_params):
    params = np.asarray(params)

    ds_segment = s_total / num_segments
    delta_kappa = _sigmoid(params) * (kappa_slew_limit * ds_segment)

    kappa_knots = np.zeros(num_segments + 1)
    kappa_knots[1:] = np.cumsum(delta_kappa)

    s_fine = np.linspace(0.0, s_total, centerline_eval_points)
    kappa_f = PchipInterpolator(s_knots, kappa_knots)
    kappa_dense = kappa_f(s_fine)

    raw_angle_span = np.trapezoid(kappa_dense, s_fine)
    if raw_angle_span <= 0 or not np.isfinite(raw_angle_span):
        raw_angle_span = np.pi / 2

    if FORCE_FINAL_ANGLE_TO_90:
        kappa_scale = (np.pi / 2) / raw_angle_span
    else:
        kappa_scale = min(1.0, (np.pi / 2) / raw_angle_span)

    kappa_knots *= kappa_scale
    kappa_f = PchipInterpolator(s_knots, kappa_knots)
    kappa_dense = kappa_f(s_fine)

    curv_derivative = np.gradient(kappa_dense, s_fine, edge_order=2)

    ds = np.diff(s_fine)
    dtheta = 0.5 * (kappa_dense[:-1] + kappa_dense[1:]) * ds
    theta = np.concatenate(([0.0], np.cumsum(dtheta)))

    dx = 0.5 * (np.cos(theta[:-1]) + np.cos(theta[1:])) * ds
    dy = 0.5 * (np.sin(theta[:-1]) + np.sin(theta[1:])) * ds
    x = np.concatenate(([0.0], np.cumsum(dx)))
    y = np.concatenate(([0.0], np.cumsum(dy)))
    center = np.column_stack((x, y))

    return center, theta, kappa_knots, kappa_dense, curv_derivative, raw_angle_span, kappa_scale


def bend_polygon(params=initial_params):
    """Bend-only polygon used during LumOpt varFDTD optimization."""
    center, theta, kappa_knots, kappa_dense, curv_derivative, raw_angle_span, kappa_scale = _centerline_from_params(params)

    normal = np.column_stack((-np.sin(theta), np.cos(theta)))
    outer = center + (W / 2.0) * normal
    inner = center - (W / 2.0) * normal
    points = np.vstack((outer, inner[::-1]))

    if _polygon_area(points) < 0:
        points = points[::-1]

    bend_polygon._last_center = center
    bend_polygon._last_theta = theta
    bend_polygon._last_outer = outer
    bend_polygon._last_inner = inner
    bend_polygon._last_kappa_knots = kappa_knots
    bend_polygon._last_kappa_dense = kappa_dense
    bend_polygon._last_kappa_derivative = curv_derivative
    bend_polygon._last_raw_angle_span = raw_angle_span
    bend_polygon._last_kappa_scale = kappa_scale
    return points


def single_piece_device_polygon(params):
    """Final export polygon: input straight + bend + output straight as one GDS shape.

    This is only for final verification/export, not for LumOpt optimization.
    It removes the separate bend/output overlap seam.
    """
    _ = bend_polygon(params)

    bend_center = bend_polygon._last_center
    bend_theta = bend_polygon._last_theta
    final_theta = bend_theta[-1]
    bend_end = bend_center[-1]

    # Input straight ending at bend start.
    n_in = 120
    input_x = np.linspace(-L_in, 0.0, n_in, endpoint=False)
    input_center = np.column_stack((input_x, np.zeros_like(input_x)))
    input_theta = np.zeros(n_in)

    # Output straight tangent-continuous with bend end.
    n_out = 160
    out_dir = np.array([np.cos(final_theta), np.sin(final_theta)])
    t = np.linspace(0.0, L_out, n_out + 1)[1:]
    output_center = bend_end + t[:, None] * out_dir[None, :]
    output_theta = np.full(n_out, final_theta)

    center = np.vstack((input_center, bend_center, output_center))
    theta = np.concatenate((input_theta, bend_theta, output_theta))

    normal = np.column_stack((-np.sin(theta), np.cos(theta)))
    outer = center + (W / 2.0) * normal
    inner = center - (W / 2.0) * normal
    points = np.vstack((outer, inner[::-1]))

    if _polygon_area(points) < 0:
        points = points[::-1]

    single_piece_device_polygon._last_center = center
    single_piece_device_polygon._last_theta = theta
    single_piece_device_polygon._last_bend_end = bend_end
    return points


def runtime_vars_from_params(params):
    _ = bend_polygon(params)
    end_x, end_y = bend_polygon._last_center[-1]

    return {
        "WG_OUT_X": end_x,
        "WG_OUT_Y": end_y + L_out / 2 - WG_OVERLAP / 2,

        "FOM_X": end_x,
        "FOM_Y": end_y + L_out - 1e-6,

        "FIELD_X": max(end_x, 0.0) / 2.0,
        "FIELD_Y": max(end_y, 0.0) / 2.0,

        "FDTD_X": max(end_x, 0.0) / 2.0,
        "FDTD_Y": max(end_y, 0.0) / 2.0,

        # Keep enough room for source, bend, vertical output, and mode monitor.
        "FDTD_X_SPAN": max(45e-6, max(end_x, 0.0) + 14e-6),
        "FDTD_Y_SPAN": max(45e-6, max(end_y, 0.0) + L_out + 8e-6),

        "MESH_X": max(end_x, 0.0) / 2.0,
        "MESH_Y": max(end_y, 0.0) / 2.0,

        "MESH_X_SPAN": max(R + 12e-6, max(end_x, 0.0) + 12e-6),
        "MESH_Y_SPAN": max(R + 12e-6, max(end_y, 0.0) + 12e-6),
    }


def write_runtime_base_script(params):
    rv = runtime_vars_from_params(params)

    with open(base_template, "r") as fh:
        template = fh.read()

    runtime_script = template
    for k, v in rv.items():
        runtime_script = runtime_script.replace(f"__{k}__", _num(v))

    tokens = [
        "__WG_OUT_X__", "__WG_OUT_Y__", "__FOM_X__", "__FOM_Y__",
        "__FIELD_X__", "__FIELD_Y__", "__FDTD_X__", "__FDTD_Y__",
        "__FDTD_X_SPAN__", "__FDTD_Y_SPAN__", "__MESH_X__", "__MESH_Y__",
        "__MESH_X_SPAN__", "__MESH_Y_SPAN__"
    ]
    missing = [tok for tok in tokens if tok in runtime_script]
    if missing:
        raise RuntimeError(f"Runtime base script token replacement incomplete. Missing: {missing}")

    with open(base_runtime_script, "w") as fh:
        fh.write(runtime_script)

    print(f"Wrote runtime base script: {base_runtime_script}")
    print("Runtime positions:")
    for k, v in rv.items():
        print(f"  {k} = {_num(v)}")
    return base_runtime_script


def write_final_gds(params, filename="optimized_bend.gds"):
    """Write final single-piece bottom-footprint GDS for Layer Builder verification."""
    points = single_piece_device_polygon(params)
    points_um = points * 1e6
    center_um = single_piece_device_polygon._last_center * 1e6

    lib = gdstk.Library(unit=1e-6, precision=1e-9)
    cell = lib.new_cell("OPTIMIZED_TFLN_BEND_SINGLE_PIECE")

    poly = gdstk.Polygon(points_um, layer=1, datatype=0)
    for p in poly.fracture(max_points=199, precision=1e-6):
        cell.add(p)

    cell.add(gdstk.Label("IN", center_um[0], layer=66))
    cell.add(gdstk.Label("OUT", center_um[-1], layer=66))

    lib.write_gds(filename)

    print(f"Wrote final single-piece GDS: {filename}")
    print(f"GDS footprint width W_bot = {W * 1e6:.6f} um")
    print(f"Target top width = {W_top * 1e6:.6f} um")
    print(f"Ridge height = {H * 1e6:.6f} um")
    print(f"Sidewall angle = {theta_sidewall_deg:.2f} deg")
    print(f"Raw angle before scaling = {np.rad2deg(bend_polygon._last_raw_angle_span):.6f} deg")
    print(f"Final bend tangent angle = {np.rad2deg(bend_polygon._last_theta[-1]):.6f} deg")


def save_geometry_plot(params, filename="final_bend_geometry.png"):
    try:
        import matplotlib.pyplot as plt
        import matplotlib.patches as patches
    except ImportError:
        print("matplotlib not installed; skipping geometry plot.")
        return

    points = single_piece_device_polygon(params)
    center = single_piece_device_polygon._last_center

    fig, ax = plt.subplots(1, 1, figsize=(10, 10))
    poly_patch = patches.Polygon(
        points * 1e6,
        closed=True,
        edgecolor="blue",
        facecolor="lightblue",
        alpha=0.7,
        linewidth=1.5,
    )
    ax.add_patch(poly_patch)
    ax.plot(center[:, 0] * 1e6, center[:, 1] * 1e6, "r-", linewidth=1.5, label="single-piece centerline")
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.3)
    ax.set_xlabel("x (um)")
    ax.set_ylabel("y (um)")
    ax.set_title("Optimized TFLN bend, single continuous polygon")
    ax.legend()
    plt.tight_layout()
    plt.savefig(filename, dpi=300)
    plt.close()
    print(f"Saved geometry plot: {filename}")


# ---------- LUMOPT SETUP ----------
geometry = FunctionDefinedPolygon(
    func=bend_polygon,
    initial_params=initial_params,
    bounds=bounds,
    z=H / 2,
    depth=H,
    eps_out=n_air ** 2,
    eps_in=n_ln ** 2,
    edge_precision=5,
    dx=1e-9,
)

fom = ModeMatch(
    monitor_name="fom",
    mode_number=1,
    direction="Forward",
    multi_freq_src=False,
    target_T_fwd=lambda wl: np.ones(wl.size),
    norm_p=1,
)

optimizer = ScipyOptimizers(
    max_iter=40,
    method="L-BFGS-B",
    scaling_factor=1,
    pgtol=1e-9,
)

# ---------- RUN CONTROL ----------
# First debug by setting WRITE_BASE_ONLY=True and running base_runtime.lsf manually in Lumerical.
WRITE_BASE_ONLY = False
RUN_OPTIMIZATION = True

base_script = write_runtime_base_script(initial_params)

if WRITE_BASE_ONLY:
    print("WRITE_BASE_ONLY=True, stopping before LumOpt run.")
    write_final_gds(initial_params, os.path.join(script_dir, "optimized_bend.gds"))
    save_geometry_plot(initial_params, os.path.join(script_dir, "final_bend_geometry.png"))
    raise SystemExit

opt = Optimization(
    base_script=base_script,
    wavelengths=wavelengths,
    fom=fom,
    geometry=geometry,
    optimizer=optimizer,
    use_var_fdtd=True,
    hide_fdtd_cad=False,
    use_deps=True,
)

if RUN_OPTIMIZATION:
    opt.init_plotter()
    final_fom, final_params = opt.run()
    np.save(os.path.join(script_dir, "final_params.npy"), final_params)
    write_final_gds(final_params, os.path.join(script_dir, "optimized_bend.gds"))
    save_geometry_plot(final_params, os.path.join(script_dir, "final_bend_geometry.png"))
else:
    write_final_gds(initial_params, os.path.join(script_dir, "optimized_bend.gds"))
    save_geometry_plot(initial_params, os.path.join(script_dir, "final_bend_geometry.png"))
