import math


DEFAULT_FOOTPRINT = 50e-6
DEFAULT_WG_TOP_WIDTH = 0.8e-6
DEFAULT_THICKNESS = 0.6e-6
DEFAULT_ETCH_DEPTH = 0.3e-6
DEFAULT_SIDEWALL_ANGLE = 70.0
DEFAULT_INPUT_ARM_LENGTH = 5e-6
DEFAULT_OUTPUT_ARM_LENGTH = 5e-6
DEFAULT_MESH = 50e-9
DEFAULT_WAVELENGTH = 1.55e-6


def sidewall_bottom_width(top_width=DEFAULT_WG_TOP_WIDTH, etch_depth=DEFAULT_ETCH_DEPTH, sidewall_angle=DEFAULT_SIDEWALL_ANGLE):
    return top_width + 2.0*etch_depth/math.tan(math.radians(sidewall_angle))


def sidewall_effective_width(top_width=DEFAULT_WG_TOP_WIDTH, etch_depth=DEFAULT_ETCH_DEPTH, sidewall_angle=DEFAULT_SIDEWALL_ANGLE):
    bottom_width = sidewall_bottom_width(top_width, etch_depth, sidewall_angle)
    return 0.5*(top_width + bottom_width)
