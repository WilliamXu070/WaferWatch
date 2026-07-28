import sys
import os
import numpy as np
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


# ---------- PARAMETERS ----------
R = 25e-6                 # target starting bend radius used to set arc length scale
W = 1.83e-6               # waveguide width
H = 1.0e-6                # waveguide thickness
n_bg = 1.44               # SiO2
n_ln = 2.20               # scalar LN approximation for optimization
L_in = 8e-6                # straight input section length (for monitor/monitor placement coherence)
L_out = 8e-6               # straight output section length
WG_OVERLAP = 0.2e-6        # overlap with straight sections

wavelengths = Wavelengths(start=1550e-9, stop=1550e-9, points=1)
base_template = os.path.join(os.path.dirname(__file__), "base.lsf")
if not os.path.exists(base_template):
    base_template = os.path.join(os.path.dirname(__file__), "base.gds")
if not os.path.exists(base_template):
    raise FileNotFoundError("Could not find base.lsf or base.gds in script directory.")

base_runtime_script = os.path.join(os.path.dirname(__file__), "base_runtime.lsf")


# ---------- OPTIMIZABLE 90 DEGREE BEND ----------
num_segments = 100
initial_params = np.full(num_segments, 5.0)      # curvature slope parameters (sigmoid near 0.99)
bounds = [(-8.0, 8.0)] * num_segments          # raw params mapped to [0,1] by sigmoid

# Arc-length grid for the 100 segment centerline knots (single center curve)
s_total = (np.pi / 2) * R                        # baseline quarter-circle arc length
s_knots = np.linspace(0.0, s_total, num_segments + 1)

# Dense reconstruction grid for smooth side generation (polygon)
centerline_eval_points = 2000

# Hard constraint: dκ/ds at segment level (manifold/manufacturability and smooth interfaces)
kappa_slew_limit = 2.05e9


def bend_polygon(params=initial_params):
    """Create a single-center-line bend from monotone curvature segments.

    Requirements satisfied by construction:
    1) curvature starts at 0
    2) curvature at each knot is increasing (cumulative positive increments)
    3) smooth junctions via C1 interpolation (PCHIP) and integration
    4) explicit derivative of curvature is available for diagnostics
    """

    # 1) hard-bounded curvature slope. Curvature starts at 0 and is nondecreasing.
    ds_segment = s_total / num_segments
    delta_kappa = _sigmoid(np.asarray(params)) * (kappa_slew_limit * ds_segment)
    kappa_slew_est = np.max(np.abs(np.diff(np.cumsum(delta_kappa) / ds_segment)))

    # 2) centerline curvature at knots: starts at 0, then strictly increasing
    kappa_knots = np.zeros(num_segments + 1)
    kappa_knots[1:] = np.cumsum(delta_kappa)

    s_fine = np.linspace(0.0, s_total, centerline_eval_points)
    kappa_f = PchipInterpolator(s_knots, kappa_knots)
    kappa_dense = kappa_f(s_fine)
    curv_derivative = np.gradient(kappa_dense, s_fine, edge_order=2)

    # 3) Force final bend of π/2 only if it does not violate the hard slew bound.
    #    If needed scale > 1, we keep the hard-constrained profile.
    angle_span = np.trapezoid(kappa_dense, s_fine)
    if angle_span <= 0 or not np.isfinite(angle_span):
        angle_span = np.pi / 2
    kappa_scale = min(1.0, (np.pi / 2) / angle_span)
    if kappa_scale < 1.0:
        kappa_knots *= kappa_scale
        kappa_dense *= kappa_scale
        curv_derivative *= kappa_scale
        # Rebuild with scaling to keep interpolation-consistent values
        kappa_f = PchipInterpolator(s_knots, kappa_knots)
        kappa_dense = kappa_f(s_fine)
        curv_derivative = np.gradient(kappa_dense, s_fine, edge_order=2)

    # Recompute with scaled curvature
    ds = np.diff(s_fine)
    dtheta = 0.5 * (kappa_dense[:-1] + kappa_dense[1:]) * ds
    theta = np.concatenate(([0.0], np.cumsum(dtheta)))

    # 4) centerline integration from Frenet equations
    # x' = cos(theta), y' = sin(theta), with midpoint integration for smoothness
    dx = 0.5 * (np.cos(theta[:-1]) + np.cos(theta[1:])) * ds
    dy = 0.5 * (np.sin(theta[:-1]) + np.sin(theta[1:])) * ds
    x = np.concatenate(([0.0], np.cumsum(dx)))
    y = np.concatenate(([0.0], np.cumsum(dy)))
    center = np.column_stack((x, y))

    # Unit normals along centerline from tangent angle
    normal = np.column_stack((-np.sin(theta), np.cos(theta)))

    # Build polygon from upper and lower offsets of single centerline
    outer = center + (W / 2.0) * normal
    inner = center - (W / 2.0) * normal
    points = np.vstack((outer, inner[::-1]))

    # Enforce CCW orientation (required by many CAD/FEM meshing kernels)
    if _polygon_area(points) < 0:
        points = points[::-1]

    # Safety: keep diagnostics attached for inspection when needed
    bend_polygon._last_kappa_knots = kappa_knots
    bend_polygon._last_kappa_dense = kappa_dense
    bend_polygon._last_kappa_derivative = curv_derivative
    bend_polygon._last_slew_est = kappa_slew_est
    bend_polygon._last_center = center
    bend_polygon._last_outer = outer
    bend_polygon._last_inner = inner
    return points


def _num(v):
    """Format float/int for deterministic Lumerical injection."""
    return f"{float(v):.15g}"


def _write_runtime_base_script(params=initial_params):
    """Generate a runtime .lsf with per-run monitor/mesh placement variables."""
    # Evaluate once with the current params to extract the bend endpoint.
    _ = bend_polygon(params)
    end_x, end_y = bend_polygon._last_center[-1]

    # Position update rules:
    # - Output guide center sits at the bend end plus straight extension.
    # - FOM is near output straight section.
    # - Field/mesh/FDTD centers track bend endpoint to avoid fixed-location breaks.
    runtime_vars = {
        "WG_OUT_X": end_x,
        "WG_OUT_Y": end_y + L_out / 2 - WG_OVERLAP / 2,
        "FOM_X": end_x,
        "FOM_Y": end_y + L_out - 1e-6,
        "FIELD_X": max(end_x, 0.0) / 2.0,
        "FIELD_Y": max(end_y, 0.0) / 2.0,
        "FDTD_X": max(end_x, 0.0) / 2.0,
        "FDTD_Y": max(end_y, 0.0) / 2.0,
        "MESH_X": max(end_x, 0.0) / 2.0,
        "MESH_Y": max(end_y, 0.0) / 2.0,
        "FDTD_X_SPAN": max(45e-6, max(end_x, 0.0) + 12e-6),
        "FDTD_Y_SPAN": max(45e-6, max(end_y, 0.0) + 12e-6),
        "MESH_X_SPAN": max(R + 12e-6, max(end_x, 0.0) + 12e-6),
        "MESH_Y_SPAN": max(R + 12e-6, max(end_y, 0.0) + 12e-6),
    }

    with open(base_template, "r") as fh:
        template = fh.read()

    runtime_script = template
    for k, v in runtime_vars.items():
        runtime_script = runtime_script.replace(f"__{k}__", _num(v))

    # Safety check: fail fast if any placeholder was missed
    if "__" in runtime_script:
        missing = []
        for token in ["__WG_OUT_X__", "__WG_OUT_Y__", "__FOM_X__", "__FOM_Y__",
                      "__FIELD_X__", "__FIELD_Y__", "__FDTD_X__", "__FDTD_Y__",
                      "__FDTD_X_SPAN__", "__FDTD_Y_SPAN__", "__MESH_X__", "__MESH_Y__",
                      "__MESH_X_SPAN__", "__MESH_Y_SPAN__"]:
            if token in runtime_script:
                missing.append(token)
        raise RuntimeError(f"Runtime base script token replacement incomplete. Missing: {missing}")

    with open(base_runtime_script, "w") as fh:
        fh.write(runtime_script)
    return base_runtime_script


geometry = FunctionDefinedPolygon(
    func=bend_polygon,
    initial_params=initial_params,
    bounds=bounds,
    z=0.5e-6,
    depth=H,
    eps_out=n_bg ** 2,
    eps_in=n_ln ** 2,
    edge_precision=5,
    dx=1e-9
)


# ---------- FIGURE OF MERIT ----------
fom = ModeMatch(
    monitor_name="fom",
    mode_number=1,
    direction="Forward",
    multi_freq_src=False,
    target_T_fwd=lambda wl: np.ones(wl.size),
    norm_p=1
)


# ---------- OPTIMIZER ----------
optimizer = ScipyOptimizers(
    max_iter=40,
    method="L-BFGS-B",
    scaling_factor=1e6,
    pgtol=1e-9
)


# ---------- RUN ----------
base_script = _write_runtime_base_script(initial_params)
opt = Optimization(
    base_script=base_script,
    wavelengths=wavelengths,
    fom=fom,
    geometry=geometry,
    optimizer=optimizer,
    use_var_fdtd=True,
    hide_fdtd_cad=False,
    use_deps=True
)

opt.init_plotter()
opt.plotter.movie = False
opt.run()
