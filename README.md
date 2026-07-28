# LNOI Simulation Workspace

This branch is the independent Lumerical simulation workspace stored on the
`simulation` branch of the `WilliamXu070/WaferWatch` GitHub repository. It has
unrelated history to WaferWatch `main` and must not be merged wholesale into
that branch.

## Active workflow

The current 90-degree bend optimizer is:

- `bend/fdtd_lumopt/optimize.py`
- `bend/fdtd_lumopt/optimize.lsf`
- `bend/fdtd_lumopt/run_with_watchdog.py`

Run the optimizer from a Windows environment containing Ansys Lumerical 2025
R1, `lumapi`, and LumOpt:

```powershell
python bend/fdtd_lumopt/optimize.py
```

For checkpoint recovery:

```powershell
python bend/fdtd_lumopt/run_with_watchdog.py
```

Accepted-iteration checkpoints are written to
`artifacts/checkpoints/fdtd_lumopt/`.

## Current platform

`configs/current_lnoi.py` is the source of truth for the active platform:

- X-cut anisotropic lithium niobate
- 600 nm LN film
- 300 nm etch
- 800 nm top width
- 70-degree sidewalls
- 4.7 um BOX
- air upper cladding
- 1550 nm operating wavelength
- 50 um bend radius and output extent

The dimensions from the papers under `references/papers/` are references only;
they do not replace the active platform.

## Repository map

- `bend/fdtd_lumopt/`: active 3D FDTD/LumOpt optimization.
- `bend/diagnostics/`: diagnostic copies of the optimization setup.
- `bend/fde_eme/`: planned multimode FDE/EME optimization pipeline.
- `bend/geometry/`: future shared geometry module.
- `configs/`: fabrication and design settings.
- `data/seeds/`: authoritative paper-derived input seeds.
- `tools/`: environment checks, paper reconstruction, and export helpers.
- `tests/`: executable geometry and LumOpt smoke tests.
- `polarization_rotator/`: reference and historical polarization-rotator code.
- `references/`: papers and project notes.
- `archive/`: preserved previous implementations; not active entry points.
- `artifacts/`: ignored plots, checkpoints, runtime scripts, and solver output.

## Supporting commands

```powershell
python tools/environment_checks/lsf_preflight.py bend/fdtd_lumopt/optimize.lsf
python tools/environment_checks/debug_optimize_lsf.py
python tools/paper_reconstruction/reconstruct_paper_plot_seed.py
python tools/paper_reconstruction/fit_paper_plot_spline.py
python tests/test_generalized_euler_geometry.py
```

The active optimizer currently performs direct single-wavelength 3D FDTD
optimization. The planned FDE/EME workflow will provide a faster multimode
search stage, while converged 3D FDTD remains the final validation method.
