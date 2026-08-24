# Canonical workflow golden flows

This harness is intentionally separate from the unit and PGlite verifiers. It creates isolated staging projects through a service-role client, performs the named behavior through the real authenticated UI, and checks the canonical workspace projection before and after reload.

## Safety contract

- `GOLDEN_FLOW_ENV=staging` is mandatory.
- `GOLDEN_STAGING_PROJECT_REF` must match `NEXT_PUBLIC_SUPABASE_URL`.
- `GOLDEN_PRODUCTION_PROJECT_REF`, when provided, must differ from the staging ref.
- Operator and reviewer storage states must be different signed-in users.
- No route or test endpoint is added to the application. Backend access exists only in this local runner.
- Every created project contains the run owner id and is torn down after the suite. Set `GOLDEN_KEEP_FIXTURES=1` only while diagnosing a failure.

Required environment:

```text
GOLDEN_FLOW_ENV=staging
GOLDEN_STAGING_PROJECT_REF=...
GOLDEN_PRODUCTION_PROJECT_REF=...
GOLDEN_BASE_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GOLDEN_OPERATOR_STORAGE_STATE=/absolute/path/operator.json
GOLDEN_REVIEWER_STORAGE_STATE=/absolute/path/reviewer.json
```

Run the app against staging, then execute `npm run golden:ui`. Failures retain a Playwright trace, screenshot, video, command/revision log, and normalized before/after workspace snapshots under `golden-flows/artifacts`.

The suite owns these flows:

1. Calendar create, move, and delete.
2. Process step creation and visual transition creation.
3. Atomic wafer creation.
4. Operator submit followed by reviewer routing in separate browser sessions.
5. Multi-wafer batch movement.
6. Redo with distinct append-only history.
7. Archive with active removal and preserved history.
8. A non-mutating 390x844 reachability and overflow replay for the Calendar editor and Process Flow step dialog.

Backend command invariants run without staging through `npm run workflow-commands:verify`. The combined local blocking gate is `npm run workflow:verify:fast`.
