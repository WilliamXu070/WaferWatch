import argparse
import os
import sys
from pathlib import Path

import numpy as np

from bent_waveguide_config import DEFAULT_FOOTPRINT


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "bent_waveguide.py"


def _load_bent_namespace(args):
    source_lines = SOURCE.read_text().splitlines()
    filtered = []

    for line_no, line in enumerate(source_lines, start=1):
        if line.startswith("runtime_base_script = write_runtime_base_script"):
            break

        stripped = line.strip()

        if stripped == "install_lumopt_transmission_reporter()":
            continue

        filtered.append(line)

    old_argv = sys.argv[:]
    sys.argv = [
        str(SOURCE),
        "--geometry",
        args.geometry,
        "--n",
        str(args.n),
        "--samples",
        str(args.samples),
        "--bspline-bound",
        str(args.bspline_bound),
        "--shape-dx",
        str(args.shape_dx),
        "--footprint",
        str(args.footprint),
        "--scale-initial-gradient-to",
        "none" if args.scale_initial_gradient_to is None else str(args.scale_initial_gradient_to),
        "--no-plot",
        "--no-run",
    ]

    namespace = {
        "__file__": str(SOURCE),
        "__name__": "bent_waveguide_diagnostic_namespace",
        "np": np,
        "os": os,
        "sys": sys,
    }

    try:
        exec(compile("\n".join(filtered), str(SOURCE), "exec"), namespace)
    finally:
        sys.argv = old_argv

    return namespace


def _edge_lengths(points):
    edge_vectors = np.roll(points, -1, axis=0) - points
    return np.sqrt(np.sum(edge_vectors**2, axis=1))


def geometry_report(namespace, args):
    params = np.asarray(namespace["initial_params"], dtype=float)
    bounds = namespace["bounds"]
    polygon_func = namespace["bent_waveguide"]
    bend_func = namespace["bend_polygon"]
    base_polygon = polygon_func(params)
    bend_polygon = bend_func(params)
    edge_lengths = _edge_lengths(base_polygon)

    print("\n=== Geometry and Bounds ===")
    print("geometry:", namespace["GEOMETRY_MODE"])
    print("parameters:", params.size)
    print("bounds first/last:", bounds[0], bounds[-1])
    print("initial min/max:", np.min(params), np.max(params))
    print("polygon points:", base_polygon.shape[0])
    print("bend-only points:", bend_polygon.shape[0])
    print("edge length min/max nm:", np.min(edge_lengths)*1e9, np.max(edge_lengths)*1e9)
    print("near-zero edges:", np.where(edge_lengths < 1e-15)[0].tolist())

    print("\n=== Shape-Derivative Step Check ===")
    derivative_shifts = []
    finite_gradient_norms = []
    for index in range(params.size):
        plus = params.copy()
        minus = params.copy()
        plus[index] += args.shape_dx
        minus[index] -= args.shape_dx

        plus_polygon = polygon_func(plus)
        minus_polygon = polygon_func(minus)
        shift = np.linalg.norm(plus_polygon - base_polygon, axis=1)
        derivative_shifts.append(np.max(shift))

        finite_gradient = (plus_polygon - minus_polygon)/(2.0*args.shape_dx)
        finite_gradient_norms.append(np.max(np.linalg.norm(finite_gradient, axis=1)))

    derivative_shifts = np.asarray(derivative_shifts)
    finite_gradient_norms = np.asarray(finite_gradient_norms)
    mesh = args.mesh

    print("shape dx:", args.shape_dx)
    print("max vertex shift from +shape_dx, min/median/max nm:",
          np.min(derivative_shifts)*1e9,
          np.median(derivative_shifts)*1e9,
          np.max(derivative_shifts)*1e9)
    print("controls with shift < 1 nm:", int(np.sum(derivative_shifts < 1e-9)), "of", params.size)
    print("controls with shift < mesh/10:", int(np.sum(derivative_shifts < mesh/10.0)), "of", params.size)
    print("finite polygon gradient norm min/median/max:",
          np.min(finite_gradient_norms),
          np.median(finite_gradient_norms),
          np.max(finite_gradient_norms))

    print("\n=== Larger Perturbation Variance Check ===")
    perturb = args.perturb
    test_indices = sorted(set([0, params.size//4, params.size//2, params.size - 1]))
    for index in test_indices:
        candidate = params.copy()
        lower, upper = bounds[index]
        candidate[index] = np.clip(candidate[index] + perturb, lower, upper)
        actual = candidate[index] - params[index]
        candidate_polygon = polygon_func(candidate)
        shift = np.linalg.norm(candidate_polygon - base_polygon, axis=1)
        print("index %d: actual perturb %.6g, max shift %.3f nm, mean shift %.3f nm" %
              (index, actual, np.max(shift)*1e9, np.mean(shift)*1e9))

    return params


def run_lumerical_two_fom(namespace, params, args):
    from lumopt.figures_of_merit.modematch import ModeMatch
    from lumopt.geometries.polygon import FunctionDefinedPolygon
    from lumopt.optimization import Optimization
    from lumopt.optimizers.generic_optimizers import ScipyOptimizers
    from lumopt.utilities.materials import Material
    from lumopt.utilities.wavelengths import Wavelengths

    bounds = namespace["bounds"]
    polygon_func = namespace["bent_waveguide"]
    write_runtime_base_script = namespace["write_runtime_base_script"]

    base_script = write_runtime_base_script(params)
    wavelengths = Wavelengths(start=1550e-9, stop=1550e-9, points=1)

    geometry = FunctionDefinedPolygon(
        func=polygon_func,
        initial_params=params,
        bounds=bounds,
        z=namespace["Thickness"] - namespace["etch_depth"]/2,
        depth=namespace["etch_depth"],
        eps_out=Material(name="Air_Custom", mesh_order=3),
        eps_in=Material(name="Lithium Niobate", mesh_order=2),
        edge_precision=5,
        dx=args.shape_dx,
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
        max_iter=1,
        method="L-BFGS-B",
        scaling_factor=1.0e6 if args.geometry == "radial-bspline" else 1.0,
        pgtol=1.0e-9,
        ftol=1.0e-9,
        scale_initial_gradient_to=args.scale_initial_gradient_to,
    )

    opt = Optimization(
        base_script=base_script,
        wavelengths=wavelengths,
        fom=fom,
        geometry=geometry,
        optimizer=optimizer,
        use_var_fdtd=False,
        hide_fdtd_cad=args.hide_cad,
        use_deps=True,
        store_all_simulations=False,
    )

    working_dir = ROOT / "bent_waveguide_diagnostic_run"
    try:
        opt.initialize(working_dir=str(working_dir))
    except TypeError:
        opt.initialize(str(working_dir))

    perturbed = params.copy()
    index = args.perturb_index
    lower, upper = bounds[index]
    perturbed[index] = np.clip(perturbed[index] + args.perturb, lower, upper)

    print("\n=== Lumerical Two-FOM Check ===")
    base_fom = opt.callable_fom(params)
    perturbed_fom = opt.callable_fom(perturbed)
    print("base FOM:", base_fom)
    print("perturbed index:", index)
    print("actual perturb:", perturbed[index] - params[index])
    print("perturbed FOM:", perturbed_fom)
    print("delta FOM:", perturbed_fom - base_fom)

    for gradient_name in ("callable_jac", "callable_gradient"):
        if hasattr(opt, gradient_name):
            gradient = getattr(opt, gradient_name)(params)
            gradient = np.asarray(gradient, dtype=float).ravel()
            print("\n=== LumOpt Gradient Probe ===")
            print("method:", gradient_name)
            print("size:", gradient.size)
            print("finite:", bool(np.all(np.isfinite(gradient))))
            print("min/median/max:", np.min(gradient), np.median(gradient), np.max(gradient))
            print("norm:", np.linalg.norm(gradient))
            break
    else:
        print("\nLumOpt gradient callable not found; two-FOM finite difference was completed.")


def main():
    parser = argparse.ArgumentParser(description="Diagnose bent_waveguide geometry, gradients, and optional FOM variance.")
    parser.add_argument("--geometry", choices=["radial-bspline", "curvature"], default="radial-bspline")
    parser.add_argument("--n", type=int, default=64)
    parser.add_argument("--samples", type=int, default=800)
    parser.add_argument("--bspline-bound", type=float, default=3.0e-6)
    parser.add_argument("--shape-dx", type=float, default=1.0e-9)
    parser.add_argument("--scale-initial-gradient-to", type=float, default=None)
    parser.add_argument("--footprint", type=float, default=DEFAULT_FOOTPRINT)
    parser.add_argument("--mesh", type=float, default=50.0e-9)
    parser.add_argument("--perturb", type=float, default=0.5e-6)
    parser.add_argument("--perturb-index", type=int, default=0)
    parser.add_argument("--run-lumerical", action="store_true")
    parser.add_argument("--hide-cad", action="store_true")
    args = parser.parse_args()

    namespace = _load_bent_namespace(args)
    params = geometry_report(namespace, args)

    if args.run_lumerical:
        run_lumerical_two_fom(namespace, params, args)
    else:
        print("\nSkipped Lumerical FOM check. Add --run-lumerical on the FDTD/LumOpt machine.")


if __name__ == "__main__":
    main()
