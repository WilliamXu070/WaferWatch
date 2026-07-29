"""Minimal Python controller for the local Lumerical MODE/FDE model."""

from __future__ import annotations

import importlib
import math
import os
import re
import sys
from pathlib import Path

import numpy as np

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from configs import current_lnoi


TEMPLATE = Path(__file__).with_suffix(".lsf")
TOKEN = re.compile(r"__[A-Z0-9_]+__")

MESH_STEP_M = current_lnoi.DESIGN_MESH_M
X_SPAN_M = 8e-6
AIR_SPAN_M = 2e-6
SUBSTRATE_SPAN_M = 1e-6
STRUCTURE_Z_SPAN_M = 2e-6
PML_LAYERS = 12
TRIAL_MODES = 8


def _number(value: float | int) -> str:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"Non-finite LSF value: {value!r}")
    if number == 0.0:
        number = 0.0
    return str(value) if isinstance(value, int) else f"{number:.17g}"


def _quoted(value: str) -> str:
    if any(char in value for char in '"\r\n'):
        raise ValueError(f"Unsafe LSF string: {value!r}")
    return f'"{value}"'


def _column(values: tuple[float, float, float]) -> str:
    return "[" + ";".join(_number(value) for value in values) + "]"


def _tensor_u(angle_deg: float, direction: str) -> str:
    theta = math.radians(angle_deg)
    tangent = np.array([math.cos(theta), math.sin(theta), 0.0])
    vertical = np.array([0.0, 0.0, 1.0])
    radial = np.array([-math.sin(theta), math.cos(theta), 0.0])
    if direction == "reverse":
        tangent, radial = -tangent, -radial
    elif direction != "forward":
        raise ValueError("direction must be 'forward' or 'reverse'")
    matrix = np.vstack((radial, vertical, tangent)).T
    rows = [",".join(_number(value) for value in row) for row in matrix]
    return "[" + ";".join(rows) + "]"


def render_lsf(
    angle_deg: float,
    radius_um: float | None = None,
    direction: str = "forward",
) -> str:
    """Render one straight or bent cross-section solve."""
    if not 0.0 <= angle_deg <= 90.0:
        raise ValueError("angle_deg must lie in [0, 90]")
    if radius_um is not None and radius_um <= 0.0:
        raise ValueError("radius_um must be positive")

    bent = radius_um is not None
    y_min = -current_lnoi.BOX_THICKNESS_M - SUBSTRATE_SPAN_M
    y_max = current_lnoi.FILM_THICKNESS_M + AIR_SPAN_M
    boundary = "PML" if bent else "metal"
    replacements = {
        "__WAVELENGTH_M__": _number(current_lnoi.WAVELENGTH_M),
        "__FILM_THICKNESS_M__": _number(current_lnoi.FILM_THICKNESS_M),
        "__ETCH_DEPTH_M__": _number(current_lnoi.ETCH_DEPTH_M),
        "__WG_TOP_WIDTH_M__": _number(current_lnoi.WG_TOP_WIDTH_M),
        "__WG_BOTTOM_WIDTH_M__": _number(current_lnoi.waveguide_bottom_width_m()),
        "__BOX_THICKNESS_M__": _number(current_lnoi.BOX_THICKNESS_M),
        "__SUBSTRATE_THICKNESS_M__": _number(SUBSTRATE_SPAN_M),
        "__STRUCTURE_Z_SPAN_M__": _number(STRUCTURE_Z_SPAN_M),
        "__FDE_X_SPAN_M__": _number(X_SPAN_M),
        "__FDE_Y_MIN_M__": _number(y_min),
        "__FDE_Y_MAX_M__": _number(y_max),
        "__MESH_CELLS_X__": _number(math.ceil(X_SPAN_M / MESH_STEP_M)),
        "__MESH_CELLS_Y__": _number(math.ceil((y_max - y_min) / MESH_STEP_M)),
        "__PML_LAYERS__": _number(PML_LAYERS),
        "__TRIAL_MODES__": _number(TRIAL_MODES),
        "__X_MIN_BC__": _quoted(boundary),
        "__X_MAX_BC__": _quoted(boundary),
        "__Y_MIN_BC__": _quoted(boundary),
        "__Y_MAX_BC__": _quoted(boundary),
        "__BENT_ENABLED__": "1" if bent else "0",
        "__BEND_RADIUS_M__": _number(0.0 if radius_um is None else radius_um * 1e-6),
        "__BEND_ORIENTATION_DEG__": _number(180.0 if direction == "forward" else 0.0),
        "__PROPAGATION_ANGLE_DEG__": _number(angle_deg),
        "__DIRECTION_CODE__": "1" if direction == "forward" else "-1",
        "__LN_MATERIAL_NAME__": _quoted(f"{current_lnoi.LN_MATERIAL_NAME}_fde"),
        "__AIR_MATERIAL_NAME__": _quoted(f"{current_lnoi.UPPER_CLADDING}_fde"),
        "__TENSOR_ATTRIBUTE_NAME__": _quoted("ln_tensor_fde"),
        "__LN_SELLMEIER_A0__": _column(current_lnoi.LN_SELLMEIER_A0),
        "__LN_SELLMEIER_B1__": _column(current_lnoi.LN_SELLMEIER_B1),
        "__LN_SELLMEIER_C1__": _column(current_lnoi.LN_SELLMEIER_C1),
        "__LN_SELLMEIER_B2__": _column(current_lnoi.LN_SELLMEIER_B2),
        "__LN_SELLMEIER_C2__": _column(current_lnoi.LN_SELLMEIER_C2),
        "__LN_SELLMEIER_B3__": _column(current_lnoi.LN_SELLMEIER_B3),
        "__LN_SELLMEIER_C3__": _column(current_lnoi.LN_SELLMEIER_C3),
        "__TENSOR_U__": _tensor_u(angle_deg, direction),
        "__SUBSTRATE_MATERIAL_NAME__": _quoted(current_lnoi.SUBSTRATE_MATERIAL_NAME),
        "__BOX_MATERIAL_NAME__": _quoted(current_lnoi.BOX_MATERIAL_NAME),
    }
    text = TEMPLATE.read_text(encoding="utf-8")
    if set(TOKEN.findall(text)) != set(replacements):
        raise ValueError("LSF template tokens do not match the Python controller")
    for token, value in replacements.items():
        text = text.replace(token, value)
    return text


def open_mode(hide: bool = True):
    """Open MODE only when a live solve is requested."""
    api_path = os.environ.get("LUMERICAL_API_PATH")
    if api_path:
        sys.path.insert(0, api_path)
    return importlib.import_module("lumapi").MODE(hide=hide)


def build_point(mode, angle_deg: float, radius_um: float | None, direction: str):
    """Build and solve one FDE point; mode data remain in the live session."""
    mode.eval(render_lsf(angle_deg, radius_um, direction))
    return int(np.asarray(mode.getv("mode_count")).squeeze())
