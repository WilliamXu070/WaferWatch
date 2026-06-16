# Later: Add B-Spline Centerline Geometry Mode

## Current State

The active new workflow is:

- `optimize_fdtd.py`
- `optimize_bent_waveguide_fdtd.lsf`
- generated runtime file: `base_runtime_fdtd.lsf`

Current geometry mode is curvature based:

```text
params -> curvature profile -> integrated centerline -> constant-width polygon
```

The bend centerline is forced to:

```text
(0, 0) -> (R, R)
```

with:

```python
R = 50e-6
WG_width = 0.8e-6
Thickness = 0.6e-6
etch_depth = 0.3e-6
L_in = 5e-6
L_out = 5e-6
```

The full simulated core is:

```text
input straight:  (-L_in, 0) -> (0, 0)
bend:            (0, 0) -> (R, R)
output straight: (R, R) -> (R, R + L_out)
```

There is already a circular baseline mode:

```bash
python3 optimize_fdtd.py --base-fom-only
```

and a dry generation mode:

```bash
python3 optimize_fdtd.py --base-fom-only --write-base-only --debug-geometry
```

FOM/loss reporting is already hooked in Python and controlled by:

```bash
python3 optimize_fdtd.py --no-fom-report
```

## Recommended Next Step

Add a B-spline centerline mode before attempting full independent inner/outer edge optimization.

The target geometry map should be:

```text
params -> B-spline centerline control points -> smooth centerline -> constant-width polygon
```

This is closer to the bend papers than the current curvature-increment method, but much safer than optimizing independent sidewalls.

It keeps fixed width:

```python
W = WG_width = 0.8e-6
```

and uses the existing normal-offset polygon construction.

## Why Centerline B-Spline First

Pros:

- Easier to debug than independent inner/outer B-spline sidewalls.
- Endpoints and port tangency are easy to enforce.
- Produces smooth, paper-aligned bend shapes.
- Avoids self-intersection and invalid variable-width polygons.
- Gives a clean comparison against the circular baseline and current curvature method.

Limitations:

- It cannot vary local waveguide width.
- It is less powerful than the LNOI B-spline paper’s independent sidewall approach.
- If centerline B-spline saturates, later upgrade to independent inner/outer edge splines.

## Proposed CLI

Add:

```python
parser.add_argument(
    "--geometry",
    choices=["curvature", "circle", "bspline-centerline"],
    default="curvature",
)
parser.add_argument("--bspline-controls", type=int, default=6)
parser.add_argument("--bspline-bound", type=float, default=5e-6)
```

Suggested behavior:

```bash
python3 optimize_fdtd.py --geometry circle --base-fom-only
python3 optimize_fdtd.py --geometry curvature --max-iter 10
python3 optimize_fdtd.py --geometry bspline-centerline --max-iter 10
```

The existing `--base-fom-only` can keep forcing circular geometry, or it can be generalized to evaluate whichever `--geometry` is selected once. The simpler first change is to leave `--base-fom-only` as circle-only.

## B-Spline Centerline Implementation

Use fixed endpoints and fixed tangent helper points:

```text
P0 = (0, 0)
P1 = (tangent_length, 0)
P2...P(n-2) = movable internal points
P(n-1) = (R, R - tangent_length)
Pn = (R, R)
```

This enforces:

```text
input tangent: horizontal
output tangent: vertical
```

Use:

```python
tangent_length = min(0.2 * R, 10e-6)
```

For `R = 50e-6`, that gives `10 um`.

### Parameter Vector

If using free xy offsets:

```python
num_controls = args.bspline_controls
params.size = 2 * num_controls
```

Interpretation:

```python
dx = params[:num_controls]
dy = params[num_controls:]
```

Base internal points can be sampled from the circular centerline:

```python
phi = np.linspace(0, np.pi / 2, num_controls + 2)[1:-1]
x_base = R * np.sin(phi)
y_base = R * (1.0 - np.cos(phi))
```

Then:

```python
x_internal = x_base + dx
y_internal = y_base + dy
```

Bounds:

```python
bounds = [(-args.bspline_bound, args.bspline_bound)] * (2 * num_controls)
```

Start:

```python
initial_params = np.zeros(2 * num_controls)
```

### Safer Alternative: Radial Offsets

Radial control is safer and probably preferable:

```text
params = radial offsets of control points
```

Use:

```python
phi = np.linspace(0, np.pi / 2, num_controls + 2)[1:-1]
base_r = R
r = base_r + params
x = r * np.sin(phi)
y = R - r * np.cos(phi)
```

Bounds:

```python
bounds = [(-5e-6, 5e-6)] * num_controls
```

This keeps the curve naturally bend-like and reduces foldover risk.

Recommended first implementation: radial offsets.

## Evaluating The Spline

Use SciPy parametric spline. A simple option:

```python
from scipy.interpolate import splprep, splev
```

Implementation sketch:

```python
def _bspline_centerline_from_params(params):
    params = np.asarray(params, dtype=float)

    num_controls = params.size
    tangent_length = min(0.2 * R, 10e-6)

    phi = np.linspace(0.0, np.pi / 2, num_controls + 2)[1:-1]
    r = R + params
    internal = np.column_stack((
        r * np.sin(phi),
        R - r * np.cos(phi),
    ))

    controls = np.vstack((
        [0.0, 0.0],
        [tangent_length, 0.0],
        internal,
        [R, R - tangent_length],
        [R, R],
    ))

    u_control = np.linspace(0.0, 1.0, controls.shape[0])
    tck, _ = splprep([controls[:, 0], controls[:, 1]], u=u_control, s=0.0, k=3)
    u_dense = np.linspace(0.0, 1.0, centerline_eval_points)
    x, y = splev(u_dense, tck)
    center = np.column_stack((x, y))

    dx_du = np.gradient(center[:, 0], u_dense, edge_order=2)
    dy_du = np.gradient(center[:, 1], u_dense, edge_order=2)
    theta = np.unwrap(np.arctan2(dy_du, dx_du))

    return center, theta
```

Then add:

```python
def bspline_centerline_device_polygon(params):
    center, theta = _bspline_centerline_from_params(params)
    points, full_center, full_theta = _polygon_from_centerline(center, theta)
    bspline_centerline_device_polygon._last_center = full_center
    bspline_centerline_device_polygon._last_theta = full_theta
    bspline_centerline_device_polygon._last_bend_end = center[-1]
    return points
```

## Geometry Validation

Before returning the polygon, add sanity checks:

```python
if not np.all(np.isfinite(points)):
    raise ValueError("B-spline polygon contains non-finite values.")

edge_vectors = np.roll(points, -1, axis=0) - points
edge_lengths = np.sqrt(np.sum(edge_vectors**2, axis=1))
if np.any(edge_lengths < 1e-15):
    raise ValueError("B-spline polygon has near-zero edges.")
```

Also check approximate monotonic progress:

```python
if center[-1, 0] < R - 1e-12 or center[-1, 1] < R - 1e-12:
    ...
```

The endpoints are fixed, so this mainly catches spline pathologies.

## Integration Points In `optimize_fdtd.py`

Change geometry selection near the bottom from:

```python
geometry_func = circle_device_polygon if args.base_fom_only else single_piece_device_polygon
```

to something like:

```python
if args.base_fom_only or args.geometry == "circle":
    geometry_func = circle_device_polygon
elif args.geometry == "bspline-centerline":
    geometry_func = bspline_centerline_device_polygon
else:
    geometry_func = single_piece_device_polygon
```

Update `initial_params` and `bounds` construction so it depends on geometry mode:

```python
if args.geometry == "bspline-centerline":
    num_segments = args.bspline_controls
    initial_params = np.zeros(num_segments)
    bounds = [(-args.bspline_bound, args.bspline_bound)] * num_segments
else:
    # existing curvature initialization
```

If using xy offsets instead of radial offsets, use `2 * args.bspline_controls`.

## What To Compare

Run:

```bash
python3 optimize_fdtd.py --base-fom-only
python3 optimize_fdtd.py --geometry curvature --max-iter 10
python3 optimize_fdtd.py --geometry bspline-centerline --max-iter 10
```

Compare:

- FOM
- `loss_mean_dB`
- `loss_max_dB`
- field plots in FDTD
- geometry PNGs

If B-spline centerline is stable and improves loss, make it the default. If it is stable but limited, implement full independent inner/outer B-spline edges later.

## Later Upgrade: Independent Inner/Outer Sidewalls

The more paper-faithful version is:

```text
params -> inner B-spline sidewall + outer B-spline sidewall -> polygon
```

That enables local width variation. It is closer to the LNOI B-spline paper, but more fragile because sidewalls can cross or form invalid polygons. Do this only after centerline B-spline is working.
