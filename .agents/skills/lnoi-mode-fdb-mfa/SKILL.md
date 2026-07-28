---
name: lnoi-mode-fdb-mfa
description: Implement the paper-seeded Fast Directional Bisection with Mode-Field Analysis workflow for this repository's current anisotropic X-cut LNOI platform. Use when asked to build, run, debug, or resume the Lumerical MODE/FDE bend optimizer from the plot-derived paper seed through Stage 3. Stop before EME and 3D FDTD.
---

# LNOI MODE FDB-MFA

Build a fast MODE/FDE surrogate and use it to optimize a paper-seeded
90-degree LNOI bend. Preserve William's fabrication platform while adopting the
paper's generalized-Euler geometry and FDB-MFA search method.

## Scope boundary

Complete exactly these stages:

1. Reconstruct and parameterize the paper seed on the current platform.
2. Build and validate the Lumerical MODE/FDE loss surrogate.
3. Implement and run the bidirectional FDB-MFA optimization.

Stop after saving a validated MODE/FDE candidate. Do not implement EME, launch
3D FDTD, claim full-device transmission, or modify
`bend/fdtd_lumopt/optimize.py` or `bend/fdtd_lumopt/optimize.lsf`.

## Read before acting

Read these files in order:

1. `AGENTS.md`
2. `configs/current_lnoi.py`
3. `bend/fdtd_lumopt/optimize.py` and `bend/fdtd_lumopt/optimize.lsf` for
   platform and scripting conventions only
4. `tools/paper_reconstruction/reconstruct_paper_plot_seed.py`
5. `tools/paper_reconstruction/fit_paper_plot_spline.py`
6. [Paper information and Supplementary information](references/paper-and-supplement.md)
7. [Lumerical MODE/FDE reference](references/lumerical-mode-fde.md)
8. [Repository and output contract](references/repository-contract.md)

Treat `configs/current_lnoi.py` as the physical source of truth. Treat
`data/seeds/paper_ffc_plot_seed.npz` as the authoritative geometry seed. Never
substitute the paper's layer stack, width, or cladding, and never use
`data/seeds/paper_ffc_seed.npz` as the optimization seed.

## Collaboration gate

Follow `AGENTS.md`. Before each module:

1. Summarize its purpose.
2. List every physical and numerical parameter.
3. State assumptions and unresolved Lumerical property names.
4. Name the files to create or modify.
5. Wait for William's confirmation before writing that module.

Do not guess MODE API property names. Query the installed Lumerical version or
check the official command reference before generating `.lsf` code.

## Stage 1: build the generalized-Euler seed

Create a shared geometry module under `bend/geometry/` and tests under
`tests/`. Use the plot-derived radius-versus-angle data to initialize the
segment radii and boundaries.

Represent each segment by start radius \(R_{S,i}\), terminal radius
\(R_{T,i}\), length \(\Delta L_i\), turning angle \(\Delta\theta_i\), and
orientation. Integrate curvature that is linear in arc length. Do not treat the
current constrained B-spline as the final physics parameterization; it is a
visual reconstruction and regression target.

Validate all of the following:

- finite coordinates and positive radii;
- continuous position and tangent at every join;
- horizontal input tangent, vertical output tangent, and total turn of
  \(\pi/2\);
- endpoints compatible with the configured 50 by 50 micrometre extent;
- plotted overlay of digitized seed, B-spline reconstruction, and
  generalized-Euler reconstruction;
- explicit reconstruction errors and segment table saved to ignored
  artifacts.

Do not proceed if a geometric discontinuity is hidden by dense plotting.

## Stage 2: build the MODE/FDE surrogate

Create the MODE driver in `bend/fde_eme/` using the filenames and output
contract in `references/repository-contract.md`.

Use the current X-cut anisotropic LN stack at 1550 nm. Rotate the LN
permittivity tensor for each local propagation angle; rotating only the
waveguide geometry is insufficient. Establish the straight TE0 mode at both
principal directions, then sweep bend radius and propagation angle.

For every solve:

- track TE0 by field overlap and polarization, not by mode number;
- record complex effective index, MODE-reported loss, polarization fraction,
  confinement, and the selected D-CARD name;
- use PML for radiative bent modes and demonstrate domain/PML convergence;
- calculate adjacent-section mismatch from MODE power coupling;
- optimize the radial D-CARD displacement using a converged coarse-to-fine
  search or `optimizeposition`;
- keep all loss units explicit and normalize mismatch loss by segment length
  only where the paper's threshold definition requires it;
- cache radius-angle mode data and checkpoint every completed sweep point.

First run a small smoke grid. Expand it only after the straight-mode, mode
tracking, anisotropy, mesh, and PML checks pass. The paper's 20 nm mesh is a
starting reference, not proof of convergence on this platform.

Stage 2 is complete only when the unoptimized plot-derived seed has a
reproducible MODE-predicted mismatch-plus-radiation loss breakdown.

## Stage 3: run bidirectional FDB-MFA

Optimize independently from the input and output because X-cut LN is
anisotropic. Never impose mirror symmetry.

For each new segment:

1. Start with \(R_{T,0}=10000\,\mu m\) as the straight approximation.
2. Search \(R_{T,i}\) within \([R_{\min}, R_{T,i-1}]\), initially using the
   paper's \(R_{\min}=20\,\mu m\).
3. Construct the generalized-Euler candidate and calculate its geometrically
   required axis displacement.
4. Evaluate adjacent-mode mismatch loss and terminal-radius radiation loss
   with the validated FDE surrogate.
5. Evaluate
   \[
   FOM_i =
   \mathbf{1}(mloss_{i,i-1}<ML)
   \mathbf{1}(rloss(R_{T,i})<RL)-0.5.
   \]
6. Bisect until the radius interval is no larger than
   \(\Delta R=100\,nm\).
7. Continue both directional searches until their terminal radii differ by no
   more than \(\Delta R\), then join them with a generalized-Euler segment.

Make `ML`, `RL`, \(R_{\min}\), \(\Delta R\), segment count, and shift-search
settings configurable. Use the paper threshold pairs only as initial sweep
points; recalibrate them for the current waveguide cross-section.

Save the seed and optimized loss tables, full segment parameters, reconstructed
centerline, convergence history, and comparison plots. Report the winning
candidate as “ready for later EME/3D-FDTD validation,” not as a validated
full-device result.

## Failure conditions

Stop and diagnose instead of optimizing when any of these occurs:

- MODE is unavailable or the installed API cannot resolve required commands;
- the material tensor orientation is unverified;
- TE0 changes identity during a sweep;
- straight-guide loss is not near the numerical floor;
- bent loss changes materially under mesh, span, or PML refinement;
- loss units or D-CARD shift sign are ambiguous;
- the bisection predicate is non-monotonic in the current search interval.

When the binary predicate is non-monotonic, bracket a valid transition with a
coarse radius scan before resuming bisection. Do not force a false root.
