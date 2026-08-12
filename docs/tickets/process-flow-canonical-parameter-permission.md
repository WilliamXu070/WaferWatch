# Process Flow canonical parameter permission repair

## Symptom

After two dies move successfully to a new Process Flow stage, saving the shared parameter form fails once per die with `permission denied for table operation_run_parameter_records`.

## Expected behavior

One shared parameter submission atomically records both legacy movement-scoped rows and canonical operation-run evidence for every moved die. Direct authenticated writes to canonical evidence tables must remain denied.

## Diagnosis

`saveStepParameterRecordsBatch` calls `save_operation_parameter_records_batch`. That wrapper is `SECURITY INVOKER`, but it inserts into `operation_run_parameter_records` and `operation_run_notes` after migration `202607210003` revoked authenticated insert, update, and delete privileges on those tables. The validated legacy save succeeds inside the same transaction, then the first canonical insert is denied and the entire parameter transaction rolls back. The movement transaction is separate and remains committed.

A read-only production audit confirmed both moved dies reached the destination with current canonical run/member identity and neither current movement received a partial legacy or canonical parameter row.

## Plan

1. Redefine only `save_operation_parameter_records_batch` as a security-definer RPC with a fixed search path.
2. Preserve the existing inner authentication, account, role, project-edit, shape, and idempotency checks.
3. Before privileged canonical writes, validate that each event, run member, assignment, wafer, operation run, and destination step agree.
4. Keep direct table writes revoked and expose only RPC execution to authenticated users.
5. Add an authenticated two-die destination-parameter regression covering atomic save, canonical evidence, retry, unauthorized rejection, and direct-write rejection.
6. Run the full repository/workflow gates, apply the additive migration, deploy, and verify production health plus the original pending B4/A7 parameter form.

## Verification

- The current migration chain reproduces the authenticated permission failure before the repair.
- One shared two-die save creates two legacy rows and two canonical member records.
- Retrying the same payload creates no duplicates or revisions.
- Mismatched and unauthorized entries roll back without partial records.
- Direct authenticated inserts into canonical evidence tables remain denied.
- All 226 tests, typecheck, lint, production build, and workflow/database verifiers pass, including the exact two-item event-state regression from a clean checkout.
- Commit `a2ea3af` is on `main`; production migration `202608120002` is applied and the local/remote ledgers align.
- Vercel deployment `dpl_78pkyVYDty7CdAUsqQDciKhx3NWc` reached `READY`, and `/api/health` returned HTTP 200 with a healthy Supabase probe.
- A post-release read-only audit confirmed `ALPHA_7` and `BETA_4` remain queued at Inspection and their exact movement mutations have zero partial legacy or canonical parameter rows.
- No real parameter submission was made solely for verification; the operator can safely retry the existing shared form.

## Status

Resolved in production on 2026-08-12.
