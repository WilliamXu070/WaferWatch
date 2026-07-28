import os, sys
from datetime import datetime

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from configs import current_lnoi

# -----------------------------------------------------------------------------
# Python / Lumerical API setup
# -----------------------------------------------------------------------------
# Keep this path pointed at the Lumerical Python API folder on the Windows
# machine that runs the optimization. This is what makes `import lumapi` work.
print(sys.executable)
print(sys.executable)
sys.path.insert(0, r"C:\\Program Files\\ANSYS Inc\\v251\\Lumerical\\api\\python")
print(sys.executable)

import numpy as np
import scipy as sp

import lumapi
from lumopt import CONFIG
from lumopt.utilities.load_lumerical_scripts import load_from_lsf
from lumopt.utilities.wavelengths import Wavelengths
from lumopt.geometries.polygon import FunctionDefinedPolygon
from lumopt.geometries.parameterized_geometry import ParameterizedGeometry
from lumopt.utilities.materials import Material
from lumopt.figures_of_merit.modematch import ModeMatch
from lumopt.optimizers.generic_optimizers import ScipyOptimizers
from lumopt.optimization import Optimization


CHECKPOINT_DIR = os.path.join(PROJECT_ROOT, "artifacts", "checkpoints", "fdtd_lumopt")
LATEST_PARAMS_FILE = os.path.join(CHECKPOINT_DIR, "latest_params.npz")
PAPER_FFC_SEED_FILE = os.path.join(PROJECT_ROOT, "data", "seeds", "paper_ffc_seed.npz")
PAPER_FFC_SEED_FORMAT_VERSION = 1
PAPER_FFC_SEED_CONTROL_POINTS = 20
ITERATION_CHECKPOINT_COUNTER = 0


def _consume_resume_params_arg():
    """Allow `python optimize.py --resume-params file.npz` without argparse."""
    flag = "--resume-params"
    if flag not in sys.argv:
        return

    idx = sys.argv.index(flag)
    if idx + 1 >= len(sys.argv):
        raise SystemExit("--resume-params requires a .npz file path")

    os.environ["RESUME_FROM_CHECKPOINT"] = "1"
    os.environ["RESUME_PARAMS_FILE"] = sys.argv[idx + 1]
    del sys.argv[idx:idx + 2]


_consume_resume_params_arg()


def _patch_plotter_for_safe_callback():
    """Guard SnapShots methods against missing/None _frame_sink state."""
    try:
        from lumopt.utilities import plotter
    except Exception:
        return

    if getattr(plotter.SnapShots, "_lumopt_plotter_safe", False):
        return

    orig_grab_frame = plotter.SnapShots.grab_frame
    orig_finish = plotter.SnapShots.finish

    def safe_grab_frame(self, *args, **kwargs):
        if not hasattr(self, "_frame_sink"):
            return None
        frame_sink = getattr(self, "_frame_sink")
        if frame_sink is None:
            return None
        try:
            return orig_grab_frame(self, *args, **kwargs)
        except (AttributeError, TypeError):
            return None

    def safe_finish(self, *args, **kwargs):
        try:
            return orig_finish(self, *args, **kwargs)
        except (AttributeError, TypeError):
            return None

    plotter.SnapShots.grab_frame = safe_grab_frame
    plotter.SnapShots.finish = safe_finish
    plotter.SnapShots._lumopt_plotter_safe = True


def _env_flag(name, default=True):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in ("0", "false", "no", "off", "")


def _save_iteration_params(params, label="iteration"):
    """Save restartable optimizer parameters after an accepted iteration."""
    global ITERATION_CHECKPOINT_COUNTER

    params = np.asarray(params, dtype=float).ravel()
    if params.size != N_SEGMENTS:
        print("Skipping checkpoint with unexpected param count:", params.size, flush=True)
        return None
    if not np.all(np.isfinite(params)):
        print("Skipping checkpoint with non-finite params.", flush=True)
        return None

    ITERATION_CHECKPOINT_COUNTER += 1
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    timestamp = datetime.now().isoformat(timespec="seconds")
    iter_path = os.path.join(CHECKPOINT_DIR, f"iter_{ITERATION_CHECKPOINT_COUNTER:06d}_params.npz")

    payload = {
        "params": params,
        "iteration": np.array([ITERATION_CHECKPOINT_COUNTER], dtype=int),
        "timestamp": np.array([timestamp]),
        "label": np.array([label]),
    }
    tmp_iter = iter_path + ".tmp.npz"
    tmp_latest = LATEST_PARAMS_FILE + ".tmp.npz"
    np.savez(tmp_iter, **payload)
    os.replace(tmp_iter, iter_path)
    np.savez(tmp_latest, **payload)
    os.replace(tmp_latest, LATEST_PARAMS_FILE)

    history_path = os.path.join(CHECKPOINT_DIR, "params_history.csv")
    write_header = not os.path.exists(history_path)
    with open(history_path, "a", encoding="utf-8") as fh:
        if write_header:
            fh.write("iteration,timestamp,label,param_min,param_max,param_l2,file\n")
        fh.write(
            "{},{},{},{:.16e},{:.16e},{:.16e},{}\n".format(
                ITERATION_CHECKPOINT_COUNTER,
                timestamp,
                label,
                float(np.min(params)),
                float(np.max(params)),
                float(np.linalg.norm(params)),
                os.path.basename(iter_path),
            )
        )
        fh.flush()

    print("Saved iteration checkpoint:", iter_path, flush=True)
    return iter_path


def _load_initial_params_from_checkpoint(default_params):
    default_params = np.asarray(default_params, dtype=float).ravel()
    if not _env_flag("RESUME_FROM_CHECKPOINT", default=True):
        print("Checkpoint resume disabled; using default initial params.", flush=True)
        return default_params

    checkpoint = os.environ.get("RESUME_PARAMS_FILE", LATEST_PARAMS_FILE)
    if not os.path.exists(checkpoint):
        print("No parameter checkpoint found; using default initial params.", flush=True)
        return default_params

    try:
        data = np.load(checkpoint, allow_pickle=False)
        params = np.asarray(data["params"], dtype=float).ravel()
        if params.size != default_params.size:
            print(
                "Ignoring checkpoint with wrong param count:",
                checkpoint,
                "expected",
                default_params.size,
                "got",
                params.size,
                flush=True,
            )
            return default_params
        if not np.all(np.isfinite(params)):
            print("Ignoring checkpoint with non-finite params:", checkpoint, flush=True)
            return default_params
        print("Resuming from parameter checkpoint:", checkpoint, flush=True)
        return params
    except Exception as exc:
        print("Could not load parameter checkpoint:", checkpoint, exc, flush=True)
        return default_params


def _iteration_checkpoint_callback(*args, **kwargs):
    """Best-effort callback for SciPy/LumOpt accepted optimizer iterations."""
    candidate = None
    for arg in args:
        if hasattr(arg, "x"):
            candidate = np.asarray(arg.x, dtype=float).ravel()
            break
        try:
            arr = np.asarray(arg, dtype=float).ravel()
        except Exception:
            continue
        if arr.size == N_SEGMENTS:
            candidate = arr
            break

    if candidate is None and "xk" in kwargs:
        candidate = np.asarray(kwargs["xk"], dtype=float).ravel()
    if candidate is None:
        return None

    return _save_iteration_params(candidate, label="accepted_iteration")


def _install_optimizer_callbacks(optimizer):
    """Disable plotting callbacks but keep a parameter checkpoint callback."""
    if optimizer is None:
        return
    if hasattr(optimizer, "callback"):
        try:
            setattr(optimizer, "callback", _iteration_checkpoint_callback)
        except Exception:
            pass
    for attr in ("plotting_function",):
        if hasattr(optimizer, attr):
            try:
                setattr(optimizer, attr, lambda *args, **kwargs: None)
            except Exception:
                pass


# -----------------------------------------------------------------------------
# User-controlled high-level inputs
# -----------------------------------------------------------------------------
# radius sets the vertical output location. output_x sets the horizontal output
# location for this optimization run. Keep output_x fixed during one LumOpt run;
# scan output_x externally later if desired.
# Use compact radius for stronger geometry sensitivity.
radius = current_lnoi.RADIUS_M
output_x = current_lnoi.OUTPUT_X_M


# -----------------------------------------------------------------------------
# Geometry constants and optimizer dimensions
# -----------------------------------------------------------------------------
WG_length = current_lnoi.WG_LENGTH_M
WG_width = current_lnoi.WG_TOP_WIDTH_M
Thickness = current_lnoi.FILM_THICKNESS_M
mesh = current_lnoi.DESIGN_MESH_M
etch_depth = current_lnoi.ETCH_DEPTH_M
Sidewall_angle_deg = current_lnoi.SIDEWALL_ANGLE_DEG
WG_top_width = current_lnoi.WG_TOP_WIDTH_M
WG_bottom_width = WG_top_width + 2.0 * etch_depth / np.tan(np.deg2rad(Sidewall_angle_deg))
WG_width = WG_top_width
WG_effective_width = 0.5 * (WG_top_width + WG_bottom_width)

N_SEGMENTS = 20
N_CENTERLINE_POINTS = 150
N_RAW_POINTS = 400
CURVATURE_CONTROL_SCALE = 0.35


# -----------------------------------------------------------------------------
# Static paper-geometry seed
# -----------------------------------------------------------------------------
def _load_paper_ffc_seed(seed_path=PAPER_FFC_SEED_FILE):
    """Load and validate the reconstructed paper centerline seed."""
    if not os.path.isfile(seed_path):
        raise FileNotFoundError("Paper FFC seed file not found: %s" % seed_path)

    required_keys = {
        "format_version",
        "parameterization",
        "source",
        "normalization",
        "spline_degree",
        "knots",
        "control_points_um",
        "centerline_um",
        "design_extent_um",
        "fit_rms_um",
        "fit_max_um",
    }

    try:
        with np.load(seed_path, allow_pickle=False) as data:
            missing = sorted(required_keys.difference(data.files))
            if missing:
                raise ValueError("missing keys: %s" % ", ".join(missing))

            format_version = int(np.asarray(data["format_version"]).ravel()[0])
            parameterization = str(np.asarray(data["parameterization"]).ravel()[0])
            source = str(np.asarray(data["source"]).ravel()[0])
            normalization = str(np.asarray(data["normalization"]).ravel()[0])
            spline_degree = int(np.asarray(data["spline_degree"]).ravel()[0])
            knots = np.asarray(data["knots"], dtype=float).copy()
            control_points_um = np.asarray(data["control_points_um"], dtype=float).copy()
            centerline_um = np.asarray(data["centerline_um"], dtype=float).copy()
            design_extent_um = np.asarray(data["design_extent_um"], dtype=float).ravel().copy()
            fit_rms_um = float(np.asarray(data["fit_rms_um"], dtype=float).ravel()[0])
            fit_max_um = float(np.asarray(data["fit_max_um"], dtype=float).ravel()[0])
    except Exception as exc:
        raise RuntimeError("Could not load paper FFC seed %s: %s" % (seed_path, exc)) from exc

    if format_version != PAPER_FFC_SEED_FORMAT_VERSION:
        raise ValueError(
            "Unsupported paper FFC seed format version %d; expected %d"
            % (format_version, PAPER_FFC_SEED_FORMAT_VERSION)
        )
    if parameterization != "clamped_cubic_bspline":
        raise ValueError("Unexpected paper FFC parameterization: %s" % parameterization)
    if spline_degree != 3:
        raise ValueError("Paper FFC seed must use a cubic spline")
    if control_points_um.shape != (PAPER_FFC_SEED_CONTROL_POINTS, 2):
        raise ValueError(
            "Paper FFC control points must have shape (%d, 2), got %s"
            % (PAPER_FFC_SEED_CONTROL_POINTS, control_points_um.shape)
        )
    if centerline_um.ndim != 2 or centerline_um.shape[1] != 2:
        raise ValueError("Paper FFC centerline must be an Nx2 array")
    if knots.shape != (PAPER_FFC_SEED_CONTROL_POINTS + spline_degree + 1,):
        raise ValueError("Paper FFC knot vector has the wrong length")
    if design_extent_um.shape != (2,):
        raise ValueError("Paper FFC design extent must contain x and y spans")

    numeric_arrays = (knots, control_points_um, centerline_um, design_extent_um)
    if not all(np.all(np.isfinite(values)) for values in numeric_arrays):
        raise ValueError("Paper FFC seed contains non-finite geometry values")
    if not np.isfinite(fit_rms_um) or not np.isfinite(fit_max_um):
        raise ValueError("Paper FFC seed contains non-finite fit metrics")
    if np.any(np.diff(knots) < 0.0) or knots[0] != 0.0 or knots[-1] != 1.0:
        raise ValueError("Paper FFC knot vector must be nondecreasing on [0, 1]")

    expected_extent_um = 1.0e6 * np.array([output_x, radius])
    if not np.allclose(design_extent_um, expected_extent_um, rtol=0.0, atol=1.0e-9):
        raise ValueError(
            "Paper FFC seed extent %s um does not match the active design extent %s um"
            % (design_extent_um, expected_extent_um)
        )
    if not np.allclose(control_points_um[0], [0.0, 0.0], rtol=0.0, atol=1.0e-9):
        raise ValueError("Paper FFC first control point must be the input endpoint")
    if not np.allclose(control_points_um[-1], design_extent_um, rtol=0.0, atol=1.0e-9):
        raise ValueError("Paper FFC last control point must be the output endpoint")
    if not np.allclose(centerline_um[0], [0.0, 0.0], rtol=0.0, atol=1.0e-9):
        raise ValueError("Paper FFC centerline must start at the input endpoint")
    if not np.allclose(centerline_um[-1], design_extent_um, rtol=0.0, atol=1.0e-9):
        raise ValueError("Paper FFC centerline must end at the output endpoint")
    if abs(control_points_um[1, 1]) > 1.0e-9:
        raise ValueError("Paper FFC input tangent must be horizontal")
    if abs(control_points_um[-2, 0] - design_extent_um[0]) > 1.0e-9:
        raise ValueError("Paper FFC output tangent must be vertical")

    return {
        "path": os.path.abspath(seed_path),
        "parameterization": parameterization,
        "source": source,
        "normalization": normalization,
        "degree": spline_degree,
        "knots": knots,
        "control_points": control_points_um * 1.0e-6,
        "centerline": centerline_um * 1.0e-6,
        "design_extent": design_extent_um * 1.0e-6,
        "fit_rms": fit_rms_um * 1.0e-6,
        "fit_max": fit_max_um * 1.0e-6,
    }


# -----------------------------------------------------------------------------
# Small geometry utilities
# -----------------------------------------------------------------------------
def _cumtrapz(y, x):
    dx = np.diff(x)
    increments = 0.5 * (y[:-1] + y[1:]) * dx
    return np.concatenate(([0.0], np.cumsum(increments)))


def _polygon_area(points):
    x = points[:, 0]
    y = points[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - y * np.roll(x, -1))


# -----------------------------------------------------------------------------
# Generalized-Euler bend geometry used by LumOpt
# -----------------------------------------------------------------------------
def generalized_euler_centerline(params):
    """Build a bend centerline from chained generalized-Euler segments."""
    params = np.asarray(params, dtype=float).ravel()

    # Curvature nodes: N_SEGMENTS segments need N_SEGMENTS+1 endpoint curvatures.
    # Zero params -> all nodes equal -> constant radius seed.
    if params.size != N_SEGMENTS:
        raise ValueError("Expected %d geometry parameters, got %d" % (N_SEGMENTS, params.size))

    control_u = np.linspace(0.0, 1.0, params.size)
    node_u = np.linspace(0.0, 1.0, N_SEGMENTS + 1)
    control_interp = sp.interpolate.CubicSpline(control_u, params, bc_type='natural')
    kappa_shape = np.exp(CURVATURE_CONTROL_SCALE * control_interp(node_u))

    lengths = np.full(N_SEGMENTS, 0.5 * np.pi * radius / N_SEGMENTS)
    raw_turn = np.sum(0.5 * (kappa_shape[:-1] + kappa_shape[1:]) * lengths)
    kappa_nodes = kappa_shape * ((0.5 * np.pi) / raw_turn)

    points = []
    theta0 = 0.0
    x0 = 0.0
    y0 = 0.0
    points_per_segment = max(4, int(np.ceil(N_RAW_POINTS / N_SEGMENTS)))

    for i in range(N_SEGMENTS):
        L = lengths[i]
        k0 = kappa_nodes[i]
        k1 = kappa_nodes[i + 1]
        s = np.linspace(0.0, L, points_per_segment)

        theta = theta0 + k0 * s + 0.5 * (k1 - k0) / L * s**2
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


def resample_centerline(center, n=N_CENTERLINE_POINTS):
    """Parametric cubic resampling: x=x(s), y=y(s), not y=f(x)."""
    deltas = np.diff(center, axis=0)
    ds = np.sqrt(np.sum(deltas**2, axis=1))
    s = np.concatenate(([0.0], np.cumsum(ds)))

    # Remove any accidental duplicate arc-length samples before spline fitting.
    keep = np.concatenate(([True], np.diff(s) > 1e-15))
    s = s[keep]
    center = center[keep]

    s_new = np.linspace(0.0, s[-1], n)
    x_new = sp.interpolate.CubicSpline(s, center[:, 0], bc_type='natural')(s_new)
    y_new = sp.interpolate.CubicSpline(s, center[:, 1], bc_type='natural')(s_new)

    smooth = np.column_stack((x_new, y_new))
    smooth[0] = [0.0, 0.0]
    smooth[-1] = [output_x, radius]
    return smooth


def centerline_to_polygon(center, width):
    """Convert a centerline to a constant-width polygon."""
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
    return polygon


def _should_keep_fdtd_open():
    env_flag = os.environ.get("KEEP_FDTD_OPEN_ON_STOP", "1").strip().lower()
    return env_flag not in ("0", "false", "no", "off")


def _keep_fdtd_session_open():
    """Pause execution so the FD-TD GUI can stay open after a manual stop."""
    if not _should_keep_fdtd_open():
        return

    print("FD-TD has been switched back to layout and is ready for inspection.")
    print("Keeping process alive to avoid closing the FD-TD application.")
    print("Type 'exit' to return control to the shell and close this Python session,")
    print("or press Ctrl+C when you are done inspecting.")

    try:
        while True:
            cmd = input("Type 'exit' then Enter to end run: ").strip().lower()
            if cmd == "exit":
                print("Exiting by user request.")
                return
            if cmd:
                print("Unrecognized input. Use 'exit' to continue.")
    except (KeyboardInterrupt, EOFError):
        print("\nExiting by user interrupt.")


def bent_waveguide(params):
    """LumOpt geometry callback: params -> generalized-Euler bend polygon."""
    center = generalized_euler_centerline(params)
    center = resample_centerline(center, N_CENTERLINE_POINTS)
    return centerline_to_polygon(center, WG_width)


# -----------------------------------------------------------------------------
# Sidewall-aware LumOpt geometry backend
# -----------------------------------------------------------------------------
# Why this exists:
#   FunctionDefinedPolygon calls addpoly(), which creates a vertical-wall extruded
#   polygon. Our fixed input/output arms in optimize.lsf already use Layer Builder
#   with a sidewall angle. This function makes the optimized bend use the same
#   Layer Builder process instead of addpoly().
OPT_BEND_BUILDER_NAME = "optimized_core"
OPT_BEND_LAYER_NAME = "MMI-core"
OPT_GDS_LAYER = "1:0"


def _lumerical_scalar(value):
    """Convert a lumapi scalar/matrix return value into a Python float."""
    return float(np.asarray(value).ravel()[0])


def _close_polygon_if_needed(points):
    points = np.asarray(points, dtype=float)
    if points.ndim != 2 or points.shape[1] != 2:
        raise ValueError("Layer Builder polygon must be an Nx2 vertex array")
    if np.linalg.norm(points[0] - points[-1]) > 1e-15:
        points = np.vstack((points, points[0]))
    return points


def _get_layerbuilder_reference(fdtd, points):
    """
    Use the same absolute design frame as the fixed Layer Builders from optimize.lsf.
    If those objects are not present for some reason, fall back to a local frame.
    """
    try:
        if int(_lumerical_scalar(fdtd.getnamednumber("input_waveguide"))) > 0:
            x0 = _lumerical_scalar(fdtd.getnamed("input_waveguide", "x"))
            y0 = _lumerical_scalar(fdtd.getnamed("input_waveguide", "y"))
            xspan = _lumerical_scalar(fdtd.getnamed("input_waveguide", "x span"))
            yspan = _lumerical_scalar(fdtd.getnamed("input_waveguide", "y span"))
            return x0, y0, xspan, yspan
    except Exception:
        pass

    pad = 5e-6
    x_min = min(np.min(points[:, 0]), -WG_length) - pad
    x_max = max(np.max(points[:, 0]), output_x + WG_width) + pad
    y_min = min(np.min(points[:, 1]), -WG_width) - pad
    y_max = max(np.max(points[:, 1]), radius + WG_length) + pad
    return 0.5 * (x_min + x_max), 0.5 * (y_min + y_max), x_max - x_min, y_max - y_min


def sidewall_bend_layerbuilder(params, fdtd, only_update):
    """
    LumOpt ParameterizedGeometry callback.

    params -> same top-view polygon as bent_waveguide(), but drawn as a Layer
    Builder object with Sidewall_angle_deg instead of FunctionDefinedPolygon/addpoly.
    """
    fdtd.switchtolayout()

    # Top-view mask. Because the Layer Builder reference is 'Top', this polygon is
    # the top width. A 70 deg sidewall makes the bottom wider automatically.
    points_abs = _close_polygon_if_needed(bent_waveguide(params))
    ref_x, ref_y, ref_xspan, ref_yspan = _get_layerbuilder_reference(fdtd, points_abs)
    points_local = points_abs - np.array([[ref_x, ref_y]])

    exists = False
    try:
        exists = int(_lumerical_scalar(fdtd.getnamednumber(OPT_BEND_BUILDER_NAME))) > 0
    except Exception:
        exists = False

    if (not only_update) or (not exists):
        fdtd.eval(f"""
if (getnamednumber("{OPT_BEND_BUILDER_NAME}") > 0) {{
  select("{OPT_BEND_BUILDER_NAME}");
  delete;
}}
addlayerbuilder;
set("name", "{OPT_BEND_BUILDER_NAME}");
set("x", {ref_x:.16g});
set("y", {ref_y:.16g});
set("z", 0);
set("x span", {ref_xspan:.16g});
set("y span", {ref_yspan:.16g});
set("gds position reference", 1);
set("gds sidewall angle position reference", "Top");
set("base mesh order", 1);

addlayer("{OPT_BEND_LAYER_NAME}");
setlayer("{OPT_BEND_LAYER_NAME}", "layer number", "{OPT_GDS_LAYER}");
setlayer("{OPT_BEND_LAYER_NAME}", "start position", {Thickness - etch_depth:.16g});
setlayer("{OPT_BEND_LAYER_NAME}", "thickness", {etch_depth:.16g});
setlayer("{OPT_BEND_LAYER_NAME}", "process", "grow");
setlayer("{OPT_BEND_LAYER_NAME}", "pattern material", "LN-will");
setlayer("{OPT_BEND_LAYER_NAME}", "sidewall angle", {Sidewall_angle_deg:.16g});
""")

    fdtd.putv("optimized_core_vertices", points_local)
    fdtd.eval(f"""
select("{OPT_BEND_BUILDER_NAME}");
set("geometry", {{"{OPT_GDS_LAYER}":{{optimized_core_vertices}}}});
""")


# -----------------------------------------------------------------------------
# Optimization assembly / execution
# -----------------------------------------------------------------------------
def runSim(initial_params, bounds, base_script):
    # The optimized bend must be drawn by Layer Builder, not FunctionDefinedPolygon.
    # FunctionDefinedPolygon uses addpoly(), which cannot represent sloped sidewalls.
    # ParameterizedGeometry lets us keep the same params -> polygon math, but update
    # the CAD using Layer Builder every iteration.
    polygon = ParameterizedGeometry(
        func=sidewall_bend_layerbuilder,
        initial_params=initial_params,
        bounds=bounds,
        # Parameters are dimensionless in [-1, 1], so 1e-9 is too tiny for CAD
        # finite-difference d_eps. 1e-3 gives a visible but still small perturbation.
        dx=1.0e-3,
    )

    fom = ModeMatch(
        monitor_name='fom',
        mode_number='fundamental TE mode',
        direction='Forward',
        target_T_fwd=lambda wl: np.ones(wl.size),
        norm_p=1,
    )

    optimizer = ScipyOptimizers(
        max_iter=40,
        method='L-BFGS-B',
        scaling_factor=1.0,
        pgtol=1.0e-5,
        ftol=1.0e-6,
        scale_initial_gradient_to=0.0,
    )

    _install_optimizer_callbacks(optimizer)

    opt = Optimization(
        base_script=base_script,
        wavelengths=wavelengths,
        fom=fom,
        geometry=polygon,
        optimizer=optimizer,
        use_var_fdtd=False,
        hide_fdtd_cad=False,
        use_deps=True,
        plot_history=False,
        store_all_simulations=False,
    )
    try:
        _patch_plotter_for_safe_callback()
        print("Calling LumOpt opt.run() with current initial_params.", flush=True)
        results = opt.run()
    except KeyboardInterrupt:
        print('Interrupted by user. Attempting to stop FDTD sessions...')
        _stop_fdtd_for_superopt(opt, label='keyboard interrupt')
        _keep_fdtd_session_open()
        return None
    except Exception:
        err = str(sys.exc_info()[1])
        if "FDTD simulation did not complete successfully: status 0.0" in err:
            print('Optimization stopped manually; switched FDTD back to layout.')
            _stop_fdtd_for_superopt(opt, label='user stop')
            _keep_fdtd_session_open()
            return None
        _stop_fdtd_for_superopt(opt, label='unexpected run error')
        raise
    return results


def _stop_fdtd_for_superopt(opt_obj, label='optimization'):
    """Stop FD-TD sessions on interruption without forcing API/app process close."""
    if opt_obj is None:
        print('No active optimization object for', label)
        return

    sessions = []
    sim = getattr(opt_obj, 'sim', None)
    fdtd = getattr(sim, 'fdtd', None) if sim is not None else None
    if fdtd is not None:
        sessions.append(fdtd)

    sub_opts = getattr(opt_obj, 'optimizations', None) or []
    for sub_opt in sub_opts:
        sim = getattr(sub_opt, 'sim', None)
        fdtd = getattr(sim, 'fdtd', None) if sim is not None else None
        if fdtd is not None:
            sessions.append(fdtd)

    # Deduplicate in case references alias the same handle.
    seen = set()
    unique_sessions = []
    for session in sessions:
        if id(session) in seen:
            continue
        seen.add(id(session))
        unique_sessions.append(session)
    sessions = unique_sessions

    if not sessions:
        print('No FD-TD handles found for', label)
        return []

    print('Stopping', len(sessions), 'FD-TD handle(s) for', label)
    for idx, fdtd in enumerate(sessions, 1):
        print('  handle', idx, ':', fdtd)
        for cmd in (
            'stop;',
            'clearjobs;',
            'switchtolayout;',
            'stop; clearjobs; switchtolayout;',
        ):
            try:
                fdtd.eval(cmd)
            except Exception:
                pass

    return sessions


def _build_runtime_lsf(template):
    values = current_lnoi.lsf_replacements(
        radius_m=radius,
        output_x_m=output_x,
    )
    for token, value in values.items():
        template = template.replace(token, value)
    return template


# -----------------------------------------------------------------------------
# Base simulation script
# -----------------------------------------------------------------------------
cur_path = os.path.dirname(os.path.abspath(__file__))

bent_base = load_from_lsf(os.path.join(cur_path, 'optimize.lsf'))
bent_base = _build_runtime_lsf(bent_base)


# -----------------------------------------------------------------------------
# Output / wavelength setup
# -----------------------------------------------------------------------------
example_directory = os.getcwd()
wavelengths = Wavelengths(
    start=current_lnoi.WAVELENGTH_M,
    stop=current_lnoi.WAVELENGTH_M,
    points=1,
)


# -----------------------------------------------------------------------------
# Initial bend parameters
# -----------------------------------------------------------------------------
# Zero parameters seed a constant-curvature bend. A tiny sinusoidal seed is used
# to avoid starting exactly at a stationary point where gradient checks can read
# as zero and L-BFGS-B exits before any movement.
initial_params_seed = 1e-3 * np.sin(np.linspace(0.0, 2.0 * np.pi, N_SEGMENTS, endpoint=False))
initial_params = _load_initial_params_from_checkpoint(initial_params_seed)
bounds = [(-1.0, 1.0)] * initial_params.size


# -----------------------------------------------------------------------------
# Run
# -----------------------------------------------------------------------------
runSim(initial_params=initial_params, bounds=bounds, base_script=bent_base)


######## EXPORT OPTIMIZED STRUCTURE TO GDS ########
