import sys
import os
import numpy as np
import scipy as sp

sys.path.insert(0, r"C:\Program Files\ANSYS Inc\v251\Lumerical\api\python")
sys.path.insert(0, r"C:\Users\PIC\Desktop\WeDaBest\LumOpt")

from lumopt.utilities.wavelengths import Wavelengths
from lumopt.geometries.polygon import FunctionDefinedPolygon
from lumopt.figures_of_merit.modematch import ModeMatch
from lumopt.optimizers.generic_optimizers import ScipyOptimizers
from lumopt.optimization import Optimization


# ---------- PARAMETERS ----------
R = 25e-6                 # bend radius
W = 1.83e-6               # waveguide width
H = 1.0e-6                # waveguide thickness
n_bg = 1.44               # SiO2
n_ln = 2.20               # scalar LN approximation for optimization

wavelengths = Wavelengths(start=1550e-9, stop=1550e-9, points=1)

base_script = os.path.join(os.path.dirname(__file__), "base.lsf")
if not os.path.exists(base_script):
    base_script = os.path.join(os.path.dirname(__file__), "base.gds")


# ---------- OPTIMIZABLE 90 DEGREE BEND ----------
num_params = 8
theta_ctrl = np.linspace(-np.pi / 2, 0, num_params + 2)[1:-1]

initial_params = R * np.ones(num_params)
bounds = [(R - 4e-6, R + 4e-6)] * num_params


def bend_polygon(params=initial_params):
    """Return CCW polygon points for a variable-radius 90-degree bend."""
    theta_all = np.concatenate(([-np.pi / 2], theta_ctrl, [0]))
    r_all = np.concatenate(([R], params, [R]))

    interp = sp.interpolate.interp1d(theta_all, r_all, kind="cubic")

    theta = np.linspace(-np.pi / 2, 0, 160)
    r = interp(theta)

    r_outer = r + W / 2
    r_inner = r - W / 2

    # Circle center is at (0, R)
    outer = np.column_stack((r_outer * np.cos(theta),
                             R + r_outer * np.sin(theta)))

    inner = np.column_stack((r_inner * np.cos(theta[::-1]),
                             R + r_inner * np.sin(theta[::-1])))

    points = np.vstack((outer, inner))

    # force counter-clockwise orientation
    x = points[:, 0]
    y = points[:, 1]
    area = 0.5 * np.sum(x * np.roll(y, -1) - y * np.roll(x, -1))
    if area < 0:
        points = points[::-1]

    return points


geometry = FunctionDefinedPolygon(
    func=bend_polygon,
    initial_params=initial_params,
    bounds=bounds,
    z=0.5e-6,
    depth=H,
    eps_out=n_bg ** 2,
    eps_in=n_ln ** 2,
    edge_precision=5,
    dx=1e-9
)


# ---------- FIGURE OF MERIT ----------
fom = ModeMatch(
    monitor_name="fom",
    mode_number=1,
    direction="Forward",
    multi_freq_src=False,
    target_T_fwd=lambda wl: np.ones(wl.size),
    norm_p=1
)


# ---------- OPTIMIZER ----------
optimizer = ScipyOptimizers(
    max_iter=40,
    method="L-BFGS-B",
    scaling_factor=1e6,
    pgtol=1e-9
)


# ---------- RUN ----------
opt = Optimization(
    base_script=base_script,
    wavelengths=wavelengths,
    fom=fom,
    geometry=geometry,
    optimizer=optimizer,
    use_var_fdtd=True,
    hide_fdtd_cad=False,
    use_deps=True
)

opt.init_plotter()
opt.plotter.movie = False
opt.run()
