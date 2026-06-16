import argparse
import os
import sys

import numpy as np
from scipy.interpolate import PchipInterpolator

sys.path.insert(0, r"C:\Program Files\ANSYS Inc\v251\Lumerical\api\python")
sys.path.insert(0, r"C:\Users\PIC\Desktop\WeDaBest\LumOpt")

try:
    import gdstk
except ImportError:
    gdstk = None


def _sigmoid(x):
    x = np.clip(x, -60.0, 60.0)
    return 1.0 / (1.0 + np.exp(-x))


def _polygon_area(points):
    x = points[:, 0]
    y = points[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - y * np.roll(x, -1))


def _num(v):
    return f"{float(v):.15g}"


def cli_args():
    parser = argparse.ArgumentParser(description="3D FDTD LumOpt optimization for a 50 um TFLN bend.")
    parser.add_argument("--write-base-only", action="store_true")
    parser.add_argument("--no-run", action="store_true")
    parser.add_argument("--export-only", action="store_true")
    parser.add_argument("--load-only", action="store_true", help="Load FDTD with LumOpt geometry inserted, then stop before any simulation.")
    parser.add_argument("--load-base-only", action="store_true", help="Load only the runtime LSF base, without LumOpt geometry insertion.")
    parser.add_argument("--base-fom-only", action="store_true")
    parser.add_argument("--no-fom-report", action="store_true")
    parser.add_argument("--debug-geometry", action="store_true")
    parser.add_argument("--quick-test", action="store_true")
    parser.add_argument("--n", type=int, default=None)
    parser.add_argument("--max-iter", type=int, default=None)
    parser.add_argument("--samples", type=int, default=2000)
    parser.add_argument("--initial-param", type=float, default=0.0)
    parser.add_argument("--restart", action="store_true", help="Ignore FINAL_PARAMETERS and start from --initial-param.")
    parser.add_argument("--hide-cad", action="store_true")
    return parser.parse_args()


args = cli_args()
MAX_ITER = args.max_iter if args.max_iter is not None else (1 if args.quick_test else 40)

# ============================================================
# 3D FDTD GEOMETRY PARAMETERS
# ============================================================

R = 50e-6

# Cross-section values copied from bent_waveguide.py.
WG_width = 0.8e-6
Thickness = 0.6e-6
etch_depth = 0.3e-6
Angle = 70.0
T_BOX = 4.7e-6
T_LN_slab = Thickness - etch_depth
H = etch_depth

n_air = 1.00
n_ln = 2.20
OPTIMIZE_WIDTH = False
SHAPE_DERIVATIVE_STEP = 1.0e-3
USE_DEPS = True
REPORT_FOM_LOSS_DB = not args.no_fom_report

# The reference layer builder uses the GDS/pattern width with sidewall angle
# position reference set to Top. Keep the optimized footprint on that same basis.
W = WG_width

L_in = 5e-6
L_out = 5e-6
layout_padding = 5e-6

script_dir = os.path.dirname(os.path.abspath(__file__))
base_template = os.path.join(script_dir, "optimize_bent_waveguide_fdtd.lsf")
base_runtime_script = os.path.join(script_dir, "base_runtime_fdtd.lsf")

if not os.path.exists(base_template):
    raise FileNotFoundError(f"Could not find FDTD base template: {base_template}")


# ============================================================
# OPTIMIZABLE 90 DEGREE BEND
# ============================================================

num_segments = args.n if args.n is not None else (16 if args.quick_test else 64)

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

if args.restart or FINAL_PARAMETERS.size != num_segments:
    initial_params = np.full(num_segments, args.initial_param, dtype=float)
else:
    initial_params = FINAL_PARAMETERS.copy()
bounds = [(-8.0, 8.0)] * num_segments

s_total = (np.pi / 2) * R
s_knots = np.linspace(0.0, s_total, num_segments + 1)
centerline_eval_points = args.samples
kappa_slew_limit = 2.05e9


def _centerline_from_params(params=initial_params):
    params = np.asarray(params, dtype=float)
    if params.size != num_segments:
        raise ValueError(f"Expected {num_segments} curvature parameters, got {params.size}")

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

    kappa_scale = (np.pi / 2) / raw_angle_span
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

    if abs(x[-1]) < 1e-18 or abs(y[-1]) < 1e-18:
        raise ValueError("Invalid integrated centerline endpoint.")

    # Contract required by the FDTD base: bend is exactly (0,0) -> (R,R).
    x *= R / x[-1]
    y *= R / y[-1]
    center = np.column_stack((x, y))

    tangent_x = np.gradient(center[:, 0], s_fine, edge_order=2)
    tangent_y = np.gradient(center[:, 1], s_fine, edge_order=2)
    theta = np.unwrap(np.arctan2(tangent_y, tangent_x))

    _centerline_from_params.last_center = center
    _centerline_from_params.last_theta = theta
    _centerline_from_params.last_kappa_knots = kappa_knots
    _centerline_from_params.last_kappa_dense = kappa_dense
    _centerline_from_params.last_kappa_derivative = curv_derivative
    _centerline_from_params.last_raw_angle_span = raw_angle_span
    _centerline_from_params.last_kappa_scale = kappa_scale
    return center, theta, kappa_knots, kappa_dense, curv_derivative, raw_angle_span, kappa_scale


def _circle_centerline():
    phi = np.linspace(0.0, np.pi / 2, centerline_eval_points)
    x = R * np.sin(phi)
    y = R * (1.0 - np.cos(phi))
    center = np.column_stack((x, y))
    theta = phi

    _circle_centerline.last_center = center
    _circle_centerline.last_theta = theta
    return center, theta


def bend_polygon(params=initial_params):
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


def _polygon_from_centerline(center, theta):
    n_in = 120
    input_x = np.linspace(-L_in, 0.0, n_in, endpoint=False)
    input_center = np.column_stack((input_x, np.zeros_like(input_x)))
    input_theta = np.zeros(n_in)

    n_out = 120
    t = np.linspace(0.0, L_out, n_out + 1)[1:]
    output_center = np.column_stack((np.full(n_out, R), R + t))
    output_theta = np.full(n_out, np.pi / 2)

    full_center = np.vstack((input_center, center, output_center))
    full_theta = np.concatenate((input_theta, theta, output_theta))

    normal = np.column_stack((-np.sin(full_theta), np.cos(full_theta)))
    outer = full_center + (W / 2.0) * normal
    inner = full_center - (W / 2.0) * normal
    points = np.vstack((outer, inner[::-1]))

    if _polygon_area(points) < 0:
        points = points[::-1]

    return points, full_center, full_theta


def single_piece_device_polygon(params=initial_params):
    _ = bend_polygon(params)

    points, center, theta = _polygon_from_centerline(bend_polygon._last_center, bend_polygon._last_theta)
    single_piece_device_polygon._last_center = center
    single_piece_device_polygon._last_theta = theta
    single_piece_device_polygon._last_bend_end = bend_polygon._last_center[-1]
    return points


def circle_bend_polygon(params=initial_params):
    center, theta = _circle_centerline()

    normal = np.column_stack((-np.sin(theta), np.cos(theta)))
    outer = center + (W / 2.0) * normal
    inner = center - (W / 2.0) * normal
    points = np.vstack((outer, inner[::-1]))

    if _polygon_area(points) < 0:
        points = points[::-1]

    circle_bend_polygon._last_center = center
    circle_bend_polygon._last_theta = theta
    return points


def circle_device_polygon(params=initial_params):
    center, theta = _circle_centerline()
    points, full_center, full_theta = _polygon_from_centerline(center, theta)
    circle_device_polygon._last_center = full_center
    circle_device_polygon._last_theta = full_theta
    circle_device_polygon._last_bend_end = center[-1]
    return points


def runtime_vars_from_polygon_func(params, polygon_func):
    polygon = polygon_func(params)

    x_min = min(np.min(polygon[:, 0]), -L_in)
    x_max = max(np.max(polygon[:, 0]), R)
    y_min = min(np.min(polygon[:, 1]), -W / 2)
    y_max = max(np.max(polygon[:, 1]), R + L_out)

    layout_x_min = x_min - layout_padding
    layout_x_max = x_max + layout_padding
    layout_y_min = y_min - layout_padding
    layout_y_max = y_max + layout_padding

    layout_x_span = layout_x_max - layout_x_min
    layout_y_span = layout_y_max - layout_y_min
    layout_x_center = 0.5 * (layout_x_min + layout_x_max)
    layout_y_center = 0.5 * (layout_y_min + layout_y_max)

    return {
        "INPUT_PORT_X": -L_in,
        "INPUT_PORT_Y": 0.0,
        "SOURCE_X": -L_in + 1e-6,
        "SOURCE_Y": 0.0,
        "OUTPUT_PORT_X": R,
        "OUTPUT_PORT_Y": R + L_out,
        "FOM_X": R,
        "FOM_Y": R + L_out - 1e-6,
        "FIELD_X": layout_x_center,
        "FIELD_Y": layout_y_center,
        "FIELD_X_SPAN": layout_x_span,
        "FIELD_Y_SPAN": layout_y_span,
        "FDTD_X": layout_x_center,
        "FDTD_Y": layout_y_center,
        "FDTD_X_SPAN": layout_x_span,
        "FDTD_Y_SPAN": layout_y_span,
        "MESH_X": 0.5 * R,
        "MESH_Y": 0.5 * R,
        "MESH_X_SPAN": R + 2e-6,
        "MESH_Y_SPAN": R + 2e-6,
    }


def runtime_vars_from_params(params):
    return runtime_vars_from_polygon_func(params, single_piece_device_polygon)


def write_runtime_base_script(params, polygon_func=single_piece_device_polygon):
    rv = runtime_vars_from_polygon_func(params, polygon_func)

    with open(base_template, "r", encoding="utf-8") as fh:
        runtime_script = fh.read()

    for key, value in rv.items():
        runtime_script = runtime_script.replace(f"__{key}__", _num(value))

    missing = sorted({token.split("__")[1] for token in runtime_script.split() if token.startswith("__") and token.endswith("__")})
    if missing:
        raise RuntimeError(f"Runtime base script token replacement incomplete. Missing: {missing}")

    with open(base_runtime_script, "w", encoding="utf-8") as fh:
        fh.write(runtime_script)

    print(f"Wrote runtime base script: {base_runtime_script}")
    print("Runtime positions:")
    for key in sorted(rv):
        print(f"  {key} = {_num(rv[key])}")
    return base_runtime_script


def polygon_diagnostics(points, label):
    edge_vectors = np.roll(points, -1, axis=0) - points
    edge_lengths = np.sqrt(np.sum(edge_vectors**2, axis=1))
    signed_area = _polygon_area(points)
    print(f"--- {label} diagnostics ---")
    print(f"points: {points.shape[0]}")
    print(f"signed area: {signed_area}")
    print(f"orientation: {'CCW' if signed_area > 0 else 'CW'}")
    print(f"min edge length: {np.min(edge_lengths)}")
    print(f"max edge length: {np.max(edge_lengths)}")
    print(f"near-zero edges: {np.where(edge_lengths < 1e-15)[0]}")


def _transmission_loss_metrics(transmission):
    transmission = np.asarray(transmission, dtype=float).ravel()
    finite_positive = transmission[np.isfinite(transmission) & (transmission > 0)]

    if finite_positive.size == 0:
        return None

    loss_db = -10.0 * np.log10(np.maximum(finite_positive, 1e-300))
    return {
        "t_min": np.min(finite_positive),
        "t_mean": np.mean(finite_positive),
        "t_max": np.max(finite_positive),
        "loss_min_db": np.min(loss_db),
        "loss_mean_db": np.mean(loss_db),
        "loss_max_db": np.max(loss_db),
    }


def print_fom_transmission_report(label, fom_value=None, fom_obj=None):
    transmission = None
    if fom_obj is not None and hasattr(fom_obj, "T_fwd_vs_wavelength"):
        transmission = getattr(fom_obj, "T_fwd_vs_wavelength")

    if transmission is None:
        print(f"{label}: FOM={_num(fom_value) if fom_value is not None else 'unknown'}, transmission unavailable")
        return

    metrics = _transmission_loss_metrics(transmission)
    if metrics is None:
        print(f"{label}: FOM={_num(fom_value) if fom_value is not None else 'unknown'}, valid positive transmission unavailable")
        return

    print(
        "%s: FOM=%s, T_mean=%s, T_min=%s, T_max=%s, loss_mean_dB=%s, loss_max_dB=%s"
        % (
            label,
            _num(fom_value) if fom_value is not None else "unknown",
            _num(metrics["t_mean"]),
            _num(metrics["t_min"]),
            _num(metrics["t_max"]),
            _num(metrics["loss_mean_db"]),
            _num(metrics["loss_max_db"]),
        )
    )


def install_lumopt_transmission_reporter(Optimization):
    if not REPORT_FOM_LOSS_DB or getattr(Optimization, "_fdtd_bend_reporter_installed", False):
        return

    Optimization._fdtd_bend_report_count = 0

    if hasattr(Optimization, "process_forward_sim"):
        original_process_forward_sim = Optimization.process_forward_sim

        def process_forward_sim_with_report(self, *call_args, **kwargs):
            result = original_process_forward_sim(self, *call_args, **kwargs)
            fom_value = result[0] if isinstance(result, tuple) and result else result
            try:
                Optimization._fdtd_bend_report_count += 1
                print_fom_transmission_report(f"Forward FOM/loss #{Optimization._fdtd_bend_report_count}", fom_value, self.fom)
            except Exception as exc:
                print("Forward FOM/loss report unavailable:", exc)
            return result

        Optimization.process_forward_sim = process_forward_sim_with_report
        Optimization._fdtd_bend_reporter_installed = True
        return

    if hasattr(Optimization, "callable_fom"):
        original_callable_fom = Optimization.callable_fom

        def callable_fom_with_report(self, *call_args, **kwargs):
            result = original_callable_fom(self, *call_args, **kwargs)
            try:
                Optimization._fdtd_bend_report_count += 1
                print_fom_transmission_report(f"Forward FOM/loss #{Optimization._fdtd_bend_report_count}", result, self.fom)
            except Exception as exc:
                print("Forward FOM/loss report unavailable:", exc)
            return result

        Optimization.callable_fom = callable_fom_with_report
        Optimization._fdtd_bend_reporter_installed = True


def write_final_gds(params, filename="optimized_bend_fdtd.gds", polygon_func=single_piece_device_polygon):
    if gdstk is None:
        print("gdstk is not installed; skipping GDS export.")
        return

    points = polygon_func(params)
    points_um = points * 1e6
    center_um = polygon_func._last_center * 1e6

    lib = gdstk.Library(unit=1e-6, precision=1e-9)
    cell = lib.new_cell("OPTIMIZED_TFLN_BEND_FDTD")

    poly = gdstk.Polygon(points_um, layer=1, datatype=0)
    fractured = poly.fracture(max_points=199, precision=1e-6)
    for p in fractured if fractured else [poly]:
        cell.add(p)

    cell.add(gdstk.Label("IN", center_um[0], layer=66))
    cell.add(gdstk.Label("OUT", center_um[-1], layer=66))

    lib.write_gds(filename)

    print(f"Wrote final single-piece GDS: {filename}")
    print(f"R = {R * 1e6:.6f} um")
    print(f"Input arm = {L_in * 1e6:.6f} um")
    print(f"Output arm = {L_out * 1e6:.6f} um")
    print(f"Reference WG_width = {WG_width * 1e6:.6f} um")
    print(f"Ridge height = {H * 1e6:.6f} um")
    print(f"Sidewall angle = {Angle:.2f} deg")
    if hasattr(bend_polygon, "_last_raw_angle_span") and polygon_func is single_piece_device_polygon:
        print(f"Raw angle before scaling = {np.rad2deg(bend_polygon._last_raw_angle_span):.6f} deg")
    print(f"Mapped bend endpoint = ({polygon_func._last_bend_end[0] * 1e6:.6f}, {polygon_func._last_bend_end[1] * 1e6:.6f}) um")


def save_geometry_plot(params, filename="final_bend_geometry_fdtd.png", polygon_func=single_piece_device_polygon):
    try:
        import matplotlib.patches as patches
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed; skipping geometry plot.")
        return

    points = polygon_func(params)
    center = polygon_func._last_center

    fig, ax = plt.subplots(1, 1, figsize=(9, 9))
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
    ax.plot([0, R * 1e6], [0, R * 1e6], "k.", markersize=4, label="bend anchors")
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.3)
    ax.set_xlabel("x (um)")
    ax.set_ylabel("y (um)")
    ax.set_title("3D FDTD optimized TFLN bend")
    ax.legend()
    plt.tight_layout()
    plt.savefig(filename, dpi=300)
    plt.close(fig)
    print(f"Saved geometry plot: {filename}")


def export_initial_geometry():
    write_final_gds(initial_params, os.path.join(script_dir, "optimized_bend_fdtd_initial.gds"))
    save_geometry_plot(initial_params, os.path.join(script_dir, "final_bend_geometry_fdtd_initial.png"))


def export_circle_geometry():
    write_final_gds(initial_params, os.path.join(script_dir, "circle_bend_fdtd_base.gds"), circle_device_polygon)
    save_geometry_plot(initial_params, os.path.join(script_dir, "circle_bend_geometry_fdtd_base.png"), circle_device_polygon)


def build_optimization(base_script, geometry_func=single_piece_device_polygon):
    from lumopt.figures_of_merit.modematch import ModeMatch
    from lumopt.geometries.polygon import FunctionDefinedPolygon
    from lumopt.optimization import Optimization
    from lumopt.optimizers.generic_optimizers import ScipyOptimizers
    from lumopt.utilities.materials import Material
    from lumopt.utilities.wavelengths import Wavelengths

    install_lumopt_transmission_reporter(Optimization)
    wavelengths = Wavelengths(start=1550e-9, stop=1550e-9, points=1)

    geometry = FunctionDefinedPolygon(
        func=geometry_func,
        initial_params=initial_params,
        bounds=bounds,
        z=Thickness - etch_depth / 2,
        depth=etch_depth,
        eps_out=Material(name="Air_Custom", mesh_order=3),
        eps_in=Material(name="Lithium Niobate", mesh_order=2),
        edge_precision=5,
        dx=SHAPE_DERIVATIVE_STEP,
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
        max_iter=MAX_ITER,
        method="L-BFGS-B",
        scaling_factor=1,
        pgtol=1e-9,
        ftol=1e-9,
    )

    opt = Optimization(
        base_script=base_script,
        wavelengths=wavelengths,
        fom=fom,
        geometry=geometry,
        optimizer=optimizer,
        use_var_fdtd=False,
        hide_fdtd_cad=args.hide_cad,
        use_deps=USE_DEPS,
        store_all_simulations=False,
    )
    return opt


def initialize_lumopt_compat(opt, working_dir):
    try:
        return opt.initialize(working_dir=working_dir)
    except TypeError as exc:
        if "unexpected keyword argument" not in str(exc):
            raise

    try:
        return opt.initialize(working_dir)
    except TypeError:
        return opt.initialize()


def load_base_lsf_only(base_script):
    import lumapi

    print("LOAD_BASE_ONLY enabled. Loading runtime LSF without LumOpt geometry insertion.")
    print("No forward solve, adjoint solve, FOM call, or optimization will be run.")
    with open(base_script, "r", encoding="utf-8") as fh:
        script_text = fh.read()

    fdtd = lumapi.FDTD(hide=False)
    fdtd.eval(script_text)
    print("Loaded runtime base LSF successfully.")
    input("FDTD is open for inspection. Press Enter here when you are ready to close Python...")


def load_lumopt_geometry_only(base_script, geometry_func):
    opt = build_optimization(base_script, geometry_func)
    working_dir = os.path.join(script_dir, "load_only_geometry")

    print("LOAD_ONLY enabled. Initializing LumOpt geometry and stopping before simulation.")
    print("No callable_fom(), forward solve, adjoint solve, or optimizer run will be called.")
    initialize_lumopt_compat(opt, working_dir)

    try:
        object_names = opt.sim.fdtd.getobjectnames()
        print("Top-level FDTD objects after LumOpt initialization:")
        for object_name in object_names:
            print("  " + str(object_name))
    except Exception as exc:
        print("Could not list FDTD object names:", exc)

    input("FDTD is open with geometry inserted. Inspect the shape, then press Enter here to close Python...")


geometry_func = circle_device_polygon if args.base_fom_only else single_piece_device_polygon
base_script = write_runtime_base_script(initial_params, geometry_func)

if args.debug_geometry:
    if args.base_fom_only:
        polygon_diagnostics(circle_bend_polygon(initial_params), "circle bend-only polygon")
        polygon_diagnostics(circle_device_polygon(initial_params), "circle single-piece device polygon")
    else:
        polygon_diagnostics(bend_polygon(initial_params), "bend-only polygon")
        polygon_diagnostics(single_piece_device_polygon(initial_params), "single-piece device polygon")

if args.write_base_only or args.no_run or args.export_only:
    print("No-run/export mode enabled. Optimization was not started.")
    if args.base_fom_only:
        export_circle_geometry()
    else:
        export_initial_geometry()
    raise SystemExit

if args.load_base_only:
    load_base_lsf_only(base_script)
    raise SystemExit

if args.load_only:
    load_lumopt_geometry_only(base_script, geometry_func)
    raise SystemExit

opt = build_optimization(base_script, geometry_func)

if args.base_fom_only:
    print("BASE_FOM_ONLY enabled. Evaluating the circular 90 degree bend once; optimization will not run.")
    try:
        opt.initialize(working_dir=os.path.join(script_dir, "base_fom_only_circle"))
    except TypeError:
        opt.initialize(os.path.join(script_dir, "base_fom_only_circle"))
    base_fom = opt.callable_fom(np.asarray(initial_params, dtype=float))
    print_fom_transmission_report("Circular base geometry FOM/loss", base_fom, opt.fom)
    export_circle_geometry()
    raise SystemExit

opt.init_plotter()
results = opt.run()

if isinstance(results, tuple) and len(results) >= 2:
    final_fom, final_params = results[0], np.asarray(results[1], dtype=float)
else:
    final_fom, final_params = None, np.asarray(getattr(opt.optimizer, "x", initial_params), dtype=float)

print(f"Final FOM: {final_fom}")
np.save(os.path.join(script_dir, "final_params_fdtd.npy"), final_params)
write_final_gds(final_params, os.path.join(script_dir, "optimized_bend_fdtd.gds"))
save_geometry_plot(final_params, os.path.join(script_dir, "final_bend_geometry_fdtd.png"))
