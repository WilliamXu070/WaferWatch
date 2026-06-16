import numpy as np
from scipy.interpolate import PchipInterpolator


def polygon_area(points):
    x = points[:, 0]
    y = points[:, 1]
    return 0.5*np.sum(x*np.roll(y, -1) - y*np.roll(x, -1))


def _cumtrapz(y, x):
    dx = np.diff(x)
    increments = 0.5*(y[:-1] + y[1:])*dx
    return np.concatenate(([0.0], np.cumsum(increments)))


def _softplus(x):
    x = np.asarray(x, dtype=float)
    return np.log1p(np.exp(-np.abs(x))) + np.maximum(x, 0.0)


def curvature90_centerline(params, footprint, samples):
    """Monotonic-curvature 90 degree centerline with fixed square endpoint."""

    params = np.asarray(params, dtype=float).ravel()
    if params.size < 2:
        raise ValueError("curvature90_centerline needs at least two parameters")
    if samples < 16:
        raise ValueError("samples must be at least 16")

    u_controls = np.linspace(0.0, 1.0, params.size + 1)

    # Positive increments make the curvature profile monotonic increasing.
    increments = _softplus(np.clip(params, -20.0, 20.0)) + 1e-6
    curvature_shape_controls = np.concatenate(([0.0], np.cumsum(increments)))
    curvature_shape_controls = curvature_shape_controls/curvature_shape_controls[-1]

    u = np.linspace(0.0, 1.0, samples)
    shape = PchipInterpolator(u_controls, curvature_shape_controls)(u)
    shape = np.maximum(shape, 0.0)

    arc_length_guess = 0.5*np.pi*footprint
    s = u*arc_length_guess
    raw_angle = np.trapezoid(shape, s)
    if raw_angle <= 0.0 or not np.isfinite(raw_angle):
        raise ValueError("invalid raw curvature integral")

    kappa = shape*(0.5*np.pi/raw_angle)
    theta = _cumtrapz(kappa, s)
    theta = theta*(0.5*np.pi/theta[-1])
    theta[0] = 0.0
    theta[-1] = 0.5*np.pi

    x = _cumtrapz(np.cos(theta), s)
    y = _cumtrapz(np.sin(theta), s)

    if x[-1] <= 0.0 or y[-1] <= 0.0:
        raise ValueError("invalid integrated centerline endpoint")

    # Keep source/FOM anchors simple and exact while preserving endpoint tangents.
    x = x*(footprint/x[-1])
    y = y*(footprint/y[-1])
    center = np.column_stack((x, y))
    center[0] = [0.0, 0.0]
    center[-1] = [footprint, footprint]

    tangent_x = np.gradient(center[:, 0], u, edge_order=2)
    tangent_y = np.gradient(center[:, 1], u, edge_order=2)
    theta_geom = np.unwrap(np.arctan2(tangent_y, tangent_x))
    theta_geom[0] = 0.0
    theta_geom[-1] = 0.5*np.pi

    curvature90_centerline.last_u = u
    curvature90_centerline.last_s = s
    curvature90_centerline.last_kappa = kappa
    curvature90_centerline.last_theta_integral = theta
    curvature90_centerline.last_theta = theta_geom
    curvature90_centerline.last_center = center
    curvature90_centerline.last_min_radius = 1.0/np.max(kappa)

    return center, theta_geom


def centerline_core_polygon(
    params,
    footprint,
    wg_width,
    input_arm_length,
    output_arm_length,
    samples=1000,
    arm_step=0.1e-6,
):
    """Single constant-width polygon: input arm + curvature centerline + output arm."""

    bend_center, bend_theta = curvature90_centerline(params, footprint, samples)

    input_points = max(8, int(np.ceil(input_arm_length/arm_step)) + 1)
    output_points = max(8, int(np.ceil(output_arm_length/arm_step)) + 1)

    input_x = np.linspace(-input_arm_length, 0.0, input_points, endpoint=False)
    input_center = np.column_stack((input_x, np.zeros_like(input_x)))
    input_theta = np.zeros(input_points)

    output_y = np.linspace(footprint, footprint + output_arm_length, output_points + 1)[1:]
    output_center = np.column_stack((np.full(output_points, footprint), output_y))
    output_theta = np.full(output_points, 0.5*np.pi)

    center = np.vstack((input_center, bend_center, output_center))
    theta = np.concatenate((input_theta, bend_theta, output_theta))
    normal = np.column_stack((-np.sin(theta), np.cos(theta)))

    outer = center - 0.5*wg_width*normal
    inner = center + 0.5*wg_width*normal
    points = np.vstack((outer, inner[::-1]))

    if polygon_area(points) < 0:
        points = points[::-1]

    centerline_core_polygon.last_center = center
    centerline_core_polygon.last_theta = theta
    centerline_core_polygon.last_bend_center = bend_center
    centerline_core_polygon.last_bend_theta = bend_theta
    return points, center, theta, bend_center, bend_theta


def edge_lengths(points):
    edge_vectors = np.roll(points, -1, axis=0) - points
    return np.sqrt(np.sum(edge_vectors**2, axis=1))


def polygon_diagnostics(points):
    lengths = edge_lengths(points)
    return {
        "points": int(points.shape[0]),
        "signed_area": float(polygon_area(points)),
        "min_edge": float(np.min(lengths)),
        "median_edge": float(np.median(lengths)),
        "max_edge": float(np.max(lengths)),
        "near_zero_edges": np.where(lengths < 1e-15)[0].tolist(),
        "bbox": (
            float(np.min(points[:, 0])),
            float(np.max(points[:, 0])),
            float(np.min(points[:, 1])),
            float(np.max(points[:, 1])),
        ),
    }


def _segments_intersect(a, b, c, d):
    def orient(p, q, r):
        return (q[0] - p[0])*(r[1] - p[1]) - (q[1] - p[1])*(r[0] - p[0])

    ab = orient(a, b, c)*orient(a, b, d)
    cd = orient(c, d, a)*orient(c, d, b)
    return ab < 0.0 and cd < 0.0


def has_self_intersections(points, max_checks=2000000):
    n = points.shape[0]
    checks = 0
    for i in range(n):
        a = points[i]
        b = points[(i + 1) % n]
        min_ab = np.minimum(a, b)
        max_ab = np.maximum(a, b)
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            c = points[j]
            d = points[(j + 1) % n]
            if np.any(max_ab < np.minimum(c, d)) or np.any(np.maximum(c, d) < min_ab):
                continue
            checks += 1
            if checks > max_checks:
                return False
            if _segments_intersect(a, b, c, d):
                return True
    return False


def validate_centerline_geometry(params, footprint, width, input_arm, output_arm, samples, min_radius_factor=2.0):
    points, center, theta, bend_center, bend_theta = centerline_core_polygon(
        params=params,
        footprint=footprint,
        wg_width=width,
        input_arm_length=input_arm,
        output_arm_length=output_arm,
        samples=samples,
    )
    diagnostics = polygon_diagnostics(points)
    failures = []

    if diagnostics["signed_area"] <= 0.0:
        failures.append("polygon orientation is not CCW")
    if diagnostics["near_zero_edges"]:
        failures.append("near-zero polygon edges: %s" % diagnostics["near_zero_edges"])
    if has_self_intersections(points):
        failures.append("polygon self-intersection detected")
    if not np.allclose(bend_center[0], [0.0, 0.0], atol=1e-14):
        failures.append("bend start is not at origin")
    if not np.allclose(bend_center[-1], [footprint, footprint], atol=1e-14):
        failures.append("bend end is not at footprint square")
    if abs(bend_theta[0]) > 2e-2:
        failures.append("input tangent is not horizontal")
    if abs(bend_theta[-1] - 0.5*np.pi) > 2e-2:
        failures.append("output tangent is not vertical")
    if np.min(np.diff(bend_center[:, 0])) < -1e-12:
        failures.append("centerline x is not monotonic")
    if np.min(np.diff(bend_center[:, 1])) < -1e-12:
        failures.append("centerline y is not monotonic")
    if np.min(np.diff(np.unwrap(bend_theta))) < -2e-2:
        failures.append("centerline tangent angle is not monotonic")

    min_radius = float(getattr(curvature90_centerline, "last_min_radius", np.inf))
    if min_radius < min_radius_factor*width:
        failures.append("min radius %.3g is below %.3g" % (min_radius, min_radius_factor*width))

    return {
        "points": points,
        "center": center,
        "theta": theta,
        "bend_center": bend_center,
        "bend_theta": bend_theta,
        "diagnostics": diagnostics,
        "min_radius": min_radius,
        "failures": failures,
    }
