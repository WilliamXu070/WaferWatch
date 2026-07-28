#!/usr/bin/env python3
"""Reconstruct the 45.5 um FFC seed digitized from Supplementary Fig. S2(c).

The published plot contains twelve disconnected radius-versus-angle segments.
Each segment is integrated independently in theta while keeping position and
tangent continuous across curvature jumps.  The script saves both the native
paper bend and a 50 x 50 um platform version with tangent-matched access arms.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parents[1]
OUTPUT_SEED = PROJECT_ROOT / "data" / "seeds" / "paper_ffc_plot_seed.npz"
OUTPUT_COMPARISON = (
    PROJECT_ROOT
    / "artifacts"
    / "plots"
    / "paper_reconstruction"
    / "paper_ffc_seed_comparison.png"
)

PLATFORM_EXTENT_UM = 50.0
WAVEGUIDE_WIDTH_UM = 0.8
REPORTED_EQUIVALENT_RADIUS_UM = 45.5

# Calibration of the native 4103 x 2116 px TIFF embedded in the official
# supplementary DOCX.  Supplementary Fig. S2(c) axes:
#   x = 2971..3962 px -> theta = 0..pi/2 rad
#   y = 921..178 px   -> radius = 0..300 um
PLOT_X_LEFT_PX = 2971.0
PLOT_X_RIGHT_PX = 3962.0
PLOT_Y_BOTTOM_PX = 921.0
PLOT_Y_TOP_PX = 178.0
PLOT_RADIUS_MAX_UM = 300.0

# Square-marker centers digitized from S2(c), grouped by connected plotted
# segment.  Repeated theta values at adjacent groups are intentional curvature
# jumps in the generalized free-form curve.
PLOT_SEGMENTS_PX = (
    ((2971, 364), (2978, 253)),
    ((2978, 455), (2991, 588)),
    ((2991, 671), (3011, 699)),
    ((3012, 745), (3039, 755)),
    ((3039, 784), (3075, 787)),
    (
        (3075, 807),
        (3118, 808),
        (3163, 816),
        (3212, 826),
        (3265, 834),
        (3323, 839),
        (3385, 845),
        (3449, 846),
        (3513, 846),
        (3626, 844),
        (3687, 838),
        (3741, 833),
        (3756, 832),
        (3808, 831),
    ),
    ((3809, 816), (3854, 814)),
    ((3854, 797), (3892, 789)),
    ((3893, 763), (3921, 747)),
    ((3922, 706), (3943, 673)),
    ((3943, 596), (3955, 392)),
    ((3955, 213), (3963, 373)),
)

# The previously accepted paired-edge microscope reconstruction.  These are
# the target centerline points before the 20-control-point spline fit; the
# original cropped image had no physical scale, so it was normalized to 50 um.
IMAGE_REFERENCE_XY_UM = np.array(
    [
        (0.00, 0.00), (1.65, 0.02), (3.29, 0.08), (4.93, 0.21),
        (6.57, 0.38), (8.21, 0.53), (9.85, 0.65), (11.49, 0.77),
        (13.12, 0.95), (14.75, 1.20), (16.37, 1.50), (17.98, 1.85),
        (19.58, 2.23), (21.16, 2.67), (22.73, 3.16), (24.29, 3.71),
        (25.82, 4.31), (27.33, 4.96), (28.82, 5.65), (30.29, 6.40),
        (31.72, 7.21), (33.12, 8.08), (34.48, 9.01), (35.80, 9.98),
        (37.09, 11.00), (38.34, 12.08), (39.53, 13.21), (40.67, 14.40),
        (41.76, 15.63), (42.80, 16.91), (43.78, 18.23), (44.69, 19.60),
        (45.50, 21.03), (46.24, 22.50), (46.90, 24.01), (47.50, 25.54),
        (48.01, 27.11), (48.44, 28.69), (48.79, 30.30), (49.03, 31.93),
        (49.20, 33.57), (49.35, 35.21), (49.47, 36.85), (49.56, 38.49),
        (49.60, 40.14), (49.63, 41.78), (49.67, 43.43), (49.72, 45.07),
        (49.81, 46.71), (49.92, 48.36), (50.00, 50.00),
    ],
    dtype=float,
)


def _pixel_to_theta_radius(x_px: float, y_px: float) -> tuple[float, float]:
    theta = (x_px - PLOT_X_LEFT_PX) / (PLOT_X_RIGHT_PX - PLOT_X_LEFT_PX)
    theta *= 0.5 * math.pi
    radius = (PLOT_Y_BOTTOM_PX - y_px) / (
        PLOT_Y_BOTTOM_PX - PLOT_Y_TOP_PX
    )
    radius *= PLOT_RADIUS_MAX_UM
    return theta, radius


def calibrated_plot_segments() -> list[np.ndarray]:
    """Convert markers to physical units and close one-pixel theta gaps."""
    raw = [
        np.array([_pixel_to_theta_radius(x, y) for x, y in segment])
        for segment in PLOT_SEGMENTS_PX
    ]

    boundaries = [0.0]
    for left, right in zip(raw[:-1], raw[1:]):
        boundaries.append(0.5 * (left[-1, 0] + right[0, 0]))
    boundaries.append(0.5 * math.pi)

    calibrated = []
    for index, segment in enumerate(raw):
        old_start, old_end = segment[0, 0], segment[-1, 0]
        new_start, new_end = boundaries[index], boundaries[index + 1]
        fraction = (segment[:, 0] - old_start) / (old_end - old_start)
        adjusted = segment.copy()
        adjusted[:, 0] = new_start + fraction * (new_end - new_start)
        calibrated.append(adjusted)
    return calibrated


def reconstruct_centerline(
    segments: list[np.ndarray],
    samples_per_quarter_turn: int = 16000,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Integrate dx=R*cos(theta)dtheta and dy=R*sin(theta)dtheta."""
    position = np.zeros(2, dtype=float)
    xy = [position.copy()]
    theta_all = [segments[0][0, 0]]
    radius_all = [segments[0][0, 1]]
    segment_ids = [0]

    for segment_id, nodes in enumerate(segments):
        for left, right in zip(nodes[:-1], nodes[1:]):
            theta_0, radius_0 = left
            theta_1, radius_1 = right
            count = max(
                8,
                int(
                    math.ceil(
                        samples_per_quarter_turn
                        * (theta_1 - theta_0)
                        / (0.5 * math.pi)
                    )
                ),
            )
            theta = np.linspace(theta_0, theta_1, count + 1)
            radius = np.linspace(radius_0, radius_1, count + 1)
            derivative = np.column_stack(
                (radius * np.cos(theta), radius * np.sin(theta))
            )
            increments = 0.5 * (derivative[:-1] + derivative[1:])
            increments *= np.diff(theta)[:, None]
            local_xy = position + np.cumsum(increments, axis=0)
            xy.extend(local_xy)
            theta_all.extend(theta[1:])
            radius_all.extend(radius[1:])
            segment_ids.extend([segment_id] * count)
            position = local_xy[-1]

    return (
        np.asarray(xy),
        np.asarray(theta_all),
        np.asarray(radius_all),
        np.asarray(segment_ids, dtype=np.int16),
    )


def resample_polyline(points: np.ndarray, count: int) -> np.ndarray:
    distances = np.linalg.norm(np.diff(points, axis=0), axis=1)
    arc = np.concatenate(([0.0], np.cumsum(distances)))
    targets = np.linspace(0.0, arc[-1], count)
    return np.column_stack(
        (
            np.interp(targets, arc, points[:, 0]),
            np.interp(targets, arc, points[:, 1]),
        )
    )


def platform_centerline(native_bend: np.ndarray, count: int = 1201) -> np.ndarray:
    """Place the native bend in a 50 x 50 um box using tangent access arms."""
    end_x, end_y = native_bend[-1]
    input_length = PLATFORM_EXTENT_UM - end_x
    output_length = PLATFORM_EXTENT_UM - end_y
    if input_length < 0.0 or output_length < 0.0:
        raise ValueError(
            "Native paper bend exceeds the configured platform extent."
        )

    input_arm = np.column_stack(
        (
            np.linspace(0.0, input_length, 80),
            np.zeros(80),
        )
    )
    shifted_bend = native_bend + np.array([input_length, 0.0])
    output_arm = np.column_stack(
        (
            np.full(80, PLATFORM_EXTENT_UM),
            np.linspace(end_y, PLATFORM_EXTENT_UM, 80),
        )
    )
    joined = np.vstack((input_arm[:-1], shifted_bend, output_arm[1:]))
    return resample_polyline(joined, count)


def calibrated_physical_bend(digitized_bend: np.ndarray) -> np.ndarray:
    """Anchor the raster reconstruction to the paper's stated Req=45.5 um."""
    digitized_equivalent_radius = 0.5 * float(np.sum(digitized_bend[-1]))
    scale = REPORTED_EQUIVALENT_RADIUS_UM / digitized_equivalent_radius
    return digitized_bend * scale


def isotropically_normalized_bend(native_bend: np.ndarray) -> np.ndarray:
    equivalent_extent = 0.5 * float(np.sum(native_bend[-1]))
    return native_bend * (PLATFORM_EXTENT_UM / equivalent_extent)


def comparison_metrics(
    reference: np.ndarray,
    candidate: np.ndarray,
    count: int = 1201,
) -> dict[str, float]:
    reference = resample_polyline(reference, count)
    candidate = resample_polyline(candidate, count)
    paired = np.linalg.norm(reference - candidate, axis=1)

    difference = reference[:, None, :] - candidate[None, :, :]
    distances = np.linalg.norm(difference, axis=2)
    reference_nearest = np.min(distances, axis=1)
    candidate_nearest = np.min(distances, axis=0)

    return {
        "paired_arclength_rms_um": float(np.sqrt(np.mean(paired**2))),
        "paired_arclength_max_um": float(np.max(paired)),
        "symmetric_chamfer_rms_um": float(
            np.sqrt(
                0.5
                * (
                    np.mean(reference_nearest**2)
                    + np.mean(candidate_nearest**2)
                )
            )
        ),
        "symmetric_hausdorff_um": float(
            max(np.max(reference_nearest), np.max(candidate_nearest))
        ),
    }


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    path = Path("/System/Library/Fonts/Supplemental") / name
    try:
        return ImageFont.truetype(str(path), size=size)
    except OSError:
        return ImageFont.load_default()


def _draw_axes(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    x_range: tuple[float, float],
    y_range: tuple[float, float],
    x_label: str,
    y_label: str,
) -> tuple[callable, callable]:
    left, top, right, bottom = box
    draw.rectangle(box, outline="#aeb6c2", width=2)
    for fraction in (0.25, 0.5, 0.75):
        x = left + fraction * (right - left)
        y = bottom - fraction * (bottom - top)
        draw.line((x, top, x, bottom), fill="#e3e6ea", width=1)
        draw.line((left, y, right, y), fill="#e3e6ea", width=1)
    draw.text(
        ((left + right) // 2, bottom + 28),
        x_label,
        anchor="mm",
        font=_font(19),
        fill="#252a31",
    )
    draw.text(
        (left - 50, (top + bottom) // 2),
        y_label,
        anchor="mm",
        font=_font(19),
        fill="#252a31",
    )

    def map_x(value: float) -> float:
        return left + (value - x_range[0]) / (x_range[1] - x_range[0]) * (
            right - left
        )

    def map_y(value: float) -> float:
        return bottom - (value - y_range[0]) / (y_range[1] - y_range[0]) * (
            bottom - top
        )

    return map_x, map_y


def _draw_polyline(
    draw: ImageDraw.ImageDraw,
    points: np.ndarray,
    map_x: callable,
    map_y: callable,
    color: str,
    width: int,
) -> None:
    mapped = [(map_x(float(x)), map_y(float(y))) for x, y in points]
    draw.line(mapped, fill=color, width=width, joint="curve")


def save_comparison_plot(
    segments: list[np.ndarray],
    normalized_bend: np.ndarray,
    platform: np.ndarray,
    metrics_shape: dict[str, float],
    metrics_platform: dict[str, float],
) -> None:
    canvas = Image.new("RGB", (1740, 650), "#ffffff")
    draw = ImageDraw.Draw(canvas)
    title_font = _font(23, bold=True)
    label_font = _font(18)
    small_font = _font(16)

    boxes = (
        (80, 70, 535, 525),
        (660, 70, 1115, 525),
        (1240, 70, 1695, 525),
    )
    titles = (
        "Digitized Fig. S2(c)",
        "Shape-only comparison",
        "50 x 50 um simulation seed",
    )
    for box, title in zip(boxes, titles):
        draw.text((box[0], 28), title, font=title_font, fill="#171a1f")

    map_x, map_y = _draw_axes(
        draw,
        boxes[0],
        (0.0, 0.5 * math.pi),
        (0.0, 300.0),
        "theta (rad)",
        "radius (um)",
    )
    for segment in segments:
        _draw_polyline(draw, segment, map_x, map_y, "#d26a2e", 4)
        for theta, radius in segment:
            x, y = map_x(theta), map_y(radius)
            draw.rectangle((x - 4, y - 4, x + 4, y + 4), fill="#d26a2e")

    image_dense = resample_polyline(IMAGE_REFERENCE_XY_UM, 801)
    map_x, map_y = _draw_axes(
        draw, boxes[1], (0.0, 50.0), (0.0, 50.0), "x (um)", "y (um)"
    )
    _draw_polyline(draw, image_dense, map_x, map_y, "#2477c8", 6)
    _draw_polyline(draw, normalized_bend, map_x, map_y, "#d26a2e", 4)

    map_x, map_y = _draw_axes(
        draw, boxes[2], (0.0, 50.0), (0.0, 50.0), "x (um)", "y (um)"
    )
    _draw_polyline(draw, image_dense, map_x, map_y, "#2477c8", 6)
    _draw_polyline(draw, platform, map_x, map_y, "#d26a2e", 4)

    draw.line((680, 575, 716, 575), fill="#2477c8", width=6)
    draw.text((726, 575), "microscope-derived", anchor="lm", font=label_font, fill="#252a31")
    draw.line((895, 575, 931, 575), fill="#d26a2e", width=5)
    draw.text((941, 575), "plot-derived", anchor="lm", font=label_font, fill="#252a31")

    shape_text = (
        f"RMS nearest-curve variance: "
        f"{metrics_shape['symmetric_chamfer_rms_um']:.2f} um; "
        f"max: {metrics_shape['symmetric_hausdorff_um']:.2f} um"
    )
    platform_text = (
        f"With access arms: "
        f"{metrics_platform['symmetric_chamfer_rms_um']:.2f} um RMS; "
        f"{metrics_platform['symmetric_hausdorff_um']:.2f} um max"
    )
    draw.text((660, 610), shape_text, font=small_font, fill="#4c535d")
    draw.text((1240, 610), platform_text, font=small_font, fill="#4c535d")
    canvas.save(OUTPUT_COMPARISON)


def main() -> None:
    OUTPUT_SEED.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_COMPARISON.parent.mkdir(parents=True, exist_ok=True)
    segments = calibrated_plot_segments()
    dense_bend, dense_theta, dense_radius, dense_segment_ids = (
        reconstruct_centerline(segments)
    )
    digitized_bend = resample_polyline(dense_bend, 1201)
    calibrated_bend_dense = calibrated_physical_bend(dense_bend)
    calibrated_bend = resample_polyline(calibrated_bend_dense, 1201)
    normalized_bend = resample_polyline(
        isotropically_normalized_bend(calibrated_bend_dense), 1201
    )
    platform = platform_centerline(calibrated_bend_dense)

    shape_metrics = comparison_metrics(
        IMAGE_REFERENCE_XY_UM, normalized_bend
    )
    platform_metrics = comparison_metrics(IMAGE_REFERENCE_XY_UM, platform)

    marker_theta = np.concatenate([segment[:, 0] for segment in segments])
    marker_radius = np.concatenate([segment[:, 1] for segment in segments])
    marker_segment_ids = np.concatenate(
        [
            np.full(len(segment), index, dtype=np.int16)
            for index, segment in enumerate(segments)
        ]
    )

    digitized_endpoint = dense_bend[-1]
    digitized_equivalent_radius = 0.5 * float(np.sum(digitized_endpoint))
    endpoint = calibrated_bend_dense[-1]
    input_arm = PLATFORM_EXTENT_UM - float(endpoint[0])
    output_arm = PLATFORM_EXTENT_UM - float(endpoint[1])

    np.savez_compressed(
        OUTPUT_SEED,
        format_version=np.array(1, dtype=np.int16),
        source=np.array(
            "Supplementary Fig. S2(c), DOI 10.1016/j.optcom.2025.132032"
        ),
        source_design=np.array("optimized FFC, reported Req=45.5 um"),
        reconstruction_method=np.array(
            "digitized R(theta); piecewise-linear radius; theta integration; "
            "isotropic scale anchored to reported Req"
        ),
        waveguide_width_um=np.array(WAVEGUIDE_WIDTH_UM),
        platform_extent_um=np.array(PLATFORM_EXTENT_UM),
        reported_equivalent_radius_um=np.array(
            REPORTED_EQUIVALENT_RADIUS_UM
        ),
        digitized_equivalent_radius_um=np.array(
            digitized_equivalent_radius
        ),
        digitized_endpoint_xy_um=digitized_endpoint,
        calibrated_endpoint_xy_um=endpoint,
        digitized_to_reported_scale=np.array(
            REPORTED_EQUIVALENT_RADIUS_UM / digitized_equivalent_radius
        ),
        input_access_arm_um=np.array(input_arm),
        output_access_arm_um=np.array(output_arm),
        marker_theta_rad=marker_theta,
        marker_radius_um=marker_radius,
        marker_segment_ids=marker_segment_ids,
        dense_theta_rad=dense_theta,
        dense_radius_um=dense_radius,
        dense_segment_ids=dense_segment_ids,
        digitized_bend_centerline_xy_um=digitized_bend,
        bend_centerline_xy_um=calibrated_bend,
        normalized_bend_centerline_xy_um=normalized_bend,
        platform_centerline_xy_um=platform,
        image_reference_xy_um=IMAGE_REFERENCE_XY_UM,
        radius_digitization_uncertainty_um=np.array(0.5),
        theta_digitization_uncertainty_rad=np.array(
            0.5 * math.pi / (PLOT_X_RIGHT_PX - PLOT_X_LEFT_PX)
        ),
        shape_chamfer_rms_um=np.array(
            shape_metrics["symmetric_chamfer_rms_um"]
        ),
        shape_hausdorff_um=np.array(
            shape_metrics["symmetric_hausdorff_um"]
        ),
        platform_chamfer_rms_um=np.array(
            platform_metrics["symmetric_chamfer_rms_um"]
        ),
        platform_hausdorff_um=np.array(
            platform_metrics["symmetric_hausdorff_um"]
        ),
    )

    save_comparison_plot(
        segments,
        normalized_bend,
        platform,
        shape_metrics,
        platform_metrics,
    )

    report = {
        "seed_file": str(OUTPUT_SEED),
        "comparison_plot": str(OUTPUT_COMPARISON),
        "marker_count": int(len(marker_theta)),
        "segment_count": int(len(segments)),
        "digitized_endpoint_xy_um": digitized_endpoint.tolist(),
        "digitized_equivalent_radius_um": digitized_equivalent_radius,
        "reported_equivalent_radius_um": REPORTED_EQUIVALENT_RADIUS_UM,
        "calibrated_endpoint_xy_um": endpoint.tolist(),
        "digitized_to_reported_scale": (
            REPORTED_EQUIVALENT_RADIUS_UM / digitized_equivalent_radius
        ),
        "input_access_arm_um": input_arm,
        "output_access_arm_um": output_arm,
        "shape_only_metrics": shape_metrics,
        "platform_metrics": platform_metrics,
        "waveguide_width_um": WAVEGUIDE_WIDTH_UM,
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
