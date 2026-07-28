# Repository and output contract

## Current platform source of truth

Read values from `configs/current_lnoi.py`; do not duplicate them as
independent constants:

| Parameter | Current value |
|---|---:|
| Crystal cut | X-cut anisotropic LN |
| Wavelength | 1550 nm |
| LN film thickness | 600 nm |
| Etch depth | 300 nm |
| Top width | 800 nm |
| Sidewall angle | 70 degrees |
| BOX thickness | 4.7 µm |
| Upper cladding | `Air_Custom` |
| Access length | 5 µm |
| Layout extent | 50 µm by 50 µm |
| Starting design mesh | 20 nm |

Calculate bottom width through `waveguide_bottom_width_m()`.

## Implementation files

Develop module by module:

- `bend/geometry/generalized_euler.py`: segment model, integration,
  transformations, joins, and seed conversion
- `bend/fde_eme/mode_fde.lsf`: parameterized MODE model and one-point FDE solve
- `bend/fde_eme/mode_fde.py`: LumAPI driver, mode tracking, sweeps, caching,
  shift optimization, and loss tables
- `bend/fde_eme/fdb_mfa.py`: bidirectional bisection and candidate assembly
- `tests/test_generalized_euler.py`: geometry invariants and regression tests
- `tests/test_fdb_mfa.py`: bracketing, bisection, join, unit, and checkpoint
  tests using a deterministic mock surrogate

Do not place generated `.lms`, temporary `.lsf`, plots, or solver results next
to source files.

## Ignored artifacts

Write runtime outputs beneath:

- `artifacts/runtime_scripts/fde_fdb_mfa/`
- `artifacts/checkpoints/fde_fdb_mfa/`
- `artifacts/simulation_outputs/fde_fdb_mfa/`
- `artifacts/plots/fde_fdb_mfa/`

Minimum final outputs:

- `seed_segment_table.json`
- `mode_loss_table.npz`
- `optimized_segment_table.json`
- `optimized_centerline.npz`
- `optimization_history.json`
- `seed_vs_optimized_geometry.png`
- `seed_vs_optimized_loss.png`
- a concise run summary containing platform hash, Lumerical version, mesh/PML
  convergence, thresholds, and completion status

Checkpoint keys must include platform parameters, wavelength, mesh, boundary
settings, material orientation, angle, radius, and mode-reference identity so
stale modes cannot be reused silently.

## Stage completion gates

Stage 1 passes when geometry invariants and visual overlays pass.

Stage 2 passes when TE0 identity, anisotropy orientation, unit handling,
straight loss floor, and mesh/PML convergence pass, and the seed has a
repeatable local loss prediction.

Stage 3 passes when both directional searches converge, the joining segment is
geometrically valid, optimization history is replayable, and the optimized
surrogate loss improves over the seed under identical settings.

The final status must say that EME and 3D FDTD remain pending. A MODE/FDE
surrogate cannot establish full-device transmission or replace later
propagation validation.
