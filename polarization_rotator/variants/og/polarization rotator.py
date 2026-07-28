import os,sys
print(sys.executable)
print(sys.executable)
sys.path.insert(0, r"C:\\Program Files\\ANSYS Inc\\v251\\Lumerical\\api\\python")
print(sys.executable)
import numpy as np
import scipy as sp

import lumapi
from lumopt import CONFIG
from lumopt.utilities.load_lumerical_scripts import load_from_lsf
from lumopt.utilities.wavelengths import Wavelengths
from lumopt.geometries.polygon import FunctionDefinedPolygon
from lumopt.utilities.materials import Material
from lumopt.figures_of_merit.modematch import ModeMatch
from lumopt.optimizers.generic_optimizers import ScipyOptimizers
from lumopt.optimization import Optimization
from lumopt.optimization import SuperOptimization
from lumopt.geometries.parameterized_geometry import ParameterizedGeometry



######## BASE SIMULATION ########
#polarization_rotator_base = load_from_lsf('polarization rotator.lsf')
import os

cur_path = os.path.dirname(os.path.abspath(__file__))



WG_length=5e-6
WG_width=0.6e-6
Thickness=0.6e-6
mesh=20e-9
etch_depth=0.3e-6
Length=100e-6
Width=15e-6
In_width=2e-6
Second_length=100e-6
Sep=4e-6
T_length=30e-6
Sidewall_angle_deg=70.0
polarization_rotator_base = load_from_lsf(
    os.path.join(cur_path, 'polarization rotator.lsf')
)

polarization_rotator_base_TE1 = load_from_lsf(
    os.path.join(cur_path, 'polarization rotator_TE1.lsf')
)

def _fmt_lsf_value(value):
    if isinstance(value, (int, float, np.integer, np.floating)):
        return '%.16g' % float(value)
    return str(value)


def _build_runtime_lsf(template):
    values = {
        "__WG_length__": _fmt_lsf_value(WG_length),
        "__WG_width__": _fmt_lsf_value(WG_width),
        "__Length__": _fmt_lsf_value(Length),
        "__Width__": _fmt_lsf_value(Width),
        "__WG_WIDTH__": _fmt_lsf_value(WG_width),
        "__In_width__": _fmt_lsf_value(In_width),
        "__Second_length__": _fmt_lsf_value(Second_length),
        "__THICKNESS__": _fmt_lsf_value(Thickness),
        "__ETCH_DEPTH__": _fmt_lsf_value(etch_depth),
        "__Sidewall_angle_deg__": _fmt_lsf_value(Sidewall_angle_deg),
        "__MESH__": _fmt_lsf_value(mesh),
        "__Sep__": _fmt_lsf_value(Sep),
        "__T_length__": _fmt_lsf_value(T_length),
    }

    for token, value in values.items():
        template = template.replace(token, value)
    return template


polarization_rotator_base = _build_runtime_lsf(polarization_rotator_base)
polarization_rotator_base_TE1 = _build_runtime_lsf(polarization_rotator_base_TE1)
######## DIRECTORY FOR GDS EXPORT #########
example_directory = os.getcwd()

######## SPECTRAL RANGE #########
wavelengths = Wavelengths(start = 1550e-9, stop = 1550e-9, points = 1)

######################parameters#################

N=5
N2=4
######## OPTIMIZABLE GEOMETRY ########
# Define the span and number of points
reference_x_start = 0.0
reference_x_end = Length
initial_points_x = np.linspace(reference_x_start, reference_x_end, N)
initial_points_x2 = np.linspace(reference_x_end - T_length, reference_x_end, N2)

                                 
def polarization_rotator(params):
    ''' Defines a taper where the paramaters are the y coordinates of the nodes of a cubic spline. '''

    upper_y = params[0:N]
    lower_y = params[N:(N + N2)]
    upper_y2 = params[(N + N2):(N + 2 * N2)]
    lower_y2 = params[(N + 2 * N2):(2 * N + 2 * N2)]
    ## Include two set points based on the initial guess. The should attach the optimizeable geometry to the input and output 
    points_x = initial_points_x
    points_x2 = initial_points_x2
    #points_y = np.concatenate(([(WG_width + In_width)/2], params, [(WG_width )/2 + Sep/2]))
    points_y_upper = upper_y
    points_y_lower = lower_y
    points_y_upper2 = upper_y2
    points_y_lower2 = lower_y2

    ## Up sample the polygon points for a smoother curve. Some care should be taken with interp1d object. Higher degree fit
    # "cubic", and "quadratic" can vary outside of the footprint of the optimization. The parameters are bounded, but the
    # interpolation points are not. This can be particularly problematic around the set points.
    n_interpolation_points = 100
    polygon_points_x = np.linspace(min(points_x), max(points_x), n_interpolation_points)
    polygon_points_x2 = np.linspace(min(points_x2), max(points_x2), n_interpolation_points)
    interpolator_upper = sp.interpolate.interp1d(points_x, points_y_upper, kind = 'cubic')
    interpolator_lower = sp.interpolate.interp1d(points_x2, points_y_lower, kind = 'cubic')
    interpolator_upper2 = sp.interpolate.interp1d(points_x2, points_y_upper2, kind = 'cubic')
    interpolator_lower2 = sp.interpolate.interp1d(points_x, points_y_lower2, kind = 'cubic')

    polygon_points_y_upper = interpolator_upper(polygon_points_x)
    polygon_points_y_lower = interpolator_lower(polygon_points_x2)
    polygon_points_y_upper2 = interpolator_upper2(polygon_points_x2)
    polygon_points_y_lower2 = interpolator_lower2(polygon_points_x)

    ### Zip coordinates into a list of tuples, reflect and reorder. Need to be passed ordered in a CCW sense 
    polygon_points_up = [(x, y) for x, y in zip(polygon_points_x, polygon_points_y_upper)]
    polygon_points_down = [(x, y) for x, y in zip(polygon_points_x2, polygon_points_y_lower)]
    polygon_points_up2 = [(x, y) for x, y in zip(polygon_points_x2, polygon_points_y_upper2)]
    polygon_points_down2 = [(x, y) for x, y in zip(polygon_points_x, polygon_points_y_lower2)]


    polygon_points = np.array(polygon_points_up + polygon_points_down[::-1] + polygon_points_up2 + polygon_points_down2[::-1])
    
    return polygon_points


OPT_BUILDER_NAME = "optimized_core"
OPT_LAYER_NAME = "MMI-core"
OPT_GDS_LAYER = "1:0"
Device_length=2*WG_length+Length+Second_length
ref_x= Device_length / 2
ref_y= 0
ref_xspan=Device_length
ref_yspan=50e-6



def _lumerical_scalar(value):
    """Convert a lumapi scalar/matrix return value into a Python float."""
    return float(np.asarray(value).ravel()[0])


def sidewall_layerbuilder(params, fdtd, only_update):
    
    fdtd.switchtolayout()
    points_global= polarization_rotator(params)
    points_local = np.array(points_global, dtype=float)
    exists = False
    try:
        exists = int(_lumerical_scalar(fdtd.getnamednumber(OPT_BUILDER_NAME))) > 0
    except Exception:
        exists = False

    if (not only_update) or (not exists):
        fdtd.eval(f"""
if (getnamednumber('{OPT_BUILDER_NAME}') > 0) {{
  select('{OPT_BUILDER_NAME}');
  delete;
}}
addlayerbuilder;
set('name', '{OPT_BUILDER_NAME}');
set('x', {ref_x:.16g});
set('y', {ref_y:.16g});
set('z', 0);
set('x span', {ref_xspan:.16g});
set('y span', {ref_yspan:.16g});
set('gds position reference', 1);
set('base mesh order', 1);



addlayer('{OPT_LAYER_NAME}');
setlayer('{OPT_LAYER_NAME}', 'layer number', '1:0');
setlayer('{OPT_LAYER_NAME}', 'start position', {Thickness - etch_depth:.16g});
setlayer('{OPT_LAYER_NAME}', 'thickness', {etch_depth:.16g});
setlayer('{OPT_LAYER_NAME}', 'process', 'grow');
setlayer('{OPT_LAYER_NAME}', 'pattern material', 'Lithium Niobate');
set('gds sidewall angle position reference', 'Top');
setlayer('{OPT_LAYER_NAME}', 'sidewall angle', {Sidewall_angle_deg:.16g});
""")

    fdtd.putv('optimized_core_vertices', points_local)
    fdtd.eval(f"""
select('{OPT_BUILDER_NAME}');
set('geometry', {{'1:0':{{optimized_core_vertices}}}});
""")

    


upper_init = np.linspace((WG_width + In_width)/2, (WG_width )/2 + Sep/2, N)
lower_init = np.linspace(0, -(WG_width )/2 + Sep/2, N2)
upper2_init = np.linspace(0, (WG_width )/2 - Sep/2, N2)
lower2_init = np.linspace( -(WG_width + In_width)/2, -(WG_width )/2 - Sep/2, N)

initial_params = np.concatenate([upper_init , lower_init , upper2_init , lower2_init])
    
bounds_upper = [(-3e-6, 3e-6)] * 2 * (initial_points_x.size + initial_points_x2.size)


bounds = bounds_upper

def runSim(initial_params, bounds, fsp_file, fsp_file2):
    

    # Set device and cladding materials, as well as as device layer thickness
    eps_in = Material(name = 'Lithium Niobate', mesh_order = 2)
    eps_out = Material(name = 'SiO2 (Glass) - Palik', mesh_order = 3)

    depth=0.3e-6
    # Initialize FunctionDefinedPolygon class
    #polygon = FunctionDefinedPolygon(func = polarization_rotator,
     #                               initial_params = initial_params,
     #                               bounds = bounds,
     #                               z = Thickness - etch_depth/2,
     #                               depth = depth,
     #                               eps_out = eps_out,
     #                               eps_in = eps_in,
     #                               dx = 1.0e-9)

    polygon = ParameterizedGeometry(
        func=sidewall_layerbuilder,
        initial_params=initial_params,
        bounds=bounds,
     #   # Parameters are dimensionless in [-1, 1], so 1e-9 is too tiny for CAD
        # finite-difference d_eps. 1e-3 gives a visible but still small perturbation.
        dx=1.0e-3,
    )

    ######## FIGURE OF MERIT ########

    fom_up =  ModeMatch(monitor_name = 'fom_up',
                    mode_number = 'fundamental TE mode',
                    direction = 'Forward',
                    target_T_fwd = lambda wl: np.ones(wl.size),
                    norm_p = 1)
                    
    
                    
    fom_down2 =  ModeMatch(monitor_name = 'fom_down2',
                    mode_number = 'fundamental TE mode',
                    direction = 'Forward',
                    target_T_fwd = lambda wl: np.ones(wl.size),
                    norm_p = 1)


    ######## OPTIMIZATION ALGORITHM ########
    scaling_factor = 1.0e6
    scipy_optimizer1 = ScipyOptimizers(max_iter = 40,
                                    method = 'L-BFGS-B',
                                    scaling_factor = scaling_factor,
                                    pgtol = 1.0e-8,
                                    ftol = 1.0e-8,
                                    scale_initial_gradient_to = 0.0)
    
    scipy_optimizer4 = ScipyOptimizers(max_iter = 40,
                                    method = 'L-BFGS-B',
                                    scaling_factor = scaling_factor,
                                    pgtol = 1.0e-8,
                                    ftol = 1.0e-8,
                                    scale_initial_gradient_to = 0.0)
    
  

    ######## PUT EVERYTHING TOGETHER ########


    opt_up = Optimization(base_script = fsp_file,
                    wavelengths = wavelengths,
                    fom = fom_up,
                    geometry = polygon,
                    optimizer = scipy_optimizer1,
                    use_var_fdtd = False,
                    hide_fdtd_cad = False,
                    use_deps = True,
                    plot_history = True,
                    store_all_simulations = False)
    
    
    
    
    
    opt_down2 = Optimization(base_script = fsp_file2,
                    wavelengths = wavelengths,
                    fom = fom_down2,
                    geometry = polygon,
                    optimizer = scipy_optimizer4,
                    use_var_fdtd = False,
                    hide_fdtd_cad = False,
                    use_deps = True,
                    plot_history = True,
                    store_all_simulations = False)
    ######## RUN THE OPTIMIZER ########
    
    optT = [opt_up, opt_down2]
    weights = [1, 1]
    opt = SuperOptimization(optimizations = optT, weights = weights)
    
    #optT = opt_up + opt_down2
    results = opt.run()
    return results


runSim(initial_params = initial_params, bounds = bounds, fsp_file = polarization_rotator_base, fsp_file2 = polarization_rotator_base_TE1)
######## EXPORT OPTIMIZED STRUCTURE TO GDS ########

