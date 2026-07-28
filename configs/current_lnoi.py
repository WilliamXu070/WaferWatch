"""Current fabrication platform and active bend-design settings.

All lengths are stored in SI units.  This module describes William's current
platform; the dimensions from the reference papers are intentionally not used.
"""

from __future__ import annotations

import math


WAVELENGTH_M = 1550e-9

FILM_THICKNESS_M = 0.6e-6
ETCH_DEPTH_M = 0.3e-6
WG_TOP_WIDTH_M = 0.8e-6
SIDEWALL_ANGLE_DEG = 70.0
BOX_THICKNESS_M = 4.7e-6
UPPER_CLADDING = "Air_Custom"

WG_LENGTH_M = 5e-6
RADIUS_M = 50e-6
OUTPUT_X_M = 50e-6
DESIGN_MESH_M = 20e-9


def waveguide_bottom_width_m() -> float:
    """Return the etched ridge bottom width implied by the sidewall angle."""
    return WG_TOP_WIDTH_M + 2.0 * ETCH_DEPTH_M / math.tan(
        math.radians(SIDEWALL_ANGLE_DEG)
    )


def lsf_replacements(
    *,
    radius_m: float = RADIUS_M,
    output_x_m: float = OUTPUT_X_M,
) -> dict[str, str]:
    """Return placeholder substitutions used by the active FDTD base script."""
    bottom_width = waveguide_bottom_width_m()
    effective_width = 0.5 * (WG_TOP_WIDTH_M + bottom_width)
    values = {
        "__WAVELENGTH__": WAVELENGTH_M,
        "__RADIUS__": radius_m,
        "__OUTPUT_X__": output_x_m,
        "__WG_LENGTH__": WG_LENGTH_M,
        "__WG_TOP_WIDTH__": WG_TOP_WIDTH_M,
        "__WG_WIDTH__": WG_TOP_WIDTH_M,
        "__WG_BOTTOM_WIDTH__": bottom_width,
        "__WG_EFFECTIVE_WIDTH__": effective_width,
        "__THICKNESS__": FILM_THICKNESS_M,
        "__ETCH_DEPTH__": ETCH_DEPTH_M,
        "__ANGLE__": SIDEWALL_ANGLE_DEG,
        "__MESH__": DESIGN_MESH_M,
        "__BOX__": BOX_THICKNESS_M,
    }
    return {token: f"{float(value):.16g}" for token, value in values.items()}
