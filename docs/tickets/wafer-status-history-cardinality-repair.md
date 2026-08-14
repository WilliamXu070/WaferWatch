# Wafer Status history cardinality repair

## Symptom

- B1 renders the same Spin Coating operation member twice while Chromium Deposition appears once.
- The duplicate rows make undo/reapproval evidence look like repeated fabrication work.
- Historical redo labels must remain attached to distinct redo destination visits without leaking shared batch lineage to other dies.

## Expected behavior

- Every effective `operation_run_member` produces exactly one Status history visit.
- Multiple decisions, undo events, and corrections remain append-only evidence attached to that visit.
- A redo remains a distinct linked destination member; its completed source visit remains visible.
- Shared operation runs and batch memberships remain unchanged.

## Diagnosis

The production-wide audit found 18 active die assignments with 127 effective operation members. `vw_operation_run_history` returns 128 effective rows because its top-level join from the latest attempt to `checkpoint_decisions` expands B1's one Spin Coating member once per approval decision. B1 has one attempt with two approvals: the first route was undone and the later approval is effective. No second Spin Coating member exists.

The application also accepts repeated view rows and repeated checkpoint JSON objects without normalizing their immutable IDs. This turns a projection-cardinality mistake into duplicated visits. Current operation-member pointers, explicit redo members, operation-run links, and batch memberships are internally consistent and must not be rewritten.

## Plan

1. Add a new migration that makes the latest-decision and withdrawal joins lateral single-row selections, preserving the existing JSON evidence arrays and correction events.
2. Defensively normalize view rows by operation-member ID and checkpoint evidence by attempt, decision, and withdrawal ID before building Status history.
3. Keep `run_kind = 'redo'`, operation-run links, and batch members authoritative and unchanged.
4. Add exact B1 regression coverage for one member with two decisions, plus A1/A2 redo and corrected-route cases.
5. Extend database verification to require one projected row per effective operation member even when an attempt has multiple decisions.
6. Re-audit every active die, run all workflow gates, and replay signed-in desktop and 390x844 Status before release.

## Verification

- Production read-only audit: 18 active die assignments, 127 effective operation members, 128 projected rows before repair, and exactly one duplicated member (B1 Spin Coating).
- B1 source evidence: one Spin Coating member and one attempt with two append-only approvals; no second Spin Coating run exists.
- A1/A2 audit: A1 retains its explicit redo members; A2 has no redo member; all active assignment pointers and shared batch memberships are internally consistent.
- `npm test`: 266 tests passed, including the exact B1 repeated-decision regression.
- `npm run typecheck`, `npm run lint`, and `npm run build`: passed.
- All required checkpoint, Process Flow, batch, archive, collaboration, researcher, planning, operation-run, workspace-projection, scheduler, migration-chain, history-correction, history-recovery, and dashboard-history verifiers passed.
- The 63-migration chain passed on 500 assignments and 10,000 historical members; the repeated-decision fixture projected one history row while retaining two checkpoint evidence rows.
- Production migration `202608140002_canonical_history_cardinality.sql` applied successfully.
- Post-migration production audit: 127 projected rows for 127 distinct effective members across all 18 active die assignments, with no duplicate member IDs and no invalid current-member pointers.
- Signed-in desktop replay: B1 shows one Chromium Deposition and one Spin Coating; A1 retains its explicit Spin Coating, EBL, and PL2 redo visits; A2 has no redo markers.
- Signed-in iPhone replay with a 390x844 viewport override: B1 has one of every displayed step, the horizontal history strip remains swipeable, the document has no horizontal overflow, and the fixed bottom navigation does not overlap the main history surface.
- Exact clean-commit production deployment `dpl_sN627ing4iPTdeBqU8jocK2JSZah` reached READY at `https://wafer-watch.vercel.app`; unrelated primary-checkout changes were excluded.
- Production `/api/health`: HTTP 200 with a healthy live Supabase probe.

## Rollback and risk

The database change replaces only a security-invoker view with the same column contract. It does not update checkpoint evidence, operation runs, operation members, links, assignments, or batch membership. The application normalization is idempotent and keyed by immutable IDs.

## Status

Resolved in production by commit `fb1944f`. GitHub issue creation was unavailable because the configured `gh` credential is invalid, so this local ticket retains the diagnosis and evidence.
