## Symptom

`../bent_waveguide.py` runs repeated optimization iterations with unchanged FOM/shape. The plotter/icon artifacts show some gradient bookkeeping, but the FOM and geometry history do not visibly move.

## Expected behavior

The optimizer should perturb the bend geometry enough for FDTD/LumOpt to evaluate different structures, then update parameters within bounds and show changing FOM/gradient history.

## Diagnosis

The bounds are present, but the active geometry parameterization is effectively too insensitive for the simulation mesh and optimizer scaling:

- `../bent_waveguide.py` uses dimensionless curvature-logit parameters with bounds `(-8, 8)`.
- `FunctionDefinedPolygon(..., dx=1.0e-3)` perturbs those dimensionless parameters by only `0.001`.
- Numeric geometry diagnostics show that this moves all polygon vertices by less than `1 nm`, with the largest tested movement around `0.077 nm`.
- `../bent_waveguide.lsf` defines `mesh=50e-9` but does not add an explicit mesh override region over the design.
- The reference `../polarization rotator.py` optimizes physical coordinates in meters and uses `scaling_factor = 1e6`; `../bent_waveguide.py` uses `scaling_factor = 1.0`.
- The reference LSF includes full layer-builder core setup; the bend LSF intentionally omits the core and lets LumOpt inject it, which is valid, but then the missing design mesh becomes more important.

Follow-up geometry diagnosis:

- The generated core should be a single polygon, not separate input/output/core objects. The earlier broken shape came from the B-spline helper point construction folding near the joins.
- The clean polygon generator now uses one radial-offset centerline with fixed 5 um input/output arms.
- The base `.lsf` had `Angle=70`, but no `MMI-core` Layer Builder sidewall definition and no core layer using `process='grow'`.
- LumOpt `FunctionDefinedPolygon` injects a vertical extruded polygon, so it cannot directly apply the Layer Builder sidewall angle each iteration.
- The current optimizer now uses an explicit sidewall-aware surrogate width. With top width `0.8 um`, etch depth `0.3 um`, and sidewall angle `70 deg`, the bottom/surrogate width is `1.018382 um`.
- The fabrication/export polygon remains top-reference `0.8 um`; the Layer Builder `MMI-core` layer applies `process='grow'` and `sidewall angle=70` for final sidewall verification.
- The footprint is centralized through `bent_waveguide_config.py` and can be overridden per run with `--footprint`, so quick small-footprint tests update geometry, monitors, mesh bounds, and runtime `.lsf` placement together.

Windows optimization-log diagnosis:

- The run reached forward solve, adjoint solve, and gradient calculation.
- LumOpt then printed `Scaling factor is 0.0` immediately before SciPy optimization.
- `FINAL PARAMETERS` were exactly equal to the all-zero start vector.
- Root cause: `ScipyOptimizers(..., scale_initial_gradient_to=0.0)` asked LumOpt to rescale the initial gradient to zero, so L-BFGS-B had no usable descent/ascent direction even though the adjoint gradient path ran.
- Fix: default `scale_initial_gradient_to` is now `None`; an explicit `--scale-initial-gradient-to <value>` override is available if a nonzero normalization is wanted.

Post-optimization export diagnosis:

- After the gradient-scaling fix, the optimizer moved: FOM changed from about `0.7616` to `0.7938`, and final parameter delta norm was about `0.1237`.
- The crash `ValueError: radial offset produced non-positive radius` happened after optimization in `save_final_design()`.
- LumOpt/SciPy reported final parameters in scaled optimizer units because `scaling_factor=1e6`; e.g. `-0.0897` means `-0.0897 um`, not `-0.0897 m`.
- Export code treated those scaled values as meters, so `footprint + radial_offset` became negative.
- Fix: final returned parameters are now converted back to physical meters before computing final polygons/GDS when they are detected to be in scaled optimizer units.

## Plan

1. Add a design-region mesh override to `../bent_waveguide.lsf`, covering the bend/input/output polygon region with `dx/dy/dz = mesh`.
2. Replace or supplement the curvature-logit controls with physical B-spline/radial-offset controls in meters, using micron-scale bounds.
3. Set optimizer scaling to `1e6` for physical meter parameters, matching the reference workflow.
4. If keeping curvature controls temporarily, increase the geometry derivative step enough to cause mesh-visible perturbations, but treat that as a diagnostic patch rather than the final design.
5. Re-run the exact user workflow and verify changing parameter vectors, changing FOM, visible gradient/FOM plot history, and changed exported geometry.

## Verification

Local geometry-only diagnostic performed without LumOpt:

- Before the fix, parent `bent_waveguide.py` default curvature mode used `N = 64`, `bounds = [(-8.0, 8.0)] * 64`, `initial_params = 0`.
- Before the fix, for `dx = 1e-3`, every parameter's max vertex movement was under `1 nm`; max observed about `0.077 nm`.
- After the fix, default `radial-bspline` mode uses physical meter bounds `(-3e-6, 3e-6)` and optimizer scaling `1e6`.
- After the fix, `python3 ../diagnose_bent_waveguide.py --geometry radial-bspline --n 64 --samples 800` reports a `+shape_dx` max vertex shift of about `1.23 nm` to `4.87 nm`, with larger `0.5 um` perturbations moving the shape by about `608 nm` to `800 nm`.
- After the fix, `../bent_waveguide.lsf` contains an active `design_mesh` override and uses `SiO2 (Glass) - Palik` for the BOX.
- Syntax check passed with `PYTHONPYCACHEPREFIX=/tmp/bent_pycache python3 -m py_compile ../bent_waveguide.py ../diagnose_bent_waveguide.py`.
- `python3 ../test_core_polygon_generation.py --plot-failures-only` passes using the sidewall-aware bottom width.
- `python3 ../diagnose_bent_waveguide.py --geometry radial-bspline --n 16 --samples 500 --footprint 20e-6` confirms the quick-test footprint changes the bend end to `(20 um, 20 um)` and output end to `(20 um, 25 um)`.
- `BENT_RUNTIME_LSF=base_runtime_20um.lsf python3 ../bent_waveguide.py --write-base-only --footprint 20e-6 --n 16 --samples 500 --no-plot` writes a runtime LSF with `Footprint=2e-05`, `output_port_x=2e-05`, and `output_port_y=2.5e-05`.
- The default `../base_runtime.lsf` was regenerated with `Footprint=5e-05`, `WG_width=1.01838214055972e-06`, and an `MMI-core` Layer Builder layer with `process='grow'` and `sidewall angle=70`.
- `python3 -m py_compile ../bent_waveguide.py ../diagnose_bent_waveguide.py` passes after changing the default initial gradient scaling to `None`.
- `python3 ../diagnose_bent_waveguide.py --footprint 20e-6 --n 16 --samples 500` now prints `INITIAL_GRADIENT_SCALE = None`.
- Offline probe using the Windows final vector `[-0.08972181, ...]` detects scaled optimizer params, converts by `/1e6`, and successfully generates a 1208-point fabrication polygon.

Full Lumerical verification was not run because this local Python environment is missing `gdstk` and LumOpt/Lumerical runtime modules.

## Status

Code fix and local geometry diagnostic complete. Full FDTD/LumOpt two-run verification remains to be run on the Lumerical machine with `python diagnose_bent_waveguide.py --run-lumerical`.
