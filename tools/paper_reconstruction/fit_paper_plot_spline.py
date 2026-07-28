#!/usr/bin/env python3
"""Fit a constrained cubic B-spline to the plot-derived FFC seed."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import reconstruct_paper_plot_seed as reconstruction


HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parents[1]
SEED_FILE = PROJECT_ROOT / "data" / "seeds" / "paper_ffc_plot_seed.npz"
FIT_PLOT_FILE = (
    PROJECT_ROOT
    / "artifacts"
    / "plots"
    / "paper_reconstruction"
    / "paper_ffc_spline_fit.png"
)

SPLINE_DEGREE = 3
INITIAL_CONTROL_COUNT = 32
FALLBACK_CONTROL_COUNT = 36
OUTPUT_POINT_COUNT = 1601
RMS_LIMIT_UM = 0.01
MAX_LIMIT_UM = 0.03
BOUNDARY_WEIGHT = 25.0


def chord_parameter(points: np.ndarray) -> np.ndarray:
    distances = np.linalg.norm(np.diff(points, axis=0), axis=1)
    cumulative = np.concatenate(([0.0], np.cumsum(distances)))
    if cumulative[-1] <= 0.0:
        raise ValueError("Cannot parameterize a zero-length centerline.")
    return cumulative / cumulative[-1]


def paper_break_parameters() -> np.ndarray:
    """Return the two access joins and eleven FFC segment boundaries."""
    segments = reconstruction.calibrated_plot_segments()
    dense_bend, _, _, dense_segment_ids = reconstruction.reconstruct_centerline(
        segments
    )
    calibrated_bend = reconstruction.calibrated_physical_bend(dense_bend)

    bend_distances = np.linalg.norm(np.diff(calibrated_bend, axis=0), axis=1)
    bend_arc = np.concatenate(([0.0], np.cumsum(bend_distances)))
    bend_length = float(bend_arc[-1])
    input_length = (
        reconstruction.PLATFORM_EXTENT_UM - float(calibrated_bend[-1, 0])
    )
    output_length = (
        reconstruction.PLATFORM_EXTENT_UM - float(calibrated_bend[-1, 1])
    )
    total_length = input_length + bend_length + output_length

    changes = np.flatnonzero(np.diff(dense_segment_ids) != 0) + 1
    internal = (input_length + bend_arc[changes]) / total_length
    return np.concatenate(
        (
            np.array([input_length / total_length]),
            internal,
            np.array([(input_length + bend_length) / total_length]),
        )
    )


def make_knot_vector(
    control_count: int,
    degree: int,
    break_parameters: np.ndarray,
) -> np.ndarray:
    """Create a clamped knot vector with C1 continuity at paper boundaries."""
    interior_count = control_count - degree - 1
    repeated_breaks = np.repeat(break_parameters, 2)
    extra_count = interior_count - len(repeated_breaks)
    if extra_count < 0:
        raise ValueError(
            f"{control_count} controls cannot represent all repeated breaks."
        )

    interval_edges = np.concatenate(([0.0], break_parameters, [1.0]))
    interval_widths = np.diff(interval_edges)
    largest = np.argsort(interval_widths)[::-1][:extra_count]
    extra_knots = np.array(
        [
            0.5 * (interval_edges[index] + interval_edges[index + 1])
            for index in largest
        ]
    )
    interior = np.sort(np.concatenate((repeated_breaks, extra_knots)))
    return np.concatenate(
        (
            np.zeros(degree + 1),
            interior,
            np.ones(degree + 1),
        )
    )


def bspline_basis_matrix(
    parameters: np.ndarray,
    knots: np.ndarray,
    degree: int,
    control_count: int,
) -> np.ndarray:
    """Evaluate all B-spline basis functions using Cox-de Boor recursion."""
    u = np.asarray(parameters, dtype=float)
    basis = np.zeros((len(u), len(knots) - 1), dtype=float)
    for index in range(len(knots) - 1):
        basis[:, index] = (
            (u >= knots[index]) & (u < knots[index + 1])
        ).astype(float)

    for current_degree in range(1, degree + 1):
        next_basis = np.zeros(
            (len(u), len(knots) - current_degree - 1), dtype=float
        )
        for index in range(next_basis.shape[1]):
            left_denominator = (
                knots[index + current_degree] - knots[index]
            )
            right_denominator = (
                knots[index + current_degree + 1] - knots[index + 1]
            )
            if left_denominator > 0.0:
                next_basis[:, index] += (
                    (u - knots[index])
                    / left_denominator
                    * basis[:, index]
                )
            if right_denominator > 0.0:
                next_basis[:, index] += (
                    (knots[index + current_degree + 1] - u)
                    / right_denominator
                    * basis[:, index + 1]
                )
        basis = next_basis

    result = basis[:, :control_count]
    result[u == 1.0, :] = 0.0
    result[u == 1.0, -1] = 1.0
    return result


def solve_coordinate(
    basis: np.ndarray,
    target: np.ndarray,
    weights: np.ndarray,
    fixed: dict[int, float],
) -> np.ndarray:
    control_count = basis.shape[1]
    fixed_indices = np.array(sorted(fixed), dtype=int)
    free_indices = np.array(
        [index for index in range(control_count) if index not in fixed],
        dtype=int,
    )
    fixed_values = np.array([fixed[index] for index in fixed_indices])

    adjusted_target = target - basis[:, fixed_indices] @ fixed_values
    weighted_basis = basis[:, free_indices] * weights[:, None]
    weighted_target = adjusted_target * weights
    free_values, *_ = np.linalg.lstsq(
        weighted_basis, weighted_target, rcond=None
    )

    result = np.zeros(control_count, dtype=float)
    result[fixed_indices] = fixed_values
    result[free_indices] = free_values
    return result


def fit_spline(
    target: np.ndarray,
    control_count: int,
    break_parameters: np.ndarray,
) -> dict[str, np.ndarray | float | int]:
    target_u = chord_parameter(target)
    knots = make_knot_vector(
        control_count, SPLINE_DEGREE, break_parameters
    )
    target_basis = bspline_basis_matrix(
        target_u, knots, SPLINE_DEGREE, control_count
    )

    weights = np.ones(len(target), dtype=float)
    for boundary in break_parameters:
        weights[np.argmin(np.abs(target_u - boundary))] = BOUNDARY_WEIGHT

    x_controls = solve_coordinate(
        target_basis,
        target[:, 0],
        weights,
        {
            0: 0.0,
            control_count - 2: reconstruction.PLATFORM_EXTENT_UM,
            control_count - 1: reconstruction.PLATFORM_EXTENT_UM,
        },
    )
    y_controls = solve_coordinate(
        target_basis,
        target[:, 1],
        weights,
        {
            0: 0.0,
            1: 0.0,
            control_count - 1: reconstruction.PLATFORM_EXTENT_UM,
        },
    )
    controls = np.column_stack((x_controls, y_controls))

    output_u = np.linspace(0.0, 1.0, OUTPUT_POINT_COUNT)
    output_basis = bspline_basis_matrix(
        output_u, knots, SPLINE_DEGREE, control_count
    )
    fitted = output_basis @ controls
    target_at_output = np.column_stack(
        (
            np.interp(output_u, target_u, target[:, 0]),
            np.interp(output_u, target_u, target[:, 1]),
        )
    )
    errors = np.linalg.norm(fitted - target_at_output, axis=1)

    return {
        "control_count": control_count,
        "controls": controls,
        "knots": knots,
        "parameters": output_u,
        "fitted": fitted,
        "target_at_output": target_at_output,
        "errors": errors,
        "rms_um": float(np.sqrt(np.mean(errors**2))),
        "max_um": float(np.max(errors)),
    }


def fit_with_fallback(
    target: np.ndarray,
    break_parameters: np.ndarray,
) -> dict[str, np.ndarray | float | int]:
    result = fit_spline(
        target, INITIAL_CONTROL_COUNT, break_parameters
    )
    if (
        result["rms_um"] > RMS_LIMIT_UM
        or result["max_um"] > MAX_LIMIT_UM
    ):
        result = fit_spline(
            target, FALLBACK_CONTROL_COUNT, break_parameters
        )
    if (
        result["rms_um"] > RMS_LIMIT_UM
        or result["max_um"] > MAX_LIMIT_UM
    ):
        raise RuntimeError(
            "Spline fit failed the configured RMS/maximum error limits."
        )
    return result


def validate_fit(
    result: dict[str, np.ndarray | float | int],
) -> None:
    controls = result["controls"]
    fitted = result["fitted"]
    knots = result["knots"]

    if not np.all(np.isfinite(fitted)):
        raise ValueError("Spline contains non-finite coordinates.")
    if not np.allclose(fitted[0], (0.0, 0.0), atol=1e-12):
        raise ValueError("Spline input endpoint is not fixed at (0, 0).")
    if not np.allclose(fitted[-1], (50.0, 50.0), atol=1e-12):
        raise ValueError("Spline output endpoint is not fixed at (50, 50).")
    if abs(float(controls[1, 1])) > 1e-12:
        raise ValueError("Spline input tangent is not horizontal.")
    if abs(float(controls[-2, 0]) - 50.0) > 1e-12:
        raise ValueError("Spline output tangent is not vertical.")
    if np.any(np.diff(knots) < 0.0):
        raise ValueError("Spline knot vector is not nondecreasing.")

    # Permit only sub-nanometre numerical overshoot from the least-squares fit.
    coordinate_tolerance_um = 1e-3
    if (
        float(np.min(fitted)) < -coordinate_tolerance_um
        or float(np.max(fitted)) > 50.0 + coordinate_tolerance_um
    ):
        raise ValueError("Spline leaves the 50 x 50 um design region.")


def update_seed_file(
    result: dict[str, np.ndarray | float | int],
    break_parameters: np.ndarray,
) -> None:
    with np.load(SEED_FILE, allow_pickle=False) as existing:
        payload = {name: existing[name] for name in existing.files}

    payload.update(
        {
            "spline_degree": np.array(SPLINE_DEGREE, dtype=np.int16),
            "spline_control_count": np.array(
                result["control_count"], dtype=np.int16
            ),
            "spline_control_points_um": result["controls"],
            "spline_knots": result["knots"],
            "spline_parameters": result["parameters"],
            "spline_centerline_xy_um": result["fitted"],
            "spline_break_parameters": break_parameters,
            "spline_target_rms_um": np.array(result["rms_um"]),
            "spline_target_max_um": np.array(result["max_um"]),
            "spline_output_point_count": np.array(
                OUTPUT_POINT_COUNT, dtype=np.int32
            ),
            "spline_endpoint_constraints": np.array(
                "P0=(0,0); P1_y=0; P[-2]_x=50; P[-1]=(50,50)"
            ),
        }
    )

    temporary = SEED_FILE.with_name(SEED_FILE.name + ".tmp.npz")
    np.savez_compressed(temporary, **payload)
    temporary.replace(SEED_FILE)


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    path = Path("/System/Library/Fonts/Supplemental") / name
    try:
        return ImageFont.truetype(str(path), size=size)
    except OSError:
        return ImageFont.load_default()


def save_fit_plot(
    result: dict[str, np.ndarray | float | int],
) -> None:
    image = Image.new("RGB", (1500, 650), "#ffffff")
    draw = ImageDraw.Draw(image)
    target = result["target_at_output"]
    fitted = result["fitted"]
    controls = result["controls"]
    errors = result["errors"]

    draw.text(
        (70, 25),
        "Plot-derived centerline and constrained B-spline",
        font=_font(23, bold=True),
        fill="#171a1f",
    )
    draw.text(
        (820, 25),
        "Pointwise fitting error",
        font=_font(23, bold=True),
        fill="#171a1f",
    )

    geometry_box = (70, 75, 680, 570)
    error_box = (820, 75, 1430, 570)
    draw.rectangle(geometry_box, outline="#aeb6c2", width=2)
    draw.rectangle(error_box, outline="#aeb6c2", width=2)

    def geometry_point(point: np.ndarray) -> tuple[float, float]:
        x = geometry_box[0] + point[0] / 50.0 * (
            geometry_box[2] - geometry_box[0]
        )
        y = geometry_box[3] - point[1] / 50.0 * (
            geometry_box[3] - geometry_box[1]
        )
        return x, y

    for fraction in (0.25, 0.5, 0.75):
        for box in (geometry_box, error_box):
            x = box[0] + fraction * (box[2] - box[0])
            y = box[1] + fraction * (box[3] - box[1])
            draw.line((x, box[1], x, box[3]), fill="#e3e6ea", width=1)
            draw.line((box[0], y, box[2], y), fill="#e3e6ea", width=1)

    draw.line(
        [geometry_point(point) for point in target],
        fill="#2477c8",
        width=7,
        joint="curve",
    )
    draw.line(
        [geometry_point(point) for point in fitted],
        fill="#d26a2e",
        width=3,
        joint="curve",
    )
    draw.line(
        [geometry_point(point) for point in controls],
        fill="#8a929d",
        width=1,
    )
    for point in controls:
        x, y = geometry_point(point)
        draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill="#8a929d")

    error_ceiling = max(MAX_LIMIT_UM * 1.15, float(np.max(errors)) * 1.1)

    def error_point(index: int, error: float) -> tuple[float, float]:
        x = error_box[0] + index / (len(errors) - 1) * (
            error_box[2] - error_box[0]
        )
        y = error_box[3] - error / error_ceiling * (
            error_box[3] - error_box[1]
        )
        return x, y

    draw.line(
        [error_point(index, value) for index, value in enumerate(errors)],
        fill="#d26a2e",
        width=3,
        joint="curve",
    )
    limit_y = error_point(0, MAX_LIMIT_UM)[1]
    draw.line(
        (error_box[0], limit_y, error_box[2], limit_y),
        fill="#b5bbc3",
        width=2,
    )
    draw.text(
        (error_box[0], 585),
        (
            f"{result['control_count']} controls · {OUTPUT_POINT_COUNT} points "
            f"· RMS {result['rms_um']:.5f} um · max {result['max_um']:.5f} um"
        ),
        font=_font(17),
        fill="#4c535d",
    )
    draw.text(
        (70, 585),
        "blue: plot target   orange: spline   gray: control polygon",
        font=_font(17),
        fill="#4c535d",
    )
    image.save(FIT_PLOT_FILE)


def main() -> None:
    FIT_PLOT_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not SEED_FILE.exists():
        reconstruction.main()

    with np.load(SEED_FILE, allow_pickle=False) as seed:
        target = np.asarray(seed["platform_centerline_xy_um"], dtype=float)

    breaks = paper_break_parameters()
    result = fit_with_fallback(target, breaks)
    validate_fit(result)
    update_seed_file(result, breaks)
    save_fit_plot(result)

    report = {
        "seed_file": str(SEED_FILE),
        "fit_plot": str(FIT_PLOT_FILE),
        "control_count": int(result["control_count"]),
        "output_point_count": OUTPUT_POINT_COUNT,
        "degree": SPLINE_DEGREE,
        "break_count": int(len(breaks)),
        "rms_um": result["rms_um"],
        "max_um": result["max_um"],
        "passed": bool(
            result["rms_um"] <= RMS_LIMIT_UM
            and result["max_um"] <= MAX_LIMIT_UM
        ),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
