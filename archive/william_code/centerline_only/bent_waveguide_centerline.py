import os
import sys
import numpy as np

from centerline_config import (
    DEFAULT_ETCH_DEPTH,
    DEFAULT_FOOTPRINT,
    DEFAULT_INPUT_ARM_LENGTH,
    DEFAULT_MESH,
    DEFAULT_OUTPUT_ARM_LENGTH,
    DEFAULT_SIDEWALL_ANGLE,
    DEFAULT_THICKNESS,
    DEFAULT_WG_TOP_WIDTH,
    sidewall_bottom_width,
    sidewall_effective_width,
)
from centerline_geometry import (
    centerline_core_polygon,
    polygon_diagnostics,
    validate_centerline_geometry,
)


try:
    import gdstk
except ImportError:
    gdstk = None

sys.path.insert(0, r"C:\Program Files\ANSYS Inc\v251\Lumerical\api\python")
custom_lumopt_path = os.getenv("LUMOPT_PATH", r"C:\Users\PIC\Desktop\WeDaBest\LumOpt")
USING_CUSTOM_LUMOPT = False
if os.path.isdir(custom_lumopt_path):
    sys.path.insert(0, custom_lumopt_path)
    USING_CUSTOM_LUMOPT = True

try:
    import lumapi
    from lumopt.utilities.wavelengths import Wavelengths
    from lumopt.geometries.polygon import FunctionDefinedPolygon
    from lumopt.utilities.materials import Material
    from lumopt.figures_of_merit.modematch import ModeMatch
    from lumopt.optimizers.generic_optimizers import ScipyOptimizers
    from lumopt.optimization import Optimization
except ImportError:
    lumapi = None
    Wavelengths = None
    FunctionDefinedPolygon = None
    Material = None
    ModeMatch = None
    ScipyOptimizers = None
    Optimization = None


def cli_value(flag, default, cast):
    if flag in sys.argv:
        index = sys.argv.index(flag)
        if index + 1 >= len(sys.argv):
            raise ValueError("Missing value after %s" % flag)
        return cast(sys.argv[index + 1])
    return cast(default)


def _num(value):
    arr = np.asarray(value, dtype=float).ravel()
    if arr.size == 0:
        return "nan"
    if arr.size == 1:
        return "%.15g" % float(arr[0])
    return "[" + ", ".join("%.15g" % float(v) for v in arr) + "]"


cur_path = os.path.dirname(os.path.abspath(__file__))
LSF_FILE = os.path.join(cur_path, "centerline_base.lsf")
RUNTIME_LSF_FILE = os.getenv("CENTERLINE_RUNTIME_LSF", os.path.join(cur_path, "centerline_runtime.lsf"))

WRITE_BASE_ONLY = ("--write-base-only" in sys.argv) or (os.getenv("CENTERLINE_WRITE_BASE_ONLY") == "1")
NO_RUN = ("--no-run" in sys.argv) or (os.getenv("CENTERLINE_NO_RUN") == "1")
EXPORT_ONLY = ("--export-only" in sys.argv) or (os.getenv("CENTERLINE_EXPORT_ONLY") == "1")
DEBUG_GEOMETRY = ("--debug-geometry" in sys.argv) or (os.getenv("CENTERLINE_DEBUG_GEOMETRY") == "1")
RUN_DIAGNOSTIC_ONLY = ("--diagnose-only" in sys.argv) or (os.getenv("CENTERLINE_DIAGNOSE_ONLY") == "1")
GEOMETRY_INIT_ONLY = ("--geometry-init-only" in sys.argv) or (os.getenv("CENTERLINE_GEOMETRY_INIT_ONLY") == "1")

Footprint = cli_value("--footprint", os.getenv("CENTERLINE_FOOTPRINT", DEFAULT_FOOTPRINT), float)
Thickness = cli_value("--thickness", os.getenv("CENTERLINE_THICKNESS", DEFAULT_THICKNESS), float)
etch_depth = cli_value("--etch-depth", os.getenv("CENTERLINE_ETCH_DEPTH", DEFAULT_ETCH_DEPTH), float)
WG_top_width = cli_value("--wg-top-width", os.getenv("CENTERLINE_WG_TOP_WIDTH", DEFAULT_WG_TOP_WIDTH), float)
Sidewall_angle = cli_value("--sidewall-angle", os.getenv("CENTERLINE_SIDEWALL_ANGLE", DEFAULT_SIDEWALL_ANGLE), float)
WG_bottom_width = sidewall_bottom_width(WG_top_width, etch_depth, Sidewall_angle)
WG_effective_width = sidewall_effective_width(WG_top_width, etch_depth, Sidewall_angle)
WIDTH_BASIS = cli_value("--width-basis", os.getenv("CENTERLINE_WIDTH_BASIS", "bottom"), str)
if WIDTH_BASIS == "top":
    WG_width = WG_top_width
elif WIDTH_BASIS == "effective":
    WG_width = WG_effective_width
elif WIDTH_BASIS == "bottom":
    WG_width = WG_bottom_width
else:
    raise ValueError("Unsupported --width-basis %s. Use top, effective, or bottom." % WIDTH_BASIS)

input_arm_length = cli_value("--input-arm-length", os.getenv("CENTERLINE_INPUT_ARM_LENGTH", DEFAULT_INPUT_ARM_LENGTH), float)
output_arm_length = cli_value("--output-arm-length", os.getenv("CENTERLINE_OUTPUT_ARM_LENGTH", DEFAULT_OUTPUT_ARM_LENGTH), float)
mesh = cli_value("--mesh", os.getenv("CENTERLINE_MESH", DEFAULT_MESH), float)
wavelength = cli_value("--wavelength", os.getenv("CENTERLINE_WAVELENGTH", 1.55e-6), float)

N = cli_value("--n", 8 if "--quick-test" in sys.argv else 16, int)
MAX_ITER = cli_value("--max-iter", 2 if "--quick-test" in sys.argv else 20, int)
samples = cli_value("--samples", 600 if "--quick-test" in sys.argv else 1600, int)
PARAM_BOUND = cli_value("--param-bound", 2.0, float)
SHAPE_DX = cli_value("--shape-dx", 0.05, float)

initial_params = np.zeros(N, dtype=float)
bounds = [(-PARAM_BOUND, PARAM_BOUND)]*N
wavelengths = Wavelengths(start=wavelength, stop=wavelength, points=1) if Wavelengths is not None else None


def optimizer_polygon(params):
    points, center, theta, bend_center, bend_theta = centerline_core_polygon(
        params=params,
        footprint=Footprint,
        wg_width=WG_width,
        input_arm_length=input_arm_length,
        output_arm_length=output_arm_length,
        samples=samples,
    )
    optimizer_polygon.last_center = center
    optimizer_polygon.last_theta = theta
    optimizer_polygon.last_bend_center = bend_center
    optimizer_polygon.last_bend_theta = bend_theta
    return points


def fabrication_top_polygon(params):
    points, center, theta, bend_center, bend_theta = centerline_core_polygon(
        params=params,
        footprint=Footprint,
        wg_width=WG_top_width,
        input_arm_length=input_arm_length,
        output_arm_length=output_arm_length,
        samples=samples,
    )
    fabrication_top_polygon.last_center = center
    fabrication_top_polygon.last_theta = theta
    return points


def _replace_lsf_assignment(script_text, name, value):
    target = name + "="
    lines = script_text.splitlines()
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith(target) and stripped.endswith(";"):
            indent = line[:len(line) - len(line.lstrip())]
            lines[index] = indent + name + "=" + _num(value) + ";"
            return "\n".join(lines) + "\n"
    raise RuntimeError("Could not replace LSF assignment for %s" % name)


def runtime_vars_from_params(params):
    polygon = optimizer_polygon(params)
    center = optimizer_polygon.last_center
    output_end = center[-1]

    layout_padding = 5e-6
    x_min = min(float(np.min(polygon[:, 0])), -input_arm_length)
    x_max = max(float(np.max(polygon[:, 0])), float(output_end[0]))
    y_min = min(float(np.min(polygon[:, 1])), -0.5*WG_width)
    y_max = max(float(np.max(polygon[:, 1])), float(output_end[1]))

    layout_x_min = x_min - layout_padding
    layout_x_max = x_max + layout_padding
    layout_y_min = y_min - layout_padding
    layout_y_max = y_max + layout_padding

    return {
        "wavelength": wavelength,
        "Thickness": Thickness,
        "mesh": mesh,
        "etch_depth": etch_depth,
        "WG_top_width": WG_top_width,
        "WG_width": WG_width,
        "WG_bottom_width": WG_bottom_width,
        "WG_effective_width": WG_effective_width,
        "Angle": Sidewall_angle,
        "Footprint": Footprint,
        "input_arm_length": input_arm_length,
        "output_arm_length": output_arm_length,
        "layout_padding": layout_padding,
        "input_port_x": -input_arm_length,
        "input_port_y": 0.0,
        "output_port_x": float(output_end[0]),
        "output_port_y": float(output_end[1]),
        "core_x_min": x_min,
        "core_x_max": x_max,
        "core_y_min": y_min,
        "core_y_max": y_max,
        "layout_x_min": layout_x_min,
        "layout_x_max": layout_x_max,
        "layout_y_min": layout_y_min,
        "layout_y_max": layout_y_max,
        "layout_x_span": layout_x_max - layout_x_min,
        "layout_y_span": layout_y_max - layout_y_min,
        "layout_x_center": 0.5*(layout_x_min + layout_x_max),
        "layout_y_center": 0.5*(layout_y_min + layout_y_max),
    }


def write_runtime_base_script(params, template_path=LSF_FILE, runtime_path=RUNTIME_LSF_FILE):
    runtime_vars = runtime_vars_from_params(params)
    with open(template_path, "r") as f:
        script_text = f.read()

    for name in sorted(runtime_vars):
        script_text = _replace_lsf_assignment(script_text, name, runtime_vars[name])

    with open(runtime_path, "w") as f:
        f.write(script_text)

    print("Wrote runtime base script:", runtime_path)
    for key in sorted(runtime_vars):
        print("  %s = %s" % (key, _num(runtime_vars[key])))
    return runtime_path


def require_lumerical():
    if any(x is None for x in (lumapi, FunctionDefinedPolygon, Material, ModeMatch, ScipyOptimizers, Optimization, wavelengths)):
        raise RuntimeError("Lumerical/LumOpt imports are unavailable in this Python environment.")


def build_optimization(base_script):
    require_lumerical()
    geometry = FunctionDefinedPolygon(
        func=optimizer_polygon,
        initial_params=initial_params,
        bounds=bounds,
        z=Thickness - 0.5*etch_depth,
        depth=etch_depth,
        eps_out=Material(name="Air_Custom", mesh_order=3),
        eps_in=Material(name="Lithium Niobate", mesh_order=2),
        edge_precision=5,
        dx=SHAPE_DX,
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
        scaling_factor=1.0,
        pgtol=1e-8,
        ftol=1e-8,
        scale_initial_gradient_to=None,
    )
    opt = Optimization(
        base_script=base_script,
        wavelengths=wavelengths,
        fom=fom,
        geometry=geometry,
        optimizer=optimizer,
        use_var_fdtd=False,
        hide_fdtd_cad=False,
        use_deps=True,
        store_all_simulations=False,
    )
    return opt


def _find_final_params(results, opt):
    candidates = [results, opt.optimizer if hasattr(opt, "optimizer") else None, opt]
    if isinstance(results, (list, tuple)):
        candidates.extend(list(results)[::-1])
    for candidate in candidates:
        if candidate is None:
            continue
        if isinstance(candidate, np.ndarray) and candidate.size == initial_params.size:
            return np.asarray(candidate, dtype=float).ravel()
        if isinstance(candidate, dict):
            for key in ("x", "params", "final_params", "optimized_params", "best_params"):
                value = candidate.get(key)
                if value is not None and np.asarray(value).size == initial_params.size:
                    return np.asarray(value, dtype=float).ravel()
        for attr in ("x", "params", "current_params", "final_params", "optimized_params", "best_params"):
            if hasattr(candidate, attr):
                value = getattr(candidate, attr)
                if value is not None and np.asarray(value).size == initial_params.size:
                    return np.asarray(value, dtype=float).ravel()
    raise RuntimeError("Could not extract final optimized parameters.")


def write_final_gds(params, filename):
    if gdstk is None:
        print("gdstk is not installed; skipping GDS export:", filename)
        return
    poly_um = fabrication_top_polygon(params)*1e6
    lib = gdstk.Library(unit=1e-6, precision=1e-9)
    cell = lib.new_cell("CENTERLINE_ONLY_BEND")
    poly = gdstk.Polygon(poly_um, layer=1, datatype=0)
    fractured = poly.fracture(max_points=199, precision=1e-6)
    for item in fractured if fractured else [poly]:
        cell.add(item)
    lib.write_gds(filename)


def save_plot(params, filename):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib is not installed; skipping plot.")
        return
    points = fabrication_top_polygon(params)
    center = fabrication_top_polygon.last_center
    fig, ax = plt.subplots(figsize=(8, 8))
    ax.fill(points[:, 0]*1e6, points[:, 1]*1e6, color="#a7d3ff", edgecolor="#2563eb", alpha=0.8)
    ax.plot(center[:, 0]*1e6, center[:, 1]*1e6, color="black", linewidth=1.0)
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.25)
    ax.set_xlabel("x (um)")
    ax.set_ylabel("y (um)")
    ax.set_title("Centerline-only constant-width bend")
    fig.tight_layout()
    fig.savefig(filename, dpi=250)
    plt.close(fig)


def save_final_design(params):
    params = np.asarray(params, dtype=float).ravel()
    np.savetxt(os.path.join(cur_path, "centerline_final_params.txt"), params)
    np.save(os.path.join(cur_path, "centerline_final_params.npy"), params)
    np.savetxt(os.path.join(cur_path, "centerline_final_polygon_top.txt"), fabrication_top_polygon(params))
    np.savetxt(os.path.join(cur_path, "centerline_final_polygon_optimizer.txt"), optimizer_polygon(params))
    write_final_gds(params, os.path.join(cur_path, "centerline_final.gds"))
    save_plot(params, os.path.join(cur_path, "centerline_final.png"))


def print_geometry_report(params, label):
    report = validate_centerline_geometry(
        params=params,
        footprint=Footprint,
        width=WG_width,
        input_arm=input_arm_length,
        output_arm=output_arm_length,
        samples=samples,
    )
    d = report["diagnostics"]
    print("\n=== %s geometry ===" % label)
    print("failures:", report["failures"])
    print("points:", d["points"])
    print("edge min/median/max nm:", d["min_edge"]*1e9, d["median_edge"]*1e9, d["max_edge"]*1e9)
    print("bbox um:", tuple(v*1e6 for v in d["bbox"]))
    print("min radius um:", report["min_radius"]*1e6)
    if report["failures"]:
        raise RuntimeError("Geometry validation failed: %s" % report["failures"])


def _lsf_matrix(points):
    rows = ["%.16e, %.16e" % (x, y) for x, y in points]
    return "[\n" + ";\n".join(rows) + "\n]"


def geometry_init_only(params, base_script):
    """Open FDTD, load components, insert the centerline polygon, and stop."""

    if lumapi is None:
        raise RuntimeError("geometry-init-only requires lumapi/Lumerical.")

    print("GEOMETRY_INIT_ONLY enabled.")
    print("Opening FDTD, loading components, and inserting one manual centerline core polygon.")
    print("No FOM calculation, adjoint solve, forward solve, or optimizer run will be called.")

    with open(base_script, "r") as f:
        script_text = f.read()

    fdtd = lumapi.FDTD(hide=False)
    fdtd.eval(script_text)

    points = optimizer_polygon(params)
    polygon_script = """
switchtolayout;
v = %s;
addpoly;
set('name','manual_centerline_core_preview');
set('x',0);
set('y',0);
set('z',%.16e);
set('z span',%.16e);
set('vertices',v);
set('material','Lithium Niobate');
set('override mesh order from material database',true);
set('mesh order',2);
""" % (_lsf_matrix(points), Thickness - 0.5*etch_depth, etch_depth)

    fdtd.eval(polygon_script)

    try:
        fdtd.eval("stop; clearjobs; switchtolayout;")
    except Exception as exc:
        print("FDTD stop/switchtolayout cleanup warning:", exc)

    try:
        object_names = fdtd.getobjectnames()
        print("Top-level FDTD objects:")
        for object_name in object_names:
            print("  " + str(object_name))
    except Exception as exc:
        print("Could not list FDTD object names:", exc)

    input("FDTD is open with manual centerline core preview. Press Enter here to close Python...")


def run_optimization(base_script):
    opt = build_optimization(base_script)
    results = opt.run()
    final_params = _find_final_params(results, opt)
    delta = final_params - initial_params
    print("Final parameter delta norm:", _num(np.linalg.norm(delta)))
    print("Final parameters:", _num(final_params))
    save_final_design(final_params)
    return results


print("CENTERLINE_ONLY = True")
print("N =", N)
print("MAX_ITER =", MAX_ITER)
print("Footprint =", Footprint)
print("samples =", samples)
print("PARAM_BOUND =", PARAM_BOUND)
print("SHAPE_DX =", SHAPE_DX)
print("WG_width optimizer =", WG_width)
print("WG_top_width export =", WG_top_width)
print("USING_CUSTOM_LUMOPT =", USING_CUSTOM_LUMOPT)
print("GEOMETRY_INIT_ONLY =", GEOMETRY_INIT_ONLY)

print_geometry_report(initial_params, "initial")
runtime_script = write_runtime_base_script(initial_params)

if GEOMETRY_INIT_ONLY:
    geometry_init_only(initial_params, runtime_script)
elif DEBUG_GEOMETRY or RUN_DIAGNOSTIC_ONLY:
    raise SystemExit
elif WRITE_BASE_ONLY:
    print("WRITE_BASE_ONLY enabled; optimization was not started.")
elif EXPORT_ONLY or NO_RUN:
    print("Export/no-run mode enabled; optimization was not started.")
    save_final_design(initial_params)
else:
    run_optimization(runtime_script)
