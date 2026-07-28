# Single-File FDB-MFA Bend Optimizer

Run:

```bash
python3 fdb_mfa_single.py
```

This writes:

- `single_script_outputs/result.json`
- `single_script_outputs/centerline.csv`
- `single_script_outputs/rib_polygon.csv`

The script implements the paper's segment-by-segment FDB-MFA optimization loop:

1. Start from `R_T0 = 10000 um`.
2. Optimize one generalized Euler segment at a time.
3. Use bisection on terminal radius `R_Ti`.
4. Use a cheap coarse-to-fine scan over lateral displacement `dr`.
5. Accept a segment when both thresholds pass:
   - mode mismatch loss `< ML`
   - radiation loss `< RL`
6. Optimize from both ports.
7. Connect both optimized sides with a final generalized Euler segment.

Right now `DRY_RUN = True`, so losses are placeholders. When Lumerical is installed, set `DRY_RUN = False` and replace the two methods in `Evaluator`:

- `mode_mismatch_loss_db_per_m(...)`
- `radiation_loss_db_per_m(...)`

Everything else is the optimization procedure.
