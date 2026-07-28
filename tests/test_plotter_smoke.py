import argparse
import inspect
import tempfile
import sys
import traceback

# -----------------------------------------------------------------------------
# Paths
# -----------------------------------------------------------------------------
LUMERICAL_PY_API = r"C:\\Program Files\\ANSYS Inc\\v251\\Lumerical\\api\\python"
if LUMERICAL_PY_API and LUMERICAL_PY_API not in sys.path:
    sys.path.insert(0, LUMERICAL_PY_API)


def _report_attrs(obj, label):
    try:
        keys = sorted(obj.__dict__.keys())
    except Exception as exc:
        print(f"{label} __dict__ unavailable: {type(exc).__name__}: {exc}")
        return []
    print(f"{label} attrs: {keys}")
    return keys


def _describe_instance(obj, label):
    print(f"\n{label}: type={type(obj)}")
    attr_keys = _report_attrs(obj, f"{label}")
    missing = [name for name in ("fname_format_str", "_frame_sink", "setup", "finish", "grab_frame") if not hasattr(obj, name)]
    if missing:
        print(f"{label} missing expected attributes: {missing}")
    return attr_keys


def _try_call(label, fn):
    try:
        fn()
        print(f"{label}: OK")
        return True
    except Exception:
        print(f"{label}: FAILED")
        traceback.print_exc(limit=3)
        return False


def _attempt_construct(cls, candidates, label):
    last_error = None
    for tag, ctor in candidates:
        try:
            obj = ctor()
            print(f"{label}: constructed using: {tag}")
            return obj
        except Exception as exc:
            last_error = exc
            print(f"{label}: constructor {tag} failed with {type(exc).__name__}: {exc}")
    if last_error is not None:
        print(f"{label}: all constructor variants failed. Last error was {type(last_error).__name__}: {last_error}")
    return None


def _inspect_class_signatures(plotter):
    sig_plotter = None
    sig_snapshots = None
    sig_plotter = inspect.signature(plotter.Plotter.__init__) if hasattr(plotter, "Plotter") else None
    sig_snapshots = inspect.signature(plotter.SnapShots.__init__)
    if sig_plotter is not None:
        print("plotter.Plotter.__init__:", sig_plotter)
    print("plotter.SnapShots.__init__:", sig_snapshots)


def smoke_test_plotter():
    from lumopt.utilities import plotter
    import matplotlib
    import matplotlib.pyplot as plt
    from matplotlib.animation import FileMovieWriter

    print("\n=== Plotter smoke test (real optimization path) ===")
    print("LumOpt module loaded from:", inspect.getsourcefile(plotter))
    print("matplotlib version:", matplotlib.__version__)
    print("FileMovieWriter has _frame_sink:", hasattr(FileMovieWriter, "_frame_sink"))
    print("LumOpt plotter class:", plotter.SnapShots)
    print("Has _frame_sink attr on class:", hasattr(plotter.SnapShots, "_frame_sink"))

    src = inspect.getsource(plotter.SnapShots.grab_frame)
    print("grab_frame uses _frame_sink:", "_frame_sink" in src)
    src2 = inspect.getsource(plotter.SnapShots.finish)
    print("finish uses _frame_sink:", "_frame_sink" in src2)

    if "_frame_sink" not in src or "_frame_sink" not in src2:
        print("ERROR: _frame_sink contract in SnapShots methods is missing; this test cannot validate the legacy path.")
        return False

    _inspect_class_signatures(plotter)

    if not hasattr(plotter, "Plotter"):
        print("ERROR: plotter.Plotter missing.")
        return False

    PlotterClass = plotter.Plotter
    fig = plt.figure(figsize=(4, 3))
    tempdir = tempfile.mkdtemp(prefix="lumopt_plotter_smoke_")
    plotter_obj = None

    try:
        candidates = [
            ("working_dir/figure/title/monitor", lambda: PlotterClass(working_dir=tempdir, figure=fig, title="plotter_smoke", monitor=None)),
            ("fig/working_dir/title", lambda: PlotterClass(fig=fig, working_dir=tempdir, title="plotter_smoke")),
            ("positional (fig, working_dir)", lambda: PlotterClass(fig, working_dir=tempdir, title="plotter_smoke")),
            ("default constructor", lambda: PlotterClass()),
        ]
        plotter_obj = _attempt_construct(PlotterClass, candidates, "PlotterClass")
        if plotter_obj is None:
            print("ERROR: unable to instantiate plotter.Plotter with known signatures.")
            return False

        print("Instantiated plotter object.")
        _describe_instance(plotter_obj, "Plotter object")

        if not hasattr(plotter_obj, "writer"):
            print("ERROR: instantiated plotter has no writer attribute; cannot run real draw/save path.")
            return False
        writer = plotter_obj.writer
        print("Writer selected.")
        writer_attrs = _describe_instance(writer, "Writer")

        if not hasattr(writer, "fname_format_str"):
            print("FAIL-DETAIL: writer lacks fname_format_str before draw_and_save call.")
            print("Likely cause: SnapShots/Plotter init path did not initialize base writer state.")
            print("Try printing required constructor arguments in this environment's lumopt version.")
            if "frame_size" in writer_attrs:
                print("Hint: frame_size exists; writer init may be partially complete.")

        if not hasattr(plotter_obj, "draw_and_save"):
            print("ERROR: plotter.Plotter has no draw_and_save() method.")
            return False

        if not _try_call("Plotter.draw_and_save()", plotter_obj.draw_and_save):
            if hasattr(writer, "__dict__"):
                print("Writer attrs at failure:")
                _report_attrs(writer, "Writer")
            if hasattr(writer, "fname_format_str"):
                print("writer.fname_format_str:", getattr(writer, "fname_format_str"))
            else:
                print("writer.fname_format_str is still missing. This is the actionable failure.")
            return False

        if hasattr(plotter_obj, "writer") and hasattr(plotter_obj.writer, "_frame_sink"):
            print("Writer has _frame_sink after draw_and_save:", type(plotter_obj.writer._frame_sink))

        print("Plotter object class:", type(plotter_obj))
        print("Writer class:", type(plotter_obj.writer))
        print("Writer has _frame_sink:", hasattr(plotter_obj.writer, "_frame_sink"))
        return True
    except Exception as exc:
        print("Real plotter smoke test crashed:", type(exc).__name__, exc)
        traceback.print_exc(limit=3)
        if plotter_obj is not None:
            _describe_instance(plotter_obj, "Plotter object (post-failure)")
            if hasattr(plotter_obj, "writer"):
                _describe_instance(plotter_obj.writer, "Writer (post-failure)")
        return False
    finally:
        plt.close(fig)


def smoke_test_plotter_standalone_snapshots():
    from lumopt.utilities import plotter
    import matplotlib
    import matplotlib.pyplot as plt
    import matplotlib.animation as anim

    print("\n=== Standalone SnapShots smoke test (direct writer object path) ===")
    print("matplotlib version:", matplotlib.__version__)
    print("FileMovieWriter has _frame_sink:", hasattr(anim.FileMovieWriter, "_frame_sink"))

    fig = plt.figure(figsize=(4, 3))
    snap = None
    try:
        print("SnapShots.__init__ signature:", inspect.signature(plotter.SnapShots.__init__))
        candidates = [
            ("with fig positional", lambda: plotter.SnapShots(fig)),
            ("default", lambda: plotter.SnapShots()),
        ]
        snap = _attempt_construct(plotter.SnapShots, candidates, "SnapShots")
        if snap is None:
            return False

        _describe_instance(snap, "SnapShots instance")
        if not hasattr(snap, "fname_format_str") and not hasattr(snap, "_frame_sink"):
            print("FAIL-DETAIL: writer-like init markers are absent on SnapShots instance.")
            print("This matches your observed traceback and usually means the object is not in an initialized MovieWriter state.")

        def _draw_finish():
            fig.canvas.draw()
            snap.grab_frame()
            snap.finish()

        if not _try_call("SnapShots.grab_frame() + finish()", _draw_finish):
            _describe_instance(snap, "SnapShots instance (failure)")
            print("FileMovieWriter _frame_sink:", hasattr(anim.FileMovieWriter, "_frame_sink"))
            return False

        print("Standalone SnapShots.grab_frame() and finish() call: OK")
        return True
    except Exception as exc:
        print("Standalone SnapShots smoke test FAILED:", type(exc).__name__, exc)
        traceback.print_exc(limit=3)
        if snap is not None:
            _describe_instance(snap, "SnapShots instance (top-level failure)")
        return False
    finally:
        plt.close(fig)


def smoke_test_optimizer_callback():
    from lumopt.optimizers.generic_optimizers import ScipyOptimizers

    print("\n=== Optimizer callback smoke test ===")
    opt = ScipyOptimizers(
        max_iter=2,
        method="L-BFGS-B",
        scaling_factor=1.0e6,
        pgtol=1.0e-8,
        ftol=1.0e-8,
        scale_initial_gradient_to=0.0,
    )
    cb = getattr(opt, "callback", None)
    if cb is None:
        print("Optimizer callback: None")
        return False
    print("Optimizer callback: callable", callable(cb))
    try:
        cb([0.0])
        print("Direct callback call: OK")
    except Exception as exc:
        print("Direct callback call FAILED:", type(exc).__name__, exc)
        traceback.print_exc(limit=3)
        return False
    print("Optimizer callback smoke test: PASS")
    return True


def main():
    ap = argparse.ArgumentParser(description="LumOpt plotter compatibility smoke test")
    ap.add_argument("--check-optimizer", action="store_true", help="also run optimizer callback smoke test")
    args = ap.parse_args()

    print("Python:", sys.executable)
    print("Python version:", sys.version)

    ok_plot = smoke_test_plotter()
    ok_snap = smoke_test_plotter_standalone_snapshots()
    ok_opt = True
    if args.check_optimizer:
        ok_opt = smoke_test_optimizer_callback()

    if ok_plot and ok_snap and ok_opt:
        print("\nSUMMARY: PASS")
        return 0
    print("\nSUMMARY: FAIL")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
