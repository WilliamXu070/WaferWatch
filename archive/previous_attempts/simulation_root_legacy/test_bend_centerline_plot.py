import numpy as np
from scipy.interpolate import PchipInterpolator
import matplotlib.pyplot as plt
from pathlib import Path


def sigmoid(x: np.ndarray) -> np.ndarray:
    """Numerically stable sigmoid."""
    x = np.asarray(x, dtype=float)
    out = np.empty_like(x)
    pos = x >= 0
    out[pos] = 1.0 / (1.0 + np.exp(-x[pos]))
    neg = ~pos
    expx = np.exp(x[neg])
    out[neg] = expx / (1.0 + expx)
    return out


def softplus(x: np.ndarray, beta: float = 1.0) -> np.ndarray:
    """Smooth positive mapping used for slope control.

    Kept for backward compatibility with the previous script naming.
    """
    x = np.asarray(x, dtype=float)
    return np.log1p(np.exp(beta * x)) / beta


def build_bend_path(
    params,
    num_segments: int = 100,
    width: float = 1.83e-6,
    r0: float = 25e-6,
    samples: int = 2000,
    beta: float = 1.0,
    kappa_slew_limit: float = 2.05e9,
):
    """Build a 90-degree bend from a monotone-curvature centerline.

    Params are curvature increments; cumulative sum gives curvature at segment knots.
    """
    params = np.asarray(params, dtype=float)
    if params.size != num_segments:
        raise ValueError(f"params must have length {num_segments}, got {params.size}")

    s_total = (np.pi / 2) * r0
    s_knots = np.linspace(0.0, s_total, num_segments + 1)
    s_fine = np.linspace(0.0, s_total, samples)

    # Enforce start curvature at 0 and strictly increasing thereafter.
    # Hard bound on curvature slope: dκ/ds ≤ kappa_slew_limit
    # (manufacturability / low-reflection constraint).
    ds_segment = s_total / num_segments
    delta_kappa_max = kappa_slew_limit * ds_segment
    delta_kappa = delta_kappa_max * sigmoid(params)

    # Optional: keep nondecreasing curvature from the previous cumulative design.
    # With sigmoid mapping this is always guaranteed and smooth.
    kappa_knots = np.zeros(num_segments + 1)
    kappa_knots[1:] = np.cumsum(delta_kappa)

    # Smooth curvature profile (C1 continuity) along arc length.
    kappa_interp = PchipInterpolator(s_knots, kappa_knots, extrapolate=False)
    kappa_dense = kappa_interp(s_fine)
    dkappa_ds = np.gradient(kappa_dense, s_fine, edge_order=2)

    # Normalize to exact 90-degree bend: total turning angle = pi/2
    total_angle = np.trapezoid(kappa_dense, s_fine)
    if not np.isfinite(total_angle) or total_angle <= 0:
        raise RuntimeError("Invalid curvature profile; normalization failed.")
    scale = (np.pi / 2) / total_angle

    # Hard bound on dκ/ds should not be relaxed by renormalization:
    # only allow angle-compression (scale <= 1). If scale > 1, keep raw profile
    # and allow FoM to reject it.
    apply_scale = min(1.0, scale)
    if apply_scale < 1.0:
        kappa_dense *= apply_scale
        kappa_knots *= apply_scale
        delta_kappa *= apply_scale

    # Rebuild dense curvature after clipping/scaling for consistency checks.
    kappa_interp = PchipInterpolator(s_knots, kappa_knots, extrapolate=False)
    kappa_dense = kappa_interp(s_fine)
    dkappa_ds = np.gradient(kappa_dense, s_fine, edge_order=2)

    # Rebuild interpolant after scaling for consistency checks
    kappa_interp = PchipInterpolator(s_knots, kappa_knots, extrapolate=False)
    kappa_dense = kappa_interp(s_fine)

    # Integrate tangent angle from curvature over arc length.
    ds = np.diff(s_fine)
    theta = np.zeros(samples)
    if samples > 1:
        dtheta = 0.5 * (kappa_dense[:-1] + kappa_dense[1:]) * ds
        theta[1:] = np.cumsum(dtheta)

    # Integrate position from tangent (x' = cos(theta), y' = sin(theta))
    x = np.zeros(samples)
    y = np.zeros(samples)
    if samples > 1:
        dx = 0.5 * (np.cos(theta[:-1]) + np.cos(theta[1:])) * ds
        dy = 0.5 * (np.sin(theta[:-1]) + np.sin(theta[1:])) * ds
        x[1:] = np.cumsum(dx)
        y[1:] = np.cumsum(dy)

    center = np.column_stack((x, y))

    # Build waveguide side traces using unit normals.
    normals = np.column_stack((-np.sin(theta), np.cos(theta)))
    outer = center + 0.5 * width * normals
    inner = center - 0.5 * width * normals
    polygon = np.vstack((outer, inner[::-1]))

    return {
        "s_fine": s_fine,
        "kappa_dense": kappa_dense,
        "dkappa_ds": dkappa_ds,
        "theta": theta,
        "center": center,
        "outer": outer,
        "inner": inner,
        "polygon": polygon,
        "kappa_knots": kappa_knots,
        "delta_kappa": delta_kappa,
    }


def plot_bend(result, width: float, out_path: str | None = None):
    """Plot centerline, edges, and curvature diagnostics."""
    center = result["center"]
    outer = result["outer"]
    inner = result["inner"]

    fig, axes = plt.subplots(2, 2, figsize=(12, 9))

    # Geometry
    axes[0, 0].plot(center[:, 0] * 1e6, center[:, 1] * 1e6, label="Centerline", lw=1.6)
    axes[0, 0].plot(outer[:, 0] * 1e6, outer[:, 1] * 1e6, "--", label="Outer edge")
    axes[0, 0].plot(inner[:, 0] * 1e6, inner[:, 1] * 1e6, "--", label="Inner edge")
    axes[0, 0].set_title("Waveguide bend geometry")
    axes[0, 0].set_xlabel("x [um]")
    axes[0, 0].set_ylabel("y [um]")
    axes[0, 0].axis("equal")
    axes[0, 0].grid(True, alpha=0.3)
    axes[0, 0].legend(loc="best", fontsize=8)

    # Curvature
    axes[0, 1].plot(result["s_fine"] * 1e6, result["kappa_dense"], lw=1.4)
    axes[0, 1].set_title("Curvature κ(s)")
    axes[0, 1].set_xlabel("Arc length s [um]")
    axes[0, 1].set_ylabel("κ [1/m]")
    axes[0, 1].grid(True, alpha=0.3)

    # Curvature derivative
    axes[1, 0].plot(result["s_fine"] * 1e6, result["dkappa_ds"], lw=1.1)
    axes[1, 0].set_title("Derivative dκ/ds")
    axes[1, 0].set_xlabel("Arc length s [um]")
    axes[1, 0].set_ylabel("dκ/ds [1/m^2]")
    axes[1, 0].grid(True, alpha=0.3)

    # Segment-wise control values
    seg = np.arange(result["kappa_knots"].size - 1)
    axes[1, 1].plot(seg, result["kappa_knots"][1:], marker="o", ms=2, lw=1)
    axes[1, 1].set_title("Curvature at segment knots (cum from 0)")
    axes[1, 1].set_xlabel("Segment index")
    axes[1, 1].set_ylabel("κ at knot [1/m]")
    axes[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    if out_path is None:
        out_path = str(Path(__file__).with_name("bend_initial_shape.png"))
    plt.savefig(out_path, dpi=300, bbox_inches="tight")
    print(f"Saved plot to: {out_path}")

    if plt.get_backend().lower() != "agg":
        plt.show()
    else:
        plt.close()

    # quick console check
    inc = np.diff(result["kappa_knots"])
    print(f"kappa start = {result['kappa_knots'][0]:.3e} 1/m")
    print(f"kappa end = {result['kappa_knots'][-1]:.3e} 1/m")
    print(f"min Δκ = {np.min(inc):.3e} ,  all increasing = {np.all(inc > 0)}")
    max_slew = np.max(np.abs(np.gradient(result["kappa_dense"], result["s_fine"])))
    print(f"max dκ/ds = {max_slew:.3e} 1/m^2 (limit {kappa_slew_limit:.3e})")
    print(f"final y endpoint = {center[-1,1]*1e6:.3f} um, x endpoint = {center[-1,0]*1e6:.3f} um")
    print(f"effective bend angle = {result['theta'][-1]:.6f} rad")


if __name__ == "__main__":
    NUM_SEGMENTS = 100
    WIDTH = 1.83e-6
    R_GUESS = 25e-6

    # Start with flat, weak-curvature design (all zeros).
    # Seed near upper slope so the initial geometry is a realistic turn.
    initial_params = np.full(NUM_SEGMENTS, 5.0)

    result = build_bend_path(
        params=initial_params,
        num_segments=NUM_SEGMENTS,
        width=WIDTH,
        r0=R_GUESS,
        samples=3000,
        beta=1.0,
    )

    plot_bend(result, WIDTH)
