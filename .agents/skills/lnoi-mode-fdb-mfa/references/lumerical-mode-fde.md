# Lumerical MODE/FDE reference

Use the installed Lumerical MODE version as the runtime authority. Confirm
script property names with `?set`, `?setanalysis`, `getanalysis`, or local help
before coding.

## Official Ansys references

- [FDE solver introduction](https://optics.ansys.com/hc/en-us/articles/360034917233-MODE-Finite-Difference-Eigenmode-FDE-solver-introduction)
- [FDE analysis window overview](https://optics.ansys.com/hc/en-us/articles/360034917333-FDE-solver-analysis-window-overview)
- [FDE modal-analysis settings](https://optics.ansys.com/hc/en-us/articles/360034917353-Modal-Analysis-Tab)
- [Bent-waveguide analysis](https://optics.ansys.com/hc/en-us/articles/360042799933-Bent-waveguide-analysis)
- [Lossy modes, PML, and loss conversion](https://optics.ansys.com/hc/en-us/articles/360034917493-Working-with-lossy-modes-and-dB-m-to-kappa-conversion)
- [`addfde`](https://optics.ansys.com/hc/en-us/articles/360034404294-addfde-Script-command)
- [`findmodes`](https://optics.ansys.com/hc/en-us/articles/360034405214-findmodes-Script-command)
- [`setanalysis`](https://optics.ansys.com/hc/en-us/articles/360034925113-setanalysis-Script-command)
- [`bestoverlap`](https://optics.ansys.com/hc/en-us/articles/360034405274-bestoverlap-Script-command)
- [`copydcard`](https://optics.ansys.com/hc/en-us/articles/360034930233-copydcard-Script-command)
- [`optimizeposition`](https://optics.ansys.com/hc/en-us/articles/360034405314-optimizeposition-Script-command)
- [Matrix transformation grid attribute](https://optics.ansys.com/hc/en-us/articles/360034915173-Matrix-Transformation-Simulation-object)
- [Anisotropic grid-attribute guidance](https://optics.ansys.com/hc/en-us/articles/360034915193-Tips-and-background-information-when-using-grid-attributes)

## Solver contract

FDE solves a two-dimensional waveguide cross-section eigenproblem. Its bent
waveguide option provides local bent-mode fields, complex effective index, and
radiative loss for a specified radius and bend orientation. It does not
propagate the complete 90-degree device.

Use it here to create a local surrogate:

1. solve the straight TE0 reference;
2. solve bent TE0 modes over local angle and radius;
3. calculate power coupling between neighboring cross-sections;
4. combine per-interface mismatch with per-length radiation loss;
5. feed those local terms into FDB-MFA.

Store the selected mode in a named D-CARD with `copydcard`. Track subsequent
modes with `bestoverlap` plus polarization/confinement checks. Never assume
that `mode1` remains TE0 across radius or angle.

## X-cut anisotropy

The material tensor is fixed to the crystal, while the local propagation frame
rotates around the bend. Apply the corresponding permittivity rotation or
matrix-transform grid attribute at every sampled angle. Verify the convention
at 0 and 90 degrees against straight cross-sections before interpolating
intermediate angles.

A geometry rotation alone preserves the wrong tensor relationship and removes
the directional asymmetry that FDB-MFA is intended to capture.

## Radiation-loss convergence

Use PML only for genuinely radiative bent modes. Place it far enough from the
evanescent field, then sweep transverse span, mesh, and PML settings. Accept a
loss point only when the target mode remains the same and the reported loss is
stable under refinement.

Reject or flag points with:

- field peaks at the boundary;
- mode identity jumps;
- negative or non-finite attenuation;
- strong dependence on simulation span or PML placement;
- loss below an established numerical floor.

Record both MODE's native loss and the explicitly converted dB/m value. Do not
mix dB/m, dB/cm, dB/micrometre, or per-segment dB in optimization thresholds.

## Shift and overlap

The paper's `shift` aligns neighboring bent-mode axes. MODE's
`optimizeposition` can maximize overlap, but the geometric displacement from
Supplementary Note 1 remains the physical consistency check.

Validate:

- which D-CARD receives the offset;
- the radial-axis sign at both propagation directions;
- whether the returned first overlap value or power-coupling value is being
  used;
- that zero shift returns unity for a mode compared with itself.

Use power coupling \(\eta\) to compute interface loss
\(-10\log_{10}(\eta)\). Keep the raw overlap and power coupling as separate
logged quantities.
