import os, sys

# -----------------------------------------------------------------------------
# Python / Lumerical API setup
# -----------------------------------------------------------------------------
# Keep this path pointed at the Lumerical Python API folder on the Windows
# machine that runs the optimization. This is what makes `import lumapi` work.
print(sys.executable)
print(sys.executable)
sys.path.insert(0, r"C:\\Program Files\\ANSYS Inc\\v251\\Lumerical\\api\\python")
print(sys.executable)
print("DEBUG optimize.py file:", os.path.abspath(__file__))
print("DEBUG working directory:", os.getcwd())

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


def _disable_optimizer_plot_callback(optimizer):
    """Stop LumOpt from invoking Matplotlib callback paths."""
    if optimizer is None:
        return
    for attr in ("callback", "plotting_function"):
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
radius = 10e-6
output_x = radius


# -----------------------------------------------------------------------------
# Geometry constants and optimizer dimensions
# -----------------------------------------------------------------------------
WG_length = 5e-6
WG_width = 0.8e-6
Thickness = 0.6e-6
mesh = 20e-9
etch_depth = 0.3e-6
Sidewall_angle_deg = 70.0
WG_top_width = 0.8e-6
WG_bottom_width = WG_top_width + 2.0 * etch_depth / np.tan(np.deg2rad(Sidewall_angle_deg))
WG_width = WG_top_width
WG_effective_width = 0.5 * (WG_top_width + WG_bottom_width)

N_SEGMENTS = 20
N_CENTERLINE_POINTS = 100
N_RAW_POINTS = 400
CURVATURE_CONTROL_SCALE = 0.35
DEBUG_FDTD_SNAPSHOT = True
DEBUG_OBJECT_NAMES = (
    "FDTD",
    "fom",
    "opt_fields",
    "input_waveguide",
    "output_waveguide",
    OPT_BEND_BUILDER_NAME if "OPT_BEND_BUILDER_NAME" in globals() else "optimized_core",
)


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


def _safe_getnamed(fdtd, name, prop):
    try:
        return fdtd.getnamed(name, prop)
    except Exception as exc:
        return "ERROR: %s" % exc


def _safe_getnamednumber(fdtd, name):
    try:
        return int(_lumerical_scalar(fdtd.getnamednumber(name)))
    except Exception:
        return 0


def _debug_fdtd_state(fdtd, label):
    print("========== FDTD DEBUG:", label, "==========")

    for name in DEBUG_OBJECT_NAMES:
        count = _safe_getnamednumber(fdtd, name)
        print("object", name, "count =", count)
        if count <= 0:
            continue

        for prop in ("x", "y", "z", "x span", "y span", "z span", "material", "mesh order"):
            print(" ", name, prop, "=", _safe_getnamed(fdtd, name, prop))

    for script in (
        '?"layoutmode=" + num2str(layoutmode);',
        '?"simulation status=" + num2str(getresult("FDTD","status"));',
    ):
        try:
            fdtd.eval(script)
        except Exception as exc:
            print("debug eval failed:", script, exc)

    if DEBUG_FDTD_SNAPSHOT:
        try:
            debug_fsp = os.path.join(cur_path, "debug_before_forward_solve.fsp").replace("\\", "/")
            fdtd.eval('save("%s");' % debug_fsp)
            print("Saved FDTD debug snapshot:", debug_fsp)
        except Exception as exc:
            print("Could not save FDTD debug snapshot:", exc)

    print("======== END FDTD DEBUG:", label, "========")


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

    _debug_fdtd_state(fdtd, "after sidewall_bend_layerbuilder only_update=%s" % only_update)


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

    _disable_optimizer_plot_callback(optimizer)

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
        results = opt.run()
    except KeyboardInterrupt:
        print('Interrupted by user. Attempting to stop FDTD sessions...')
        _stop_fdtd_for_superopt(opt, label='keyboard interrupt')
        _keep_fdtd_session_open()
        return None
    except Exception:
        print("Optimization raised a real exception; dumping FDTD state before re-raise.")
        try:
            _debug_fdtd_state(opt.sim.fdtd, "exception path")
        except Exception as debug_exc:
            print("Could not dump exception-path FDTD state:", debug_exc)
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


def _fmt_lsf_value(value):
    if isinstance(value, (int, float, np.integer, np.floating)):
        return '%.16g' % float(value)
    return str(value)


def _build_runtime_lsf(template):
    values = {
        "__RADIUS__": _fmt_lsf_value(radius),
        "__OUTPUT_X__": _fmt_lsf_value(output_x),
        "__WG_LENGTH__": _fmt_lsf_value(WG_length),
        "__WG_TOP_WIDTH__": _fmt_lsf_value(WG_top_width),
        "__WG_WIDTH__": _fmt_lsf_value(WG_width),
        "__WG_BOTTOM_WIDTH__": _fmt_lsf_value(WG_bottom_width),
        "__WG_EFFECTIVE_WIDTH__": _fmt_lsf_value(WG_effective_width),
        "__THICKNESS__": _fmt_lsf_value(Thickness),
        "__ETCH_DEPTH__": _fmt_lsf_value(etch_depth),
        "__ANGLE__": _fmt_lsf_value(Sidewall_angle_deg),
        "__MESH__": _fmt_lsf_value(mesh),
    }

    for token, value in values.items():
        template = template.replace(token, value)
    return template


# -----------------------------------------------------------------------------
# Base simulation script
# -----------------------------------------------------------------------------
cur_path = os.path.dirname(os.path.abspath(__file__))

bent_base = load_from_lsf(os.path.join(cur_path, 'optimize_debug.lsf'))
bent_base = _build_runtime_lsf(bent_base)

runtime_debug_lsf_path = os.path.join(cur_path, "optimize_debug_runtime.lsf")
with open(runtime_debug_lsf_path, "w") as runtime_debug_lsf:
    runtime_debug_lsf.write(bent_base)
print("Wrote debug runtime LSF:", runtime_debug_lsf_path)


# -----------------------------------------------------------------------------
# Output / wavelength setup
# -----------------------------------------------------------------------------
example_directory = os.getcwd()
wavelengths = Wavelengths(start=1550e-9, stop=1550e-9, points=1)


# -----------------------------------------------------------------------------
# Initial bend parameters
# -----------------------------------------------------------------------------
# Zero parameters seed a constant-curvature bend. A tiny sinusoidal seed is used
# to avoid starting exactly at a stationary point where gradient checks can read
# as zero and L-BFGS-B exits before any movement.
initial_params = 1e-3 * np.sin(np.linspace(0.0, 2.0 * np.pi, N_SEGMENTS, endpoint=False))
bounds = [(-1.0, 1.0)] * initial_params.size


# -----------------------------------------------------------------------------
# Run
# -----------------------------------------------------------------------------
runSim(initial_params=initial_params, bounds=bounds, base_script=bent_base)


######## EXPORT OPTIMIZED STRUCTURE TO GDS ########
