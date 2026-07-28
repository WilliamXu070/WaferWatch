# Paper information

## Primary sources

- Local paper:
  `references/papers/Inverse-designed compact and low-loss bending waveguides on anisotropic LNOI platform with mode-field analysis.pdf`
- Local extracted text:
  `references/papers/Inverse-designed compact and low-loss bending waveguides on anisotropic LNOI platform with mode-field analysis.pdf.txt`
- Publisher page:
  <https://www.sciencedirect.com/science/article/pii/S0030401825005607>
- DOI: <https://doi.org/10.1016/j.optcom.2025.132032>
- Official supplementary DOCX:
  <https://ars.els-cdn.com/content/image/1-s2.0-S0030401825005607-mmc1.docx>

The paper is Zhang et al., “Inverse-designed compact and low-loss bending
waveguides on anisotropic LNOI platform with mode-field analysis,” *Optics
Communications* 589 (2025), 132032.

## Method to reproduce

The paper's Fast Directional Bisection with Mode-Field Analysis (FDB-MFA)
optimizes cascaded generalized-Euler segments using two local FDE loss terms:
mode mismatch between adjacent cross-sections and radiation loss at the
terminal radius. It runs separate searches from the input and output because
the X-cut material is anisotropic.

For a segment measured from \(l=0\):

\[
\frac{d\theta}{dl}=\frac{1}{r(l)}
=\frac{l}{a_i}+\frac{1}{R_{S,i}},
\qquad
a_i=\frac{\Delta L_i}
{1/R_{T,i}-1/R_{S,i}}.
\]

The local endpoint is

\[
p(l)=\int_0^l \cos\left(\frac{s^2}{2a_i}+\frac{s}{R_{S,i}}\right)ds,
\qquad
q(l)=\int_0^l \sin\left(\frac{s^2}{2a_i}+\frac{s}{R_{S,i}}\right)ds.
\]

Use the circular-arc limit when \(R_{S,i}=R_{T,i}\) to avoid numerical
division by zero.

For adjacent FDE modes, use MODE's full-vector power coupling \(\eta\), not an
image-only intensity correlation. Express the mismatch loss density as
\(-10\log_{10}(\eta)/\Delta L\) in dB/m when comparing it with `ML`.
Use the bent-mode loss returned by MODE for `rloss` in the same unit as `RL`.
The paper observes an approximately linear relation between
\(\log(rloss)\) and radius; fit the sign from solved data rather than
hard-coding it.

The binary segment objective is

\[
FOM_i =
\mathbf{1}(mloss_{i,i-1}<ML)
\mathbf{1}(rloss(R_{T,i})<RL)-0.5.
\]

The two indicator terms are multiplied, not added. Search
\(R_{T,i}\in[R_{\min},R_{T,i-1}]\), using the paper defaults
\(R_{\min}=20\,\mu m\), \(R_{T,0}=10000\,\mu m\), and
\(\Delta R=100\,nm\). The paper scans radial displacement over
\([-100,100]\,nm\) and reports a 10 pm step; reproduce the optimum with a
convergence-tested coarse-to-fine scan rather than blindly paying that cost.

The paper used a 20 nm FDE mesh, 14–23 segments, and reported about 30 seconds
per FDE iteration. These are reference values, not acceptance evidence for
William's cross-section or hardware.

## Paper platform is not the project platform

The paper used X-cut LNOI with a 400 nm film, 200 nm etch, approximately
70-degree sidewalls, 1.8 micrometre bottom width, 4.7 micrometre BOX, and
silica cladding. Never copy these dimensions into the optimizer. Read all
physical values from `configs/current_lnoi.py`.

# Supplementary information

Only Supplementary Notes 1–3 belong to this skill. Notes 4–5 describe FDTD
TE0 propagation and ODL design and are outside the Stage 3 boundary.

## Supplementary Note 1: axis displacement

The required displacement is the distance between parallel endpoint tangents:

\[
\Delta r_{i,i-1} =
\frac{\left|
K_i p_{1,i}-q_{1,i}-K_i p_{0,i}+q_{0,i}
\right|}{\sqrt{K_i^2+1}},
\qquad
K_i=\tan(\Delta\theta_i).
\]

Here \((p_{1,i},q_{1,i})\) is the generalized-Euler endpoint from the
integrals above. The comparison circular arc of radius \(R_{T,i-1}\) has

\[
p_{0,i}=R_{T,i-1}\sin(\Delta\theta_i),\qquad
q_{0,i}=R_{T,i-1}\left(1-\cos(\Delta\theta_i)\right).
\]

Preserve a signed displacement internally for MODE alignment, even though the
supplementary distance formula is absolute. Establish the sign with a
one-step field-overlay test.

## Supplementary Note 2: threshold references

The paper swept `ML` from 100 to 500 dB/m and `RL` at 50, 100, 150, and
200 dB/m. Its highlighted pairs were:

| ML (dB/m) | RL (dB/m) | Reported equivalent radius |
|---:|---:|---:|
| 100 | 50 | 33.9 µm |
| 200 | 50 | 40.5 µm |
| 500 | 150 | 45.5 µm |

These pairs define useful starting cases, not expected results on the current
600 nm film, 300 nm etch, 800 nm top-width, air-clad platform. Recompute the
loss landscape before selecting thresholds.

## Supplementary Note 3: geometry seed

Supplementary Fig. S2(c), the \(R_{eq}=45.5\,\mu m\) FFC, is the geometry
source for `data/seeds/paper_ffc_plot_seed.npz`. The repository reconstruction
digitizes the plotted radius-versus-angle markers, retains the plotted segment
breaks, integrates the centerline, and anchors scale to the reported
equivalent radius.

Use:

- `marker_theta_rad`, `marker_radius_um`, and `marker_segment_ids` for the
  source plot data;
- `bend_centerline_xy_um` for the calibrated native bend;
- `platform_centerline_xy_um` for the current 50 by 50 micrometre placement;
- the constrained B-spline arrays only for visualization and fit regression.

The plot contains 12 connected groups separated by curvature jumps. Preserve
these boundaries when initializing generalized-Euler segments unless a
documented resampling test shows a better representation. The supplement says
the second decimal place in micrometres can measurably affect performance, so
save segment radii with at least 0.01 micrometre resolution.

`data/seeds/paper_ffc_seed.npz` came from a microscope-image centerline without
a physical scale. Keep it as a visual cross-check only.
