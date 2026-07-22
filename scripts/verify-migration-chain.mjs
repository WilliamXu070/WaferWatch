import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('app.actor_id', true), '')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('app.role', true), ''), 'authenticated')
  $$;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null,
    owner uuid
  );
  alter table storage.objects enable row level security;

  create schema realtime;
  create table realtime.messages (id uuid primary key default gen_random_uuid());
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$ select ''::text $$;
  create function realtime.send(jsonb, text, text, boolean) returns void language sql as $$ select $$;
  create publication supabase_realtime;
`);

const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
for (const file of files) {
  try {
    const sql = (await readFile(new URL(file, migrationDirectory), "utf8"))
      .replace(/^create extension if not exists "pgcrypto";\s*$/m, "");
    await db.exec(sql);
  } catch (error) {
    throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

const id = {
  actor: "50000000-0000-4000-8000-000000000001",
  project: "50000000-0000-4000-8000-000000000002",
  template: "50000000-0000-4000-8000-000000000003",
  step: "50000000-0000-4000-8000-000000000004",
  startOne: "50000000-0000-4000-8000-000000000005",
  startTwo: "50000000-0000-4000-8000-000000000006",
  complete: "50000000-0000-4000-8000-000000000007",
  plan: "50000000-0000-4000-8000-000000000008",
  batchLogical: "50000000-0000-4000-8000-000000000009",
  batch: "50000000-0000-4000-8000-000000000010",
  operationLogicalOne: "50000000-0000-4000-8000-000000000011",
  operationLogicalTwo: "50000000-0000-4000-8000-000000000012",
  operationOne: "50000000-0000-4000-8000-000000000013",
  operationTwo: "50000000-0000-4000-8000-000000000014",
  updateOne: "50000000-0000-4000-8000-000000000015",
  updateTwo: "50000000-0000-4000-8000-000000000016",
  staleUpdate: "50000000-0000-4000-8000-000000000017",
  publish: "50000000-0000-4000-8000-000000000018"
};

await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data)
  values ('${id.actor}', 'migration-check@example.com', '{"display_name":"Migration check"}');
  update public.profiles set role = 'admin' where id = '${id.actor}';
  insert into public.projects (id, slug, name, owner_id)
  values ('${id.project}', 'migration-check', 'Migration check', '${id.actor}');
  insert into public.process_templates (id, owner_project_id, name, version, created_by)
  values ('${id.template}', '${id.project}', 'Migration check', '1.0', '${id.actor}');
  insert into public.process_steps (id, template_id, step_order, name, slug, process_area, required_reviewer_id)
  values ('${id.step}', '${id.template}', 1, 'Clean', 'clean', 'Cleaning', '${id.actor}');
  insert into public.wafers (id, project_id, wafer_code, status, metadata)
  select
    ('51000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
    '${id.project}',
    'W' || lpad(series::text, 3, '0'),
    'queued',
    jsonb_build_object('wafer_family', 'W')
  from generate_series(1, 200) series;
  insert into public.wafer_process_assignments (
    id, wafer_id, template_id, assigned_by, status, current_step_id
  )
  select
    ('52000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
    ('51000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
    '${id.template}',
    '${id.actor}',
    'queued',
    '${id.step}'
  from generate_series(1, 200) series;
  set app.actor_id = '${id.actor}';
  set app.role = 'authenticated';
  set role authenticated;
`);

const startRun = (mutationId) => db.query(`
  select public.start_operation_run(
    '${id.step}',
    null,
    (select array_agg(candidate.id order by candidate.id) from (
      select assignment.id from public.wafer_process_assignments assignment
      where assignment.template_id = '${id.template}' order by assignment.id limit 200
    ) candidate),
    (select jsonb_object_agg(candidate.id::text, candidate.revision) from (
      select assignment.id, assignment.revision from public.wafer_process_assignments assignment
      where assignment.template_id = '${id.template}' order by assignment.id limit 200
    ) candidate),
    'ad_hoc',
    array[]::uuid[],
    'Migration verifier',
    '${mutationId}'
  ) as result
`);

await startRun(id.startOne);
await startRun(id.startOne);
await startRun(id.startTwo);
const secondRun = await db.query(`
  select id, revision from public.operation_runs
  where client_mutation_id = '${id.startTwo}'
`);
const secondRunId = secondRun.rows[0].id;
await db.query(`
  select public.complete_operation_run(
    $1,
    $2,
    (
      select jsonb_agg(jsonb_build_object(
        'memberId', member.id,
        'expectedRevision', member.revision,
        'status', 'completed',
        'note', 'Complete'
      ) order by member.id)
      from public.operation_run_members member where member.operation_run_id = $1
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    $3
  ) as result
`, [secondRunId, secondRun.rows[0].revision, id.complete]);
await db.query(`
  select public.complete_operation_run(
    $1,
    1,
    (
      select jsonb_agg(jsonb_build_object(
        'memberId', member.id,
        'expectedRevision', member.revision,
        'status', 'completed',
        'note', 'Complete'
      ) order by member.id)
      from public.operation_run_members member where member.operation_run_id = $1
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    $2
  ) as result
`, [secondRunId, id.complete]);

const runCounts = await db.query(`
  select
    count(*)::integer as runs,
    (select count(*)::integer from public.operation_run_members) as members,
    (select count(*)::integer from public.process_events where client_mutation_id = '${id.complete}') as completion_events,
    (select count(*)::integer from public.workflow_change_log where template_id = '${id.template}') as revisions
  from public.operation_runs where template_id = '${id.template}'
`);
assert.deepEqual(runCounts.rows, [{ runs: 2, members: 400, completion_events: 1, revisions: 3 }]);

await db.query(`select public.create_process_plan($1, $2, $3, $4, $5)`, [
  id.project, id.template, "2026-07-21T08:00:00Z", "2026-07-24T18:00:00Z", id.plan
]);
const draft = await db.query(`
  select revision.* from public.process_plan_revisions revision
  join public.process_plans plan on plan.id = revision.plan_id
  where plan.project_id = '${id.project}' and plan.template_id = '${id.template}' and revision.status = 'draft'
`);
const draftId = draft.rows[0].id;
await db.query(`select public.create_planned_batch($1, $2, 'Batch 1', null, $3, $4)`, [
  draftId,
  id.batchLogical,
  ["52000000-0000-4000-8000-000000000001", "52000000-0000-4000-8000-000000000002"],
  id.batch
]);
const batch = await db.query(`select id from public.planned_batches where logical_id = '${id.batchLogical}'`);
const createOperation = (logicalId, start, end, mutationId) => db.query(`
  select public.create_planned_operation($1, $2, $3, $4, 'Clean', $5, $6, false, '[]'::jsonb, '[]'::jsonb, $7)
`, [draftId, logicalId, id.step, batch.rows[0].id, start, end, mutationId]);
await createOperation(id.operationLogicalOne, "2026-07-21T10:00:00Z", "2026-07-21T11:00:00Z", id.operationOne);
await createOperation(id.operationLogicalTwo, "2026-07-21T12:00:00Z", "2026-07-21T13:00:00Z", id.operationTwo);
const operations = await db.query(`select id, logical_id, row_version from public.planned_operations where revision_id = $1 order by logical_id`, [draftId]);
await db.query(`select public.update_planned_operation($1, $2, $3, $4)`, [
  operations.rows[0].id, operations.rows[0].row_version, { name: "Clean A" }, id.updateOne
]);
await db.query(`select public.update_planned_operation($1, $2, $3, $4)`, [
  operations.rows[1].id, operations.rows[1].row_version, { name: "Clean B" }, id.updateTwo
]);
const stale = await db.query(`select public.update_planned_operation($1, 1, $2, $3) as result`, [
  operations.rows[0].id, { name: "Stale" }, id.staleUpdate
]);
assert.equal(stale.rows[0].result.code, "stale");
const currentDraft = await db.query(`select row_version from public.process_plan_revisions where id = $1`, [draftId]);
await db.query(`select public.publish_process_plan($1, $2, $3)`, [draftId, currentDraft.rows[0].row_version, id.publish]);
await db.exec("reset role");
await assert.rejects(
  db.query(`update public.planned_operations set name = 'Illegal' where revision_id = $1`, [draftId]),
  /immutable/i
);

await db.exec(`
  insert into public.wafers (id, project_id, wafer_code, status, metadata)
  select
    ('51000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
    '${id.project}',
    'W' || lpad(series::text, 3, '0'),
    'queued',
    jsonb_build_object('wafer_family', 'W')
  from generate_series(201, 500) series;
  insert into public.wafer_process_assignments (
    id, wafer_id, template_id, assigned_by, status, current_step_id
  )
  select
    ('52000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
    ('51000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
    '${id.template}',
    '${id.actor}',
    'queued',
    '${id.step}'
  from generate_series(201, 500) series;
  insert into public.operation_runs (
    id, template_id, process_step_id, run_kind, status, started_at, completed_at, created_by
  )
  select
    ('53000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
    '${id.template}',
    '${id.step}',
    'normal',
    'completed',
    now() - ((49 - series) * interval '1 hour'),
    now() - ((49 - series) * interval '1 hour') + interval '30 minutes',
    '${id.actor}'
  from generate_series(1, 48) series;
  insert into public.operation_run_members (
    id, operation_run_id, assignment_id, wafer_id, status, started_at, completed_at
  )
  select
    ('54000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
    ('53000000-0000-4000-8000-' || lpad(ceil(series / 200.0)::integer::text, 12, '0'))::uuid,
    ('52000000-0000-4000-8000-' || lpad((((series - 1) % 200) + 1)::text, 12, '0'))::uuid,
    ('51000000-0000-4000-8000-' || lpad((((series - 1) % 200) + 1)::text, 12, '0'))::uuid,
    'completed',
    now() - ((49 - ceil(series / 200.0)::integer) * interval '1 hour'),
    now() - ((49 - ceil(series / 200.0)::integer) * interval '1 hour') + interval '30 minutes'
  from generate_series(1, 9600) series;
  analyze public.wafer_process_assignments;
  analyze public.operation_runs;
  analyze public.operation_run_members;
  analyze public.workflow_change_log;
`);

const performanceRows = await db.query(`
  select
    (select count(*)::integer from public.wafer_process_assignments where template_id = '${id.template}') as assignments,
    (select count(*)::integer from public.operation_run_members member
      join public.operation_runs run on run.id = member.operation_run_id
      where run.template_id = '${id.template}' and member.status = 'completed') as historical_members
`);
assert.deepEqual(performanceRows.rows, [{ assignments: 500, historical_members: 10000 }]);

const p95 = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
};
const mutationSamples = [];
await db.exec(`set app.actor_id = '${id.actor}'; set app.role = 'authenticated'; set role authenticated;`);
for (let sample = 1; sample <= 20; sample += 1) {
  const mutationId = `56000000-0000-4000-8000-${String(sample).padStart(12, "0")}`;
  const startedAt = performance.now();
  await startRun(mutationId);
  mutationSamples.push(performance.now() - startedAt);
}
await db.exec("reset role");
console.log(`Atomic-run samples complete (${p95(mutationSamples).toFixed(2)} ms p95).`);
const revisionBeforeDeltaFixture = await db.query(`
  select current_revision from public.workflow_revisions where template_id = '${id.template}'
`);
const deltaAfterRevision = revisionBeforeDeltaFixture.rows[0].current_revision;
await db.query(`
  select public.commit_workflow_change(
    '${id.template}',
    '57000000-0000-4000-8000-000000000001',
    'performance.delta',
    jsonb_build_object(
      'assignmentIds', (
        select jsonb_agg(candidate.id order by candidate.id)
        from (
          select assignment.id
          from public.wafer_process_assignments assignment
          where assignment.template_id = '${id.template}'
          order by assignment.id
          limit 100
        ) candidate
      )
    )
  )
`);

const snapshotSamples = [];
const deltaSamples = [];
for (let sample = 0; sample < 20; sample += 1) {
  let startedAt = performance.now();
  await db.query(`select public.get_process_workspace_snapshot('${id.template}') as snapshot`);
  snapshotSamples.push(performance.now() - startedAt);
  startedAt = performance.now();
  await db.query(`select public.get_process_workspace_delta('${id.template}', ${deltaAfterRevision}) as delta`);
  deltaSamples.push(performance.now() - startedAt);
}
console.log(`Snapshot/delta samples complete (${p95(snapshotSamples).toFixed(2)}/${p95(deltaSamples).toFixed(2)} ms p95).`);
assert.ok(p95(snapshotSamples) <= 750, `Workspace snapshot p95 exceeded 750 ms: ${p95(snapshotSamples)}`);
assert.ok(p95(deltaSamples) <= 200, `Workspace delta p95 exceeded 200 ms: ${p95(deltaSamples)}`);
assert.ok(p95(mutationSamples) <= 1500, `Atomic 200-member run p95 exceeded 1500 ms: ${p95(mutationSamples)}`);
const explain = await db.query(`
  explain (analyze, format json)
  select * from public.vw_operation_run_history history
  where history.template_id = '${id.template}'
  order by history.completed_at desc nulls last
  limit 100
`);
assert.equal(explain.rows.length, 1);
const planNodeTypes = [];
const collectPlanNodes = (node) => {
  if (!node || typeof node !== "object") return;
  if (typeof node["Node Type"] === "string") planNodeTypes.push(node["Node Type"]);
  if (Array.isArray(node.Plans)) node.Plans.forEach(collectPlanNodes);
};
const explainDocument = explain.rows[0]["QUERY PLAN"];
if (Array.isArray(explainDocument)) collectPlanNodes(explainDocument[0]?.Plan);
assert.ok(planNodeTypes.some((nodeType) => nodeType.includes("Index")), "History EXPLAIN ANALYZE did not use an index.");
console.log(`History EXPLAIN ANALYZE complete (${Array.from(new Set(planNodeTypes)).join(", ")}).`);

// PGlite does not ship pgcrypto; preserve the deterministic UUID contract for
// the checkpoint review fixture with PostgreSQL's built-in md5 function.
await db.exec(`
  create or replace function public.derived_mutation_uuid(mutation_id uuid, entity_id uuid, purpose text)
  returns uuid language sql immutable set search_path = public as $$
    select (
      substr(md5(mutation_id::text || ':' || entity_id::text || ':' || purpose), 1, 8) || '-' ||
      substr(md5(mutation_id::text || ':' || entity_id::text || ':' || purpose), 9, 4) || '-' ||
      '4' || substr(md5(mutation_id::text || ':' || entity_id::text || ':' || purpose), 14, 3) || '-' ||
      'a' || substr(md5(mutation_id::text || ':' || entity_id::text || ':' || purpose), 18, 3) || '-' ||
      substr(md5(mutation_id::text || ':' || entity_id::text || ':' || purpose), 21, 12)
    )::uuid
  $$;
  set app.actor_id = '${id.actor}';
  set app.role = 'authenticated';
  set role authenticated;
`);
const reviewOperation = await db.query(`
  select operation.id, operation.row_version
  from public.planned_operations operation
  join public.process_plans plan on plan.shared_draft_revision_id = operation.revision_id
  where plan.project_id = '${id.project}'
    and plan.template_id = '${id.template}'
    and operation.logical_id = '${id.operationLogicalOne}'
`);
const reviewStart = await db.query(`
  select public.start_operation_run(
    '${id.step}',
    $1,
    (select array_agg(candidate.id order by candidate.id) from (
      select assignment.id from public.wafer_process_assignments assignment
      where assignment.template_id = '${id.template}' order by assignment.id limit 2
    ) candidate),
    (select jsonb_object_agg(candidate.id::text, candidate.revision) from (
      select assignment.id, assignment.revision from public.wafer_process_assignments assignment
      where assignment.template_id = '${id.template}' order by assignment.id limit 2
    ) candidate),
    'normal',
    array[]::uuid[],
    null,
    '58000000-0000-4000-8000-000000000001'
  ) as result
`, [reviewOperation.rows[0].id]);
const reviewRunId = reviewStart.rows[0].result.run.id;
await db.query(`
  select public.complete_operation_run(
    $1,
    1,
    (select jsonb_agg(jsonb_build_object(
      'memberId', member.id,
      'expectedRevision', member.revision,
      'status', 'completed'
    ) order by member.assignment_id) from public.operation_run_members member where member.operation_run_id = $1),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '58000000-0000-4000-8000-000000000002'
  )
`, [reviewRunId]);
const completedReviewRun = await db.query(`select revision from public.operation_runs where id = $1`, [reviewRunId]);
await db.query(`select public.submit_operation_run($1, $2, '58000000-0000-4000-8000-000000000003')`, [
  reviewRunId,
  completedReviewRun.rows[0].revision
]);
const submittedMembers = await db.query(`
  select id, revision from public.operation_run_members where operation_run_id = $1 order by assignment_id
`, [reviewRunId]);
await db.query(`select public.review_operation_run_members($1, $2, $3, $4)`, [
  reviewRunId,
  [
    { memberId: submittedMembers.rows[0].id, decision: "approved", targetStepId: null, childSpecs: [] },
    { memberId: submittedMembers.rows[1].id, decision: "redo", targetStepId: id.step, note: "Repeat cleaning", childSpecs: [] }
  ],
  Object.fromEntries(submittedMembers.rows.map((member) => [member.id, member.revision])),
  "58000000-0000-4000-8000-000000000004"
]);
await db.exec("reset role");
const mixedReview = await db.query(`
  select
    (select status from public.operation_runs where id = $1) as source_status,
    (select count(*)::integer from public.operation_run_members where operation_run_id = $1 and status = 'completed') as approved_members,
    (select count(*)::integer from public.operation_run_members where operation_run_id = $1 and status = 'rejected') as rejected_members,
    (select count(*)::integer from public.operation_run_links where parent_run_id = $1 and link_kind = 'successor') as successor_runs,
    (select count(*)::integer from public.operation_run_links where parent_run_id = $1 and link_kind = 'redo') as redo_runs,
    (select count(*)::integer from public.plan_replan_requests where source_run_id = $1 and request_kind = 'redo') as replan_requests,
    (select row_version from public.planned_operations where id = $2) as plan_row_version
`, [reviewRunId, reviewOperation.rows[0].id]);
assert.deepEqual(mixedReview.rows, [{
  source_status: "redo_required",
  approved_members: 1,
  rejected_members: 1,
  successor_runs: 1,
  redo_runs: 1,
  replan_requests: 1,
  plan_row_version: reviewOperation.rows[0].row_version
}]);

const result = await db.query(`
  select
    to_regclass('public.process_plans') is not null as plans,
    to_regclass('public.operation_runs') is not null as runs,
    to_regclass('public.vw_process_current_state') is not null as current_state,
    to_regprocedure('public.get_process_workspace_delta(uuid,bigint)') is not null as delta_rpc
`);
console.log(JSON.stringify({
  migrations: files.length,
  ...result.rows[0],
  operationRuns: "200-member atomic start, repeat, complete, and retry",
  mixedReview: "approved and rejected members split into successor and redo runs; draft unchanged",
  planning: "independent edits, stale rejection, publish immutability",
  fixture: performanceRows.rows[0],
  performanceMs: {
    atomicRunP95: Number(p95(mutationSamples).toFixed(2)),
    snapshotP95: Number(p95(snapshotSamples).toFixed(2)),
    deltaP95: Number(p95(deltaSamples).toFixed(2)),
    historyExplainAnalyze: true
  }
}, null, 2));
