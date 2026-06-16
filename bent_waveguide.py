import sys
import os
import numpy as np
from scipy.interpolate import PchipInterpolator
from bent_core_polygon import radial_centerline, single_core_polygon as build_single_core_polygon
from bent_waveguide_config import (
    DEFAULT_ETCH_DEPTH,
    DEFAULT_FOOTPRINT,
    DEFAULT_INPUT_ARM_LENGTH,
    DEFAULT_OUTPUT_ARM_LENGTH,
    DEFAULT_SIDEWALL_ANGLE,
    DEFAULT_THICKNESS,
    DEFAULT_WG_TOP_WIDTH,
)

try:
    import gdstk
except ImportError:
    gdstk = None

sys.path.insert(0, r"C:\Program Files\ANSYS Inc\v251\Lumerical\api\python")
custom_lumopt_path = os.getenv('LUMOPT_PATH', r"C:\Users\PIC\Desktop\WeDaBest\LumOpt")
USING_CUSTOM_LUMOPT = False
if os.path.isdir(custom_lumopt_path):
    sys.path.insert(0, custom_lumopt_path)
    USING_CUSTOM_LUMOPT = True
import scipy as sp
import scipy.misc as scipy_misc

if not hasattr(scipy_misc, "derivative"):
    def _scipy_misc_derivative(func, x0, dx=1.0, n=1, args=(), order=3):
        if n != 1:
            raise NotImplementedError("Only first derivative compatibility is implemented.")
        return (func(x0 + dx, *args) - func(x0 - dx, *args)) / (2.0 * dx)

    scipy_misc.derivative = _scipy_misc_derivative
    sp.misc.derivative = _scipy_misc_derivative

try:
    import lumapi
    from lumopt import CONFIG
    from lumopt.utilities.wavelengths import Wavelengths
    from lumopt.geometries.polygon import FunctionDefinedPolygon
    from lumopt.utilities.materials import Material
    from lumopt.figures_of_merit.modematch import ModeMatch
    from lumopt.optimizers.generic_optimizers import ScipyOptimizers
    from lumopt.optimization import Optimization
    from lumopt.utilities import plotter as lumopt_plotter
except ImportError:
    lumapi = None
    CONFIG = None
    Wavelengths = None
    FunctionDefinedPolygon = None
    Material = None
    ModeMatch = None
    ScipyOptimizers = None
    Optimization = None
    lumopt_plotter = None


def disable_lumopt_snapshots():
    """Avoid LumOpt/Matplotlib SnapShots crashes on newer Matplotlib versions."""

    if lumopt_plotter is not None and hasattr(lumopt_plotter, "SnapShots"):
        lumopt_plotter.SnapShots.grab_frame = lambda self, **kwargs: None
        lumopt_plotter.SnapShots.finish = lambda self: None




######## BASE SIMULATION ########
cur_path = os.path.dirname(os.path.abspath(__file__))
LSF_FILE = os.path.join(cur_path, 'bent_waveguide.lsf')
RUNTIME_LSF_FILE = os.getenv('BENT_RUNTIME_LSF', os.path.join(cur_path, 'base_runtime.lsf'))
DEBUG_GEOMETRY = ('--debug-geometry' in sys.argv) or (os.getenv('BENT_DEBUG_GEOMETRY') == '1')
DEBUG_GRADIENT = ('--debug-gradient' in sys.argv) or (os.getenv('BENT_DEBUG_GRADIENT') == '1')
DEBUG_LSF = ('--debug-lsf' in sys.argv) or (os.getenv('BENT_DEBUG_LSF') == '1')
INIT_ONLY = ('--init-only' in sys.argv) or (os.getenv('BENT_INIT_ONLY') == '1')
LUMOPT_INIT_ONLY = ('--lumopt-init-only' in sys.argv) or (os.getenv('BENT_LUMOPT_INIT_ONLY') == '1')
GEOMETRY_INIT_ONLY = ('--geometry-init-only' in sys.argv) or (os.getenv('BENT_GEOMETRY_INIT_ONLY') == '1')
BASE_FOM_ONLY = ('--base-fom-only' in sys.argv) or (os.getenv('BENT_BASE_FOM_ONLY') == '1')
FULL_OPTIMIZATION = ('--full-optimization' in sys.argv) or (os.getenv('BENT_FULL_OPTIMIZATION') == '1')
LOAD_ONLY = ('--load-only' in sys.argv) or (os.getenv('BENT_LOAD_ONLY') == '1')
NO_RUN = ('--no-run' in sys.argv) or (os.getenv('BENT_NO_RUN') == '1')
WRITE_BASE_ONLY = ('--write-base-only' in sys.argv) or (os.getenv('BENT_WRITE_BASE_ONLY') == '1')
EXPORT_ONLY = ('--export-only' in sys.argv) or (os.getenv('BENT_EXPORT_ONLY') == '1')
KEEP_OPEN = ('--keep-open' in sys.argv) or (os.getenv('BENT_KEEP_OPEN') == '1')
QUICK_TEST = ('--quick-test' in sys.argv) or (os.getenv('BENT_QUICK_TEST') == '1')
CENTER_ONLY = ('--center-only' in sys.argv) or (os.getenv('BENT_CENTER_ONLY') == '1')
OPTIMIZE_BEND_ONLY = ('--bend-only' in sys.argv) or (os.getenv('BENT_OPTIMIZE_BEND_ONLY') == '1')
USE_VAR_FDTD = ('--var-fdtd' in sys.argv) or (os.getenv('BENT_USE_VAR_FDTD') == '1')
DISABLE_PLOTS = ('--no-plot' in sys.argv) or (os.getenv('BENT_NO_PLOT') == '1')
ENABLE_PLOTS = (not DISABLE_PLOTS) and (
    USING_CUSTOM_LUMOPT
    or ('--plot-history' in sys.argv)
    or (os.getenv('BENT_PLOT_HISTORY') == '1')
)

if not ENABLE_PLOTS:
    disable_lumopt_snapshots()


def cli_value(flag, default, cast):
    if flag in sys.argv:
        flag_index = sys.argv.index(flag)
        if flag_index + 1 >= len(sys.argv):
            raise ValueError('Missing value after %s' % flag)
        return cast(sys.argv[flag_index + 1])
    return cast(default)


def cli_optional_float(flag, env_name=None, default=None):
    if flag in sys.argv:
        flag_index = sys.argv.index(flag)
        if flag_index + 1 >= len(sys.argv):
            raise ValueError('Missing value after %s' % flag)
        value = sys.argv[flag_index + 1]
    elif env_name is not None and os.getenv(env_name) is not None:
        value = os.getenv(env_name)
    else:
        return default

    if str(value).strip().lower() in ('none', 'off', 'false', ''):
        return None
    return float(value)

######## DIRECTORY FOR GDS EXPORT #########
example_directory = cur_path

######## SPECTRAL RANGE #########
if Wavelengths is not None:
    wavelengths = Wavelengths(start = 1550e-9, stop = 1550e-9, points = 1)
else:
    wavelengths = None

###################### PARAMETERS #################
Footprint=cli_value('--footprint', os.getenv('BENT_FOOTPRINT', DEFAULT_FOOTPRINT), float)
Thickness=cli_value('--thickness', os.getenv('BENT_THICKNESS', DEFAULT_THICKNESS), float)
# mesh=50e-9
etch_depth=cli_value('--etch-depth', os.getenv('BENT_ETCH_DEPTH', DEFAULT_ETCH_DEPTH), float)
WG_top_width=cli_value('--wg-top-width', os.getenv('BENT_WG_TOP_WIDTH', DEFAULT_WG_TOP_WIDTH), float)
Sidewall_angle=cli_value('--sidewall-angle', os.getenv('BENT_SIDEWALL_ANGLE', DEFAULT_SIDEWALL_ANGLE), float)
WG_bottom_width=WG_top_width + 2.0*etch_depth/np.tan(np.deg2rad(Sidewall_angle))
WG_effective_width=0.5*(WG_top_width + WG_bottom_width)
WIDTH_BASIS=cli_value('--width-basis', os.getenv('BENT_WIDTH_BASIS', 'bottom'), str)
if WIDTH_BASIS == 'top':
    WG_width = WG_top_width
elif WIDTH_BASIS == 'effective':
    WG_width = WG_effective_width
elif WIDTH_BASIS == 'bottom':
    WG_width = WG_bottom_width
else:
    raise ValueError('Unsupported --width-basis %s. Use top, effective, or bottom.' % WIDTH_BASIS)
input_arm_length=cli_value('--input-arm-length', os.getenv('BENT_INPUT_ARM_LENGTH', DEFAULT_INPUT_ARM_LENGTH), float)
output_arm_length=cli_value('--output-arm-length', os.getenv('BENT_OUTPUT_ARM_LENGTH', DEFAULT_OUTPUT_ARM_LENGTH), float)
n_air=1.0
n_ln=2.20
N=cli_value('--n', 16 if QUICK_TEST else 64, int)
MAX_ITER=cli_value('--max-iter', 1 if QUICK_TEST else 40, int)
OPTIMIZE_WIDTH=False
USE_DEPS=True
GEOMETRY_MODE=cli_value('--geometry', 'radial-bspline', str)
if GEOMETRY_MODE not in ('radial-bspline', 'curvature'):
    raise ValueError('Unsupported --geometry %s. Use radial-bspline or curvature.' % GEOMETRY_MODE)
B_SPLINE_BOUND=cli_value('--bspline-bound', 3.0e-6, float)
SHAPE_DERIVATIVE_STEP=cli_value(
    '--shape-dx',
    1.0e-9 if GEOMETRY_MODE == 'radial-bspline' else 0.5,
    float
)
INITIAL_GRADIENT_SCALE=cli_optional_float('--scale-initial-gradient-to', 'BENT_SCALE_INITIAL_GRADIENT_TO', None)

######## OPTIMIZABLE GEOMETRY ########
# The default radial B-spline mode follows the paper/reference style more
# closely than the old dimensionless curvature logits. Its parameters are
# physical radial control-point offsets in meters, so LumOpt can use the same
# 1e6 optimizer scaling convention as the reference polarization rotator.
num_segments = N
centerline_eval_points = cli_value('--samples', 250 if QUICK_TEST else 800, int)
kappa_slew_limit = cli_value('--kappa-slew-limit', 2.05e9, float)
initial_param_value = cli_value('--initial-param', 0.0, float)
s_total = (np.pi/2)*Footprint
s_knots = np.linspace(0.0, s_total, num_segments + 1)


def _sigmoid(x):
    x = np.clip(x, -60.0, 60.0)
    return 1.0/(1.0 + np.exp(-x))


def _polygon_area(points):
    x = points[:, 0]
    y = points[:, 1]
    return 0.5*np.sum(x*np.roll(y, -1) - y*np.roll(x, -1))


def _num(v):
    arr = np.asarray(v, dtype=float).ravel()
    if arr.size == 0:
        return 'nan'
    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        return 'nan'
    if finite.size == 1:
        return '%.15g' % float(finite[0])
    return '[' + ', '.join('%.15g' % float(value) for value in finite) + ']'


def _transmission_loss_metrics(transmission):
    transmission = np.asarray(transmission, dtype=float).ravel()
    finite_positive = transmission[np.isfinite(transmission) & (transmission > 0)]

    if finite_positive.size == 0:
        return {
            't_min': np.nan,
            't_mean': np.nan,
            't_max': np.nan,
            'loss_min_db': np.nan,
            'loss_mean_db': np.nan,
            'loss_max_db': np.nan,
        }

    loss_db = -10.0*np.log10(np.maximum(finite_positive, 1e-300))
    return {
        't_min': np.min(finite_positive),
        't_mean': np.mean(finite_positive),
        't_max': np.max(finite_positive),
        'loss_min_db': np.min(loss_db),
        'loss_mean_db': np.mean(loss_db),
        'loss_max_db': np.max(loss_db),
    }


def print_fom_transmission_report(label, fom_value=None, fom_obj=None):
    transmission = None
    if fom_obj is not None and hasattr(fom_obj, 'T_fwd_vs_wavelength'):
        transmission = getattr(fom_obj, 'T_fwd_vs_wavelength')

    if transmission is None:
        print('%s: FOM=%s, transmission unavailable' % (label, _num(fom_value) if fom_value is not None else 'unknown'))
        return

    metrics = _transmission_loss_metrics(transmission)
    fom_text = _num(fom_value) if fom_value is not None else 'unknown'
    print(
        '%s: FOM=%s, T_mean=%s, T_min=%s, T_max=%s, loss_mean_dB=%s, loss_max_dB=%s'
        % (
            label,
            fom_text,
            _num(metrics['t_mean']),
            _num(metrics['t_min']),
            _num(metrics['t_max']),
            _num(metrics['loss_mean_db']),
            _num(metrics['loss_max_db']),
        )
    )


def install_lumopt_transmission_reporter():
    if Optimization is None:
        return

    if getattr(Optimization, '_bent_waveguide_reporter_installed', False):
        return

    if hasattr(Optimization, 'process_forward_sim'):
        original_process_forward_sim = Optimization.process_forward_sim

        def process_forward_sim_with_report(self, *args, **kwargs):
            result = original_process_forward_sim(self, *args, **kwargs)

            fom_value = None
            if isinstance(result, tuple) and result:
                fom_value = result[0]
            else:
                fom_value = result

            try:
                print_fom_transmission_report('Forward transmission summary', fom_value, self.fom)
            except Exception as exc:
                print('Forward transmission summary unavailable:', exc)

            return result

        Optimization.process_forward_sim = process_forward_sim_with_report
        Optimization._bent_waveguide_reporter_installed = True
        return

    if hasattr(Optimization, 'callable_fom'):
        original_callable_fom = Optimization.callable_fom

        def callable_fom_with_report(self, *args, **kwargs):
            result = original_callable_fom(self, *args, **kwargs)

            try:
                print_fom_transmission_report('Forward transmission summary', result, self.fom)
            except Exception as exc:
                print('Forward transmission summary unavailable:', exc)

            return result

        Optimization.callable_fom = callable_fom_with_report
        Optimization._bent_waveguide_reporter_installed = True
        return

    print('LumOpt transmission reporter skipped: no compatible forward-FOM hook found.')


install_lumopt_transmission_reporter()


def _curvature_centerline_from_params(params):
    params = np.asarray(params, dtype=float)
    if params.size != num_segments:
        raise ValueError('Expected %d curvature parameters, got %d' % (num_segments, params.size))

    ds_segment = s_total/num_segments
    delta_kappa = _sigmoid(params) * (kappa_slew_limit * ds_segment)

    kappa_knots = np.zeros(num_segments + 1)
    kappa_knots[1:] = np.cumsum(delta_kappa)

    s_fine = np.linspace(0.0, s_total, centerline_eval_points)
    kappa_f = PchipInterpolator(s_knots, kappa_knots)
    kappa_dense = kappa_f(s_fine)

    raw_angle_span = np.trapezoid(kappa_dense, s_fine)
    if raw_angle_span <= 0 or not np.isfinite(raw_angle_span):
        raw_angle_span = np.pi/2

    kappa_scale = (np.pi/2)/raw_angle_span
    kappa_knots = kappa_knots*kappa_scale
    kappa_f = PchipInterpolator(s_knots, kappa_knots)
    kappa_dense = kappa_f(s_fine)

    ds = np.diff(s_fine)
    dtheta = 0.5*(kappa_dense[:-1] + kappa_dense[1:])*ds
    theta = np.concatenate(([0.0], np.cumsum(dtheta)))

    dx = 0.5*(np.cos(theta[:-1]) + np.cos(theta[1:]))*ds
    dy = 0.5*(np.sin(theta[:-1]) + np.sin(theta[1:]))*ds
    x = np.concatenate(([0.0], np.cumsum(dx)))
    y = np.concatenate(([0.0], np.cumsum(dy)))

    end_x = x[-1]
    end_y = y[-1]
    if abs(end_x) < 1e-18 or abs(end_y) < 1e-18:
        raise ValueError('Invalid integrated centerline endpoint.')

    # Keep the current .lsf source/FOM anchors valid by mapping the integrated
    # curve back to the requested square footprint.
    x = x*(Footprint/end_x)
    y = y*(Footprint/end_y)
    center = np.column_stack((x, y))

    tangent_x = np.gradient(center[:, 0], s_fine, edge_order=2)
    tangent_y = np.gradient(center[:, 1], s_fine, edge_order=2)
    theta = np.unwrap(np.arctan2(tangent_y, tangent_x))

    _curvature_centerline_from_params.last_center = center
    _curvature_centerline_from_params.last_theta = theta
    _curvature_centerline_from_params.last_kappa_knots = kappa_knots
    _curvature_centerline_from_params.last_kappa_dense = kappa_dense
    _curvature_centerline_from_params.last_raw_angle_span = raw_angle_span
    _curvature_centerline_from_params.last_kappa_scale = kappa_scale
    return center, theta


def _radial_bspline_centerline_from_params(params):
    params = np.asarray(params, dtype=float)
    if params.size != num_segments:
        raise ValueError('Expected %d radial parameters, got %d' % (num_segments, params.size))

    center, theta = radial_centerline(params, Footprint, centerline_eval_points)

    _radial_bspline_centerline_from_params.last_center = center
    _radial_bspline_centerline_from_params.last_theta = theta
    return center, theta


def _centerline_from_params(params):
    if GEOMETRY_MODE == 'radial-bspline':
        center, theta = _radial_bspline_centerline_from_params(params)
    else:
        center, theta = _curvature_centerline_from_params(params)

    _centerline_from_params.last_center = center
    _centerline_from_params.last_theta = theta
    return center, theta


def bend_polygon(params):
    """Generate the bend-only polygon, matching the working LumOpt sample style."""
    center, theta = _centerline_from_params(params)
    normal = np.column_stack((-np.sin(theta), np.cos(theta)))
    outer = center - (WG_width/2)*normal
    inner = center + (WG_width/2)*normal
    points = np.vstack((outer, inner[::-1]))

    if _polygon_area(points) < 0:
        points = points[::-1]

    bend_polygon._last_center = center
    bend_polygon._last_theta = theta
    bend_polygon._last_outer = outer
    bend_polygon._last_inner = inner
    return points


def single_piece_device_polygon_with_width(params, width):
    """One continuous core polygon using the requested top-view width."""

    points, center, theta, bend_center, bend_theta = build_single_core_polygon(
        params=params,
        footprint=Footprint,
        wg_width=width,
        input_arm_length=input_arm_length,
        output_arm_length=output_arm_length,
        samples=centerline_eval_points,
    )

    single_piece_device_polygon_with_width._last_center = center
    single_piece_device_polygon_with_width._last_theta = theta
    single_piece_device_polygon_with_width._last_bend_center = bend_center
    single_piece_device_polygon_with_width._last_bend_theta = bend_theta
    return points


def single_piece_device_polygon(params):
    """Single optimizer core polygon, widened to the selected sidewall basis."""

    points = single_piece_device_polygon_with_width(params, WG_width)
    single_piece_device_polygon._last_center = single_piece_device_polygon_with_width._last_center
    single_piece_device_polygon._last_theta = single_piece_device_polygon_with_width._last_theta
    single_piece_device_polygon._last_bend_center = single_piece_device_polygon_with_width._last_bend_center
    single_piece_device_polygon._last_bend_theta = single_piece_device_polygon_with_width._last_bend_theta
    return points


def fabrication_top_polygon(params):
    """Top-reference polygon for Layer Builder/GDS sidewall verification."""

    return single_piece_device_polygon_with_width(params, WG_top_width)


def bent_waveguide(params):
    """Backward-compatible name for the full single-piece geometry."""
    return single_piece_device_polygon(params)


if GEOMETRY_MODE == 'radial-bspline':
    initial_params = np.full(num_segments, initial_param_value, dtype=float)
    bounds = [(-B_SPLINE_BOUND, B_SPLINE_BOUND)] * num_segments
else:
    initial_params = np.full(num_segments, initial_param_value)
    bounds = [(-8.0, 8.0)] * num_segments

print('N =', N)
print('MAX_ITER =', MAX_ITER)
print('OPTIMIZE_WIDTH =', OPTIMIZE_WIDTH)
print('GEOMETRY_MODE =', GEOMETRY_MODE)
print('WIDTH_BASIS =', WIDTH_BASIS)
print('WG_top_width =', WG_top_width)
print('WG_effective_width =', WG_effective_width)
print('WG_bottom_width =', WG_bottom_width)
print('WG_width used by optimizer =', WG_width)
print('Sidewall_angle =', Sidewall_angle)
print('B_SPLINE_BOUND =', B_SPLINE_BOUND)
print('SHAPE_DERIVATIVE_STEP =', SHAPE_DERIVATIVE_STEP)
print('INITIAL_GRADIENT_SCALE =', INITIAL_GRADIENT_SCALE)
print('ENABLE_PLOTS =', ENABLE_PLOTS)
print('USING_CUSTOM_LUMOPT =', USING_CUSTOM_LUMOPT)
print('USE_VAR_FDTD =', USE_VAR_FDTD)
print('OPTIMIZE_BEND_ONLY =', OPTIMIZE_BEND_ONLY)
print('INIT_ONLY =', INIT_ONLY)
print('LUMOPT_INIT_ONLY =', LUMOPT_INIT_ONLY)
print('GEOMETRY_INIT_ONLY =', GEOMETRY_INIT_ONLY)
print('BASE_FOM_ONLY =', BASE_FOM_ONLY)
print('KEEP_OPEN =', KEEP_OPEN)
print('centerline_eval_points =', centerline_eval_points)
print('number of design variables =', initial_params.size)


def polygon_diagnostics(polygon_points, label='polygon'):
    edge_vectors = np.roll(polygon_points, -1, axis=0) - polygon_points
    edge_lengths = np.sqrt(np.sum(edge_vectors**2, axis=1))
    signed_area = 0.5*np.sum(
        polygon_points[:,0]*np.roll(polygon_points[:,1], -1)
        - np.roll(polygon_points[:,0], -1)*polygon_points[:,1]
    )

    print('--- %s diagnostics ---' % label)
    print('points:', polygon_points.shape[0])
    print('signed area:', signed_area)
    print('orientation:', 'CCW' if signed_area > 0 else 'CW')
    print('min edge length:', np.min(edge_lengths))
    print('max edge length:', np.max(edge_lengths))
    print('zero/near-zero edges:', np.where(edge_lengths < 1e-15)[0])
    print('first point:', polygon_points[0])
    print('last point:', polygon_points[-1])


def debug_geometry_gradient(params, step=SHAPE_DERIVATIVE_STEP):
    """Check whether each design parameter changes the polygon cleanly."""

    base_polygon = bent_waveguide(params)
    polygon_diagnostics(base_polygon, label='base polygon before gradient check')

    bad_params = []
    max_vertex_shifts = []

    for param_index in range(params.size):
        perturbed = np.array(params, copy=True)
        perturbed[param_index] += step
        perturbed_polygon = bent_waveguide(perturbed)

        if perturbed_polygon.shape != base_polygon.shape:
            bad_params.append((param_index, 'shape changed'))
            continue

        if not np.all(np.isfinite(perturbed_polygon)):
            bad_params.append((param_index, 'non-finite polygon value'))
            continue

        edge_vectors = np.roll(perturbed_polygon, -1, axis=0) - perturbed_polygon
        edge_lengths = np.sqrt(np.sum(edge_vectors**2, axis=1))
        if np.any(edge_lengths < 1e-15):
            bad_params.append((param_index, 'zero-length edge'))
            continue

        vertex_shift = np.sqrt(np.sum((perturbed_polygon - base_polygon)**2, axis=1))
        max_vertex_shifts.append(np.max(vertex_shift))

    print('--- geometry gradient diagnostics ---')
    print('step:', step)
    print('parameters checked:', params.size)
    print('bad parameters:', bad_params)
    if max_vertex_shifts:
        print('min max-vertex-shift:', np.min(max_vertex_shifts))
        print('max max-vertex-shift:', np.max(max_vertex_shifts))

    if bad_params:
        raise RuntimeError('Geometry gradient sanity check failed.')


def _lsf_blocks(script_text):
    blocks = []
    current = []
    start_line = None
    paren_depth = 0
    bracket_depth = 0
    brace_depth = 0

    for line_no, line in enumerate(script_text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith('#') and not current:
            continue

        if start_line is None:
            start_line = line_no

        current.append(line)

        code = stripped.split('#', 1)[0]
        paren_depth += code.count('(') - code.count(')')
        bracket_depth += code.count('[') - code.count(']')
        brace_depth += code.count('{') - code.count('}')

        complete_statement = code.endswith(';') and paren_depth <= 0 and bracket_depth <= 0 and brace_depth <= 0
        complete_block = stripped == '}' and paren_depth <= 0 and bracket_depth <= 0 and brace_depth <= 0

        if complete_statement or complete_block:
            blocks.append((start_line, line_no, '\n'.join(current)))
            current = []
            start_line = None
            paren_depth = 0
            bracket_depth = 0
            brace_depth = 0

    if current:
        blocks.append((start_line, line_no, '\n'.join(current)))

    return blocks


def debug_lsf(script_path):
    print('Debugging LSF script:', script_path)
    with open(script_path, 'r') as f:
        script_text = f.read()

    fdtd = lumapi.FDTD(hide = False)
    for block_index, (start_line, end_line, block) in enumerate(_lsf_blocks(script_text), start=1):
        print('LSF block %d, lines %d-%d' % (block_index, start_line, end_line))
        try:
            fdtd.eval(block)
        except Exception:
            print('FAILED LSF block %d, lines %d-%d' % (block_index, start_line, end_line))
            print(block)
            raise

    print('LSF debug completed without block-level eval failure.')


def load_lsf_only(script_path):
    """Open FDTD, evaluate the complete base LSF once, and stop before optimization."""

    if lumapi is None:
        raise RuntimeError('lumapi is not available; load-only mode requires Lumerical.')

    print('Loading base LSF only:', script_path)
    with open(script_path, 'r') as f:
        script_text = f.read()

    fdtd = lumapi.FDTD(hide = False)
    fdtd.eval(script_text)
    print('Loaded base LSF successfully. Optimization was not started.')
    input('FDTD is open. Press Enter here to close this Python session...')


def require_lumerical_runtime(mode):
    if lumapi is None or Optimization is None:
        raise RuntimeError(mode + ' requires lumapi/LumOpt. Use --write-base-only for offline LSF generation.')


def force_stop_fdtd(fdtd, label='FDTD', attempts=3):
    """Best-effort stop/cleanup for sessions controlled through lumapi."""

    if fdtd is None:
        print(label + ': no FDTD handle available for stop.')
        return

    commands = (
        ('stop script', lambda: fdtd.eval('stop;')),
        ('clear jobs API', lambda: fdtd.clearjobs()),
        ('switch to layout script', lambda: fdtd.eval('switchtolayout;')),
        ('combined cleanup script', lambda: fdtd.eval('stop; clearjobs; switchtolayout;')),
    )

    for attempt in range(1, attempts + 1):
        print('%s cleanup attempt %d/%d' % (label, attempt, attempts))
        for action_name, action in commands:
            try:
                action()
                print('  ' + action_name + ' completed')
            except Exception as exc:
                print('  ' + action_name + ' failed:', exc)


def _replace_lsf_assignment(script_text, name, value):
    """Replace a simple LSF assignment of the form name=...;."""

    lines = script_text.splitlines()
    target = name + '='
    replaced = False

    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith(target) and stripped.endswith(';'):
            indent = line[:len(line) - len(line.lstrip())]
            lines[index] = indent + name + '=' + _num(value) + ';'
            replaced = True
            break

    if not replaced:
        raise RuntimeError('Could not replace LSF assignment for %s' % name)

    return '\n'.join(lines) + '\n'


def runtime_vars_from_params(params):
    """Calculate runtime placement from the current geometry."""

    polygon = single_piece_device_polygon(params)
    center = getattr(single_piece_device_polygon, '_last_center', None)
    theta = getattr(single_piece_device_polygon, '_last_theta', None)

    if center is None or theta is None:
        raise RuntimeError('Geometry was not evaluated before runtime placement.')

    end_x, end_y = center[-1]
    output_end = center[-1]

    x_min = min(np.min(polygon[:, 0]), -input_arm_length)
    x_max = max(np.max(polygon[:, 0]), output_end[0])
    y_min = min(np.min(polygon[:, 1]), -WG_width/2)
    y_max = max(np.max(polygon[:, 1]), output_end[1])

    layout_padding = 5e-6
    layout_x_min = x_min - layout_padding
    layout_x_max = x_max + layout_padding
    layout_y_min = y_min - layout_padding
    layout_y_max = y_max + layout_padding

    return {
        'WG_top_width': WG_top_width,
        'WG_width': WG_width,
        'WG_bottom_width': WG_bottom_width,
        'WG_effective_width': WG_effective_width,
        'Thickness': Thickness,
        'etch_depth': etch_depth,
        'Angle': Sidewall_angle,
        'Footprint': Footprint,
        'input_arm_length': input_arm_length,
        'output_arm_length': output_arm_length,
        'layout_padding': layout_padding,
        'input_port_x': -input_arm_length,
        'input_port_y': 0.0,
        'output_port_x': end_x,
        'output_port_y': output_end[1],
        'core_x_min': x_min,
        'core_x_max': x_max,
        'core_y_min': y_min,
        'core_y_max': y_max,
        'layout_x_min': layout_x_min,
        'layout_x_max': layout_x_max,
        'layout_y_min': layout_y_min,
        'layout_y_max': layout_y_max,
        'layout_x_span': layout_x_max - layout_x_min,
        'layout_y_span': layout_y_max - layout_y_min,
        'layout_x_center': 0.5*(layout_x_min + layout_x_max),
        'layout_y_center': 0.5*(layout_y_min + layout_y_max),
    }


def write_runtime_base_script(params, template_path=LSF_FILE, runtime_path=RUNTIME_LSF_FILE):
    """Write the concrete LSF used by LumOpt or load-only mode."""

    runtime_vars = runtime_vars_from_params(params)

    with open(template_path, 'r') as f:
        runtime_script = f.read()

    for name in (
        'WG_top_width',
        'WG_width',
        'WG_bottom_width',
        'WG_effective_width',
        'Thickness',
        'etch_depth',
        'Angle',
        'Footprint',
        'input_arm_length',
        'output_arm_length',
        'layout_padding',
        'input_port_x',
        'input_port_y',
        'output_port_x',
        'output_port_y',
        'core_x_min',
        'core_x_max',
        'core_y_min',
        'core_y_max',
        'layout_x_min',
        'layout_x_max',
        'layout_y_min',
        'layout_y_max',
        'layout_x_span',
        'layout_y_span',
        'layout_x_center',
        'layout_y_center',
    ):
        runtime_script = _replace_lsf_assignment(runtime_script, name, runtime_vars[name])

    with open(runtime_path, 'w') as f:
        f.write(runtime_script)

    print('Wrote runtime base script:', runtime_path)
    print('Runtime positions:')
    for key in sorted(runtime_vars):
        print('  %s = %s' % (key, _num(runtime_vars[key])))

    return runtime_path


def load_runtime_base_only(params):
    """Write and load the runtime LSF, then keep FDTD open."""

    runtime_script = write_runtime_base_script(params)
    load_lsf_only(runtime_script)


def export_geometry_only(params, output_dir, label):
    """Export params/GDS/plot without launching LumOpt."""

    params_file = os.path.join(output_dir, label + '_params.txt')
    params_npy_file = os.path.join(output_dir, label + '_params.npy')
    gds_file = os.path.join(output_dir, label + '.gds')
    png_file = os.path.join(output_dir, label + '.png')

    np.savetxt(params_file, params)
    np.save(params_npy_file, params)
    write_final_gds(params, gds_file)
    save_geometry_plot(params, png_file, polygon_func=fabrication_top_polygon, title='Top-reference bent waveguide geometry')

    print('Saved params:', params_file)
    print('Saved NumPy params:', params_npy_file)
    print('Saved GDS:', gds_file)
    print('Saved plot:', png_file)


def _find_final_params(results, optimizer, optimization):
    """Best-effort extraction of the final parameter vector from LumOpt objects."""

    candidates = []
    candidates.append(results)
    candidates.append(optimizer)
    candidates.append(optimization)

    if isinstance(results, (list, tuple)):
        candidates.extend(list(results)[::-1])

    for candidate in candidates:
        if candidate is None:
            continue

        if isinstance(candidate, np.ndarray):
            arr = np.asarray(candidate, dtype=float).ravel()
            if arr.size == initial_params.size:
                return arr

        if isinstance(candidate, dict):
            for key in ('x', 'params', 'final_params', 'optimized_params', 'best_params'):
                value = candidate.get(key)
                if value is not None:
                    arr = np.asarray(value, dtype=float).ravel()
                    if arr.size == initial_params.size:
                        return arr

        for attr in ('x', 'params', 'current_params', 'final_params', 'optimized_params', 'best_params'):
            if hasattr(candidate, attr):
                value = getattr(candidate, attr)
                if value is not None:
                    arr = np.asarray(value, dtype=float).ravel()
                    if arr.size == initial_params.size:
                        return arr

    raise RuntimeError('Could not extract final optimized parameters from LumOpt results.')


def _optimizer_scaling_factor():
    return 1.0e6 if GEOMETRY_MODE == 'radial-bspline' else 1.0


def _bounds_abs_max(bounds):
    finite_values = []
    for lower, upper in bounds:
        for value in (lower, upper):
            if value is not None and np.isfinite(value):
                finite_values.append(abs(float(value)))
    return max(finite_values) if finite_values else np.inf


def normalize_final_params_from_optimizer(raw_params, bounds):
    """Convert LumOpt's scaled optimizer coordinates back to physical units."""

    params = np.asarray(raw_params, dtype=float).ravel()
    scaling_factor = _optimizer_scaling_factor()
    physical_bound = _bounds_abs_max(bounds)

    if scaling_factor == 1.0 or not np.isfinite(physical_bound) or params.size == 0:
        return params

    max_abs = float(np.nanmax(np.abs(params)))
    scaled_bound = physical_bound*scaling_factor

    if max_abs <= 1.01*physical_bound:
        return params

    if max_abs <= 1.01*scaled_bound:
        corrected = params/scaling_factor
        print(
            'Detected scaled optimizer final parameters; converting by /%s so export uses physical meters.'
            % _num(scaling_factor)
        )
        print(
            '  raw max_abs=%s, corrected max_abs=%s, physical bound max_abs=%s'
            % (_num(max_abs), _num(np.nanmax(np.abs(corrected))), _num(physical_bound))
        )
        return corrected

    raise ValueError(
        'Final parameters are outside both physical and scaled bounds. '
        'max_abs=%s, physical_bound=%s, scaled_bound=%s'
        % (_num(max_abs), _num(physical_bound), _num(scaled_bound))
    )


def save_final_design(final_params, output_dir):
    """Save final params, polygon vertices, and an LSF script that exports GDS."""

    final_polygon = fabrication_top_polygon(final_params)
    optimization_polygon = bent_waveguide(final_params)

    params_file = os.path.join(output_dir, 'bent_waveguide_final_params.txt')
    params_npy_file = os.path.join(output_dir, 'final_params.npy')
    polygon_file = os.path.join(output_dir, 'bent_waveguide_final_polygon.txt')
    optimization_polygon_file = os.path.join(output_dir, 'bent_waveguide_final_optimizer_surrogate_polygon.txt')
    export_script_file = os.path.join(output_dir, 'export_final_bent_waveguide.lsf')
    gds_file = os.path.join(output_dir, 'bent_waveguide_final.gds')
    png_file = os.path.join(output_dir, 'final_bend_geometry.png')

    np.savetxt(params_file, final_params)
    np.save(params_npy_file, final_params)
    np.savetxt(polygon_file, final_polygon)
    np.savetxt(optimization_polygon_file, optimization_polygon)
    write_final_gds(final_params, gds_file)
    save_geometry_plot(final_params, png_file, polygon_func=fabrication_top_polygon, title='Final top-reference bent waveguide geometry')

    gds_file_lsf = gds_file.replace('\\', '/')

    with open(export_script_file, 'w') as f:
        f.write('# Auto-generated final top-reference GDS export for bent_waveguide.py\n')
        f.write('# Layer 1:0 is intended for Layer Builder MMI-core with process=grow,\n')
        f.write('# gds sidewall angle position reference=Top, sidewall angle %.15g deg.\n' % Sidewall_angle)
        f.write('v = [\n')
        for x, y in final_polygon:
            f.write('    %.16e, %.16e;\n' % (x, y))
        f.write('];\n\n')
        f.write('f = gdsopen("%s", 1e-6, 1e-9);\n' % gds_file_lsf)
        f.write('gdsbegincell(f, "TOP");\n')
        f.write('gdsaddpoly(f, 1, v);\n')
        f.write('gdsendcell(f);\n')
        f.write('gdsclose(f);\n')
        f.write('?"Exported final top-reference bent waveguide GDS";\n')

    print('Saved final parameters:', params_file)
    print('Saved final NumPy parameters:', params_npy_file)
    print('Saved final top-reference polygon:', polygon_file)
    print('Saved optimizer surrogate polygon:', optimization_polygon_file)
    print('Saved final GDS:', gds_file)
    print('Saved final geometry plot:', png_file)
    print('Saved GDS export script:', export_script_file)
    print('Run the export script in Lumerical to create:', gds_file)


def write_final_gds(params, filename):
    """Write the fabrication top-reference polygon directly to GDS."""

    if gdstk is None:
        print('gdstk is not installed; skipping GDS export:', filename)
        return

    final_polygon = fabrication_top_polygon(params)
    final_polygon_um = final_polygon*1e6

    lib = gdstk.Library(unit=1e-6, precision=1e-9)
    cell = lib.new_cell('OPTIMIZED_BENT_WAVEGUIDE')
    poly = gdstk.Polygon(final_polygon_um, layer=1, datatype=0)

    fractured = poly.fracture(max_points=199, precision=1e-6)
    if fractured:
        for fractured_poly in fractured:
            cell.add(fractured_poly)
    else:
        cell.add(poly)

    lib.write_gds(filename)


def save_geometry_plot(params, filename, polygon_func=bent_waveguide, title='Optimized bent waveguide geometry'):
    """Save a static geometry plot independent of LumOpt's plotter."""

    try:
        import matplotlib.pyplot as plt
        import matplotlib.patches as patches
    except ImportError:
        print('matplotlib not installed; skipping geometry plot.')
        return

    final_polygon = polygon_func(params)
    center = getattr(_centerline_from_params, 'last_center', None)
    if center is None:
        center = getattr(single_piece_device_polygon_with_width, '_last_center', None)

    fig, ax = plt.subplots(1, 1, figsize=(8, 8))
    patch = patches.Polygon(
        final_polygon*1e6,
        closed=True,
        edgecolor='blue',
        facecolor='lightblue',
        alpha=0.7,
        linewidth=1.0
    )
    ax.add_patch(patch)

    if center is not None:
        ax.plot(center[:, 0]*1e6, center[:, 1]*1e6, 'r-', linewidth=1.0, label='centerline')
        ax.legend()

    ax.set_aspect('equal')
    ax.grid(True, alpha=0.3)
    ax.set_xlabel('x (um)')
    ax.set_ylabel('y (um)')
    ax.set_title(title)
    ax.autoscale_view()
    plt.tight_layout()
    plt.savefig(filename, dpi=300)
    plt.close(fig)


def build_optimization(initial_params, bounds, base_script):
    require_lumerical_runtime('Optimization')

    depth = etch_depth
    geometry_func = single_piece_device_polygon
    eps_in = Material(name = 'Lithium Niobate', mesh_order = 2)
    eps_out = Material(name = 'Air_Custom', mesh_order = 3)

    # Initialize FunctionDefinedPolygon class.
    polygon = FunctionDefinedPolygon(func = geometry_func,
                                    initial_params = initial_params,
                                    bounds = bounds,
                                    z = Thickness - etch_depth/2,
                                    depth = depth,
                                    eps_out = eps_out,
                                    eps_in = eps_in,
                                    edge_precision = 5,
                                    dx = SHAPE_DERIVATIVE_STEP)

    ######## FIGURE OF MERIT ########

    fom = ModeMatch(monitor_name = 'fom',
                    mode_number = 1,
                    direction = 'Forward',
                    multi_freq_src = False,
                    target_T_fwd = lambda wl: np.ones(wl.size),
                    norm_p = 1)

    ######## OPTIMIZATION ALGORITHM ########

    scaling_factor = 1.0e6 if GEOMETRY_MODE == 'radial-bspline' else 1.0
    scipy_optimizer = ScipyOptimizers(max_iter = MAX_ITER,
                                    method = 'L-BFGS-B',
                                    scaling_factor = scaling_factor,
                                    pgtol = 1.0e-9,
                                    ftol = 1.0e-9,
                                    scale_initial_gradient_to = INITIAL_GRADIENT_SCALE)

    ######## PUT EVERYTHING TOGETHER ########

    opt = Optimization(base_script = base_script,
                    wavelengths = wavelengths,
                    fom = fom,
                    geometry = polygon,
                    optimizer = scipy_optimizer,
                    use_var_fdtd = USE_VAR_FDTD,
                    hide_fdtd_cad = False,
                    use_deps = USE_DEPS,
                    store_all_simulations = False)

    return opt, scipy_optimizer, fom


def initialize_lumopt_compat(opt, working_dir):
    """Initialize LumOpt across custom and bundled API variants."""

    try:
        return opt.initialize(working_dir = working_dir)
    except TypeError as exc:
        if 'unexpected keyword argument' not in str(exc):
            raise

    try:
        return opt.initialize(working_dir)
    except TypeError:
        return opt.initialize()


def keep_lumopt_session_open(opt, label):
    if not KEEP_OPEN:
        return

    print(label + ' complete. FDTD session is being kept open.')
    print('To unlock layout in FDTD, use: stop; clearjobs; switchtolayout;')
    input('Press Enter here when you are ready to let Python close this session...')


def stop_jobs_and_keep_open(opt, label):
    print(label + ' interrupted. Attempting to stop FDTD jobs and return to layout.')

    fdtd = None
    try:
        fdtd = opt.sim.fdtd
    except Exception:
        fdtd = None

    if fdtd is None:
        print('No active FDTD handle was available to stop.')
        return

    force_stop_fdtd(fdtd, label)

    input('FDTD should still be open. Inspect it now, then press Enter here to close Python...')


def run_base_fom_only(initial_params, bounds, base_script):
    opt, scipy_optimizer, fom = build_optimization(initial_params, bounds, base_script)
    initialize_lumopt_compat(opt, os.path.join(cur_path, 'base_fom_only'))
    opt.concurrent_adjoint_solves = False
    try:
        fom_value = opt.callable_fom(np.asarray(initial_params, dtype=float))
    except KeyboardInterrupt:
        stop_jobs_and_keep_open(opt, 'Base FOM only')
        raise SystemExit
    print_fom_transmission_report('Base FOM only', fom_value, fom)
    keep_lumopt_session_open(opt, 'Base FOM only')
    return fom_value


def init_only(base_script):
    """Load the runtime LSF and stop before LumOpt initialization/FOM."""

    print('INIT_ONLY checkpoint: loading runtime LSF only.')
    print('No Optimization.initialize(), callable_fom(), or forward solve will be called.')
    load_lsf_only(base_script)


def lumopt_init_only(initial_params, bounds, base_script):
    opt, scipy_optimizer, fom = build_optimization(initial_params, bounds, base_script)

    try:
        initialize_lumopt_compat(opt, os.path.join(cur_path, 'init_only'))
    except KeyboardInterrupt:
        stop_jobs_and_keep_open(opt, 'LumOpt init-only')
        raise SystemExit

    try:
        force_stop_fdtd(opt.sim.fdtd, 'LumOpt init-only post-initialize')
    except Exception as exc:
        print('Post-initialize cleanup failed:', exc)

    print('LumOpt initialized. Stopping before callable_fom / forward solve.')
    print('Inspect FDTD now for LumOpt-added geometry, monitors, mode expansion monitor, and adjoint source.')

    try:
        object_names = opt.sim.fdtd.getobjectnames()
        print('Top-level FDTD objects:')
        for object_name in object_names:
            print('  ' + str(object_name))
    except Exception as exc:
        print('Could not list FDTD object names:', exc)

    input('FDTD is open at init-only checkpoint. Press Enter here to close this Python session...')


def _lsf_matrix(points):
    rows = ['%.16e, %.16e' % (x, y) for x, y in points]
    return '[\n' + ';\n'.join(rows) + '\n]'


def geometry_init_only(params, base_script):
    """Load the base LSF and insert the bend polygon without LumOpt initialize()."""

    if lumapi is None:
        raise RuntimeError('geometry-init-only requires lumapi/Lumerical.')

    print('GEOMETRY_INIT_ONLY enabled.')
    print('Loading base LSF and inserting the single core polygon manually; no Optimization.initialize(), FOM, adjoint, or run is called.')

    with open(base_script, 'r') as f:
        script_text = f.read()

    fdtd = lumapi.FDTD(hide = False)
    fdtd.eval(script_text)

    points = single_piece_device_polygon(params)
    polygon_script = '''
switchtolayout;
v = %s;
addpoly;
set('name','manual_single_core_preview');
set('x',0);
set('y',0);
set('z',%.16e);
set('z span',%.16e);
set('vertices',v);
set('material','Lithium Niobate');
set('override mesh order from material database',true);
set('mesh order',2);
''' % (_lsf_matrix(points), Thickness - etch_depth/2, etch_depth)

    fdtd.eval(polygon_script)
    force_stop_fdtd(fdtd, 'Geometry init-only')

    try:
        object_names = fdtd.getobjectnames()
        print('Top-level FDTD objects:')
        for object_name in object_names:
            print('  ' + str(object_name))
    except Exception as exc:
        print('Could not list FDTD object names:', exc)

    input('FDTD is open with manual bend preview. Press Enter here to close this Python session...')


def runSim(initial_params, bounds, base_script):
    opt, scipy_optimizer, fom = build_optimization(initial_params, bounds, base_script)

    ######## RUN THE OPTIMIZER ########

    if ENABLE_PLOTS:
        opt.init_plotter()

    try:
        results = opt.run()
    except KeyboardInterrupt:
        stop_jobs_and_keep_open(opt, 'Optimization')
        raise SystemExit
    raw_final_params = _find_final_params(results, scipy_optimizer, opt)
    final_params = normalize_final_params_from_optimizer(raw_final_params, bounds)
    param_delta = np.asarray(final_params, dtype=float).ravel() - np.asarray(initial_params, dtype=float).ravel()
    print(
        'Final parameter delta: norm=%s, min=%s, max=%s'
        % (_num(np.linalg.norm(param_delta)), _num(np.min(param_delta)), _num(np.max(param_delta)))
    )
    if np.allclose(param_delta, 0.0, atol=1e-15, rtol=0.0):
        print('WARNING: optimizer returned the initial parameter vector unchanged.')
        print('If FOM/gradient were computed, check for zeroed optimizer gradient scaling, zero LumOpt gradient norm, or an FOM insensitive to perturbations.')
    final_fom = results[0] if isinstance(results, tuple) and results else None
    print_fom_transmission_report('Final optimization summary', final_fom, fom)
    save_final_design(final_params, example_directory)
    keep_lumopt_session_open(opt, 'Optimization')
    return results


runtime_base_script = write_runtime_base_script(initial_params)

if DEBUG_GEOMETRY:
    polygon_diagnostics(single_piece_device_polygon(initial_params), label = 'initial single-piece bent_waveguide')
    polygon_diagnostics(bend_polygon(initial_params), label = 'initial bend-only polygon')

if DEBUG_GRADIENT:
    debug_geometry_gradient(initial_params)

if DEBUG_LSF:
    debug_lsf(runtime_base_script)

if INIT_ONLY:
    print('INIT_ONLY enabled. Loading runtime LSF and stopping before LumOpt initialization.')
    init_only(runtime_base_script)
elif GEOMETRY_INIT_ONLY:
    geometry_init_only(initial_params, runtime_base_script)
elif LUMOPT_INIT_ONLY:
    print('LUMOPT_INIT_ONLY enabled. Initializing LumOpt and stopping before FOM calculation.')
    lumopt_init_only(initial_params, bounds, runtime_base_script)
elif BASE_FOM_ONLY:
    print('BASE_FOM_ONLY enabled. Running initial forward FOM and stopping before optimization.')
    run_base_fom_only(initial_params, bounds, runtime_base_script)
elif LOAD_ONLY:
    load_lsf_only(runtime_base_script)
elif WRITE_BASE_ONLY:
    print('WRITE_BASE_ONLY enabled. Runtime LSF was written; optimization was not started.')
elif EXPORT_ONLY or NO_RUN:
    print('Export/no-run mode enabled. Optimization was not started.')
    export_geometry_only(initial_params, example_directory, 'initial_bent_waveguide')
else:
    runSim(initial_params = initial_params, bounds = bounds, base_script = runtime_base_script)
######## EXPORT OPTIMIZED STRUCTURE TO GDS ########
