import numpy as np
from scipy.interpolate import PchipInterpolator


def polygon_area(points):
    x = points[:, 0]
    y = points[:, 1]
    return 0.5*np.sum(x*np.roll(y, -1) - y*np.roll(x, -1))


def radial_centerline(params, footprint, samples):
    """Quarter-bend centerline from radial offsets at fixed angular controls."""

    params = np.asarray(params, dtype=float)
    if params.ndim != 1:
        raise ValueError("params must be a 1D array")
    if params.size < 1:
        raise ValueError("at least one radial control parameter is required")

    phi_controls = np.linspace(0.0, np.pi/2, params.size + 2)
    offset_controls = np.concatenate(([0.0], params, [0.0]))
    offset_interp = PchipInterpolator(phi_controls, offset_controls)

    phi = np.linspace(0.0, np.pi/2, samples)
    radius = footprint + offset_interp(phi)
    if np.any(radius <= 0.0):
        raise ValueError("radial offset produced non-positive radius")

    x = radius*np.sin(phi)
    y = footprint - radius*np.cos(phi)
    center = np.column_stack((x, y))
    center[0] = [0.0, 0.0]
    center[-1] = [footprint, footprint]

    dx_dphi = np.gradient(center[:, 0], phi, edge_order=2)
    dy_dphi = np.gradient(center[:, 1], phi, edge_order=2)
    theta = np.unwrap(np.arctan2(dy_dphi, dx_dphi))
    theta[0] = 0.0
    theta[-1] = np.pi/2

    return center, theta


def single_core_polygon(
    params,
    footprint,
    wg_width,
    input_arm_length,
    output_arm_length,
    samples=800,
    arm_step=0.1e-6,
):
    """One continuous core polygon: input arm + radial-offset bend + output arm."""

    bend_center, bend_theta = radial_centerline(params, footprint, samples)

    input_points = max(8, int(np.ceil(input_arm_length/arm_step)) + 1)
    output_points = max(8, int(np.ceil(output_arm_length/arm_step)) + 1)

    input_x = np.linspace(-input_arm_length, 0.0, input_points, endpoint=False)
    input_center = np.column_stack((input_x, np.zeros_like(input_x)))
    input_theta = np.zeros(input_points)

    output_y = np.linspace(footprint, footprint + output_arm_length, output_points + 1)[1:]
    output_center = np.column_stack((np.full(output_points, footprint), output_y))
    output_theta = np.full(output_points, np.pi/2)

    center = np.vstack((input_center, bend_center, output_center))
    theta = np.concatenate((input_theta, bend_theta, output_theta))
    normal = np.column_stack((-np.sin(theta), np.cos(theta)))

    outer = center - (wg_width/2)*normal
    inner = center + (wg_width/2)*normal
    points = np.vstack((outer, inner[::-1]))

    if polygon_area(points) < 0:
        points = points[::-1]

    return points, center, theta, bend_center, bend_theta


def polygon_diagnostics(points):
    edge_vectors = np.roll(points, -1, axis=0) - points
    edge_lengths = np.sqrt(np.sum(edge_vectors**2, axis=1))
    return {
        "points": int(points.shape[0]),
        "signed_area": float(polygon_area(points)),
        "min_edge": float(np.min(edge_lengths)),
        "median_edge": float(np.median(edge_lengths)),
        "max_edge": float(np.max(edge_lengths)),
        "near_zero_edges": np.where(edge_lengths < 1e-15)[0].tolist(),
        "bbox": (
            float(np.min(points[:, 0])),
            float(np.max(points[:, 0])),
            float(np.min(points[:, 1])),
            float(np.max(points[:, 1])),
        ),
    }
