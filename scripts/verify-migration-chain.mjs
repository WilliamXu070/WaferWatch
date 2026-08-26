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

const projectionIndexes = await db.query(`
  select indexname
  from pg_indexes
  where schemaname = 'public'
    and indexname in (
      'operation_run_members_effective_run_assignment_wafer_idx',
      'operation_run_links_child_created_idx',
      'operation_run_links_parent_created_idx'
    )
  order by indexname
`);
assert.deepEqual(projectionIndexes.rows, [
  { indexname: 'operation_run_links_child_created_idx' },
  { indexname: 'operation_run_links_parent_created_idx' },
  { indexname: 'operation_run_members_effective_run_assignment_wafer_idx' }
]);

const id = {
  actor: "50000000-0000-4000-8000-000000000001",
  project: "50000000-0000-4000-8000-000000000002",
  template: "50000000-0000-4000-8000-000000000003",
  step: "50000000-0000-4000-8000-000000000004",
  authenticatedStep: "50000000-0000-4000-8000-000000000058",
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
  publish: "50000000-0000-4000-8000-000000000018",
  correctionSource: "50000000-0000-4000-8000-000000000019",
  correctionMistaken: "50000000-0000-4000-8000-000000000020",
  correctionFirstTarget: "50000000-0000-4000-8000-000000000021",
  correctionRepeatTarget: "50000000-0000-4000-8000-000000000022",
  firstRouteWafer: "50000000-0000-4000-8000-000000000023",
  firstRouteAssignment: "50000000-0000-4000-8000-000000000024",
  firstRouteSourceExecution: "50000000-0000-4000-8000-000000000025",
  firstRouteMistakenExecution: "50000000-0000-4000-8000-000000000026",
  firstRouteTargetExecution: "50000000-0000-4000-8000-000000000027",
  firstRouteSubmit: "50000000-0000-4000-8000-000000000028",
  firstRouteDecision: "50000000-0000-4000-8000-000000000029",
  firstRouteMove: "50000000-0000-4000-8000-000000000030",
  firstRouteCorrection: "50000000-0000-4000-8000-000000000031",
  repeatRouteWafer: "50000000-0000-4000-8000-000000000032",
  repeatRouteAssignment: "50000000-0000-4000-8000-000000000033",
  repeatRouteSourceExecution: "50000000-0000-4000-8000-000000000034",
  repeatRouteMistakenExecution: "50000000-0000-4000-8000-000000000035",
  repeatRouteTargetExecution: "50000000-0000-4000-8000-000000000036",
  repeatRouteSubmit: "50000000-0000-4000-8000-000000000037",
  repeatRouteDecision: "50000000-0000-4000-8000-000000000038",
  repeatRouteMove: "50000000-0000-4000-8000-000000000039",
  repeatRouteCorrection: "50000000-0000-4000-8000-000000000040",
  repeatPriorRun: "50000000-0000-4000-8000-000000000041",
  repeatPriorMember: "50000000-0000-4000-8000-000000000042",
  repairWafer: "50000000-0000-4000-8000-000000000043",
  repairAssignment: "50000000-0000-4000-8000-000000000044",
  repairExecution: "50000000-0000-4000-8000-000000000045",
  repairEmptyRun: "50000000-0000-4000-8000-000000000046",
  repairEmptyMember: "50000000-0000-4000-8000-000000000047",
  repairCompletedRun: "50000000-0000-4000-8000-000000000048",
  repairCompletedMember: "50000000-0000-4000-8000-000000000049",
  repairAttempt: "50000000-0000-4000-8000-000000000050",
  repairAttemptMutation: "50000000-0000-4000-8000-000000000051",
  repairRouteEvent: "50000000-0000-4000-8000-000000000052",
  repairDecisionReference: "50000000-0000-4000-8000-000000000053",
  repairBatch: "50000000-0000-4000-8000-000000000054",
  legacyAutoRouteOriginal: "50000000-0000-4000-8000-000000000055",
  legacyAutoRouteCorrection: "50000000-0000-4000-8000-000000000056",
  legacyAutoDecisionReference: "50000000-0000-4000-8000-000000000057"
};

await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data)
  values ('${id.actor}', 'migration-check@example.com', '{"display_name":"Migration check"}');
`);
const newProfile = await db.query(`
  select role from public.profiles where id = '${id.actor}'
`);
assert.deepEqual(newProfile.rows, [{ role: "admin" }]);

await db.exec(`
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

await db.exec(`
  insert into public.process_steps (
    id, template_id, step_order, name, slug, process_area, node_type, canvas_x, canvas_y
  ) values (
    '${id.authenticatedStep}', '${id.template}', 2,
    'Authenticated step', 'authenticated-step', 'Verification', 'procedure', 320, 180
  );
`);
const authenticatedStepStage = await db.query(`
  select
    step.id as step_id,
    step.stage_id,
    stage.template_id,
    stage.slug,
    (select count(*)::integer from public.process_steps candidate
      where candidate.id = '${id.authenticatedStep}') as step_count,
    (select count(*)::integer from public.process_stages candidate
      where candidate.id = step.stage_id) as stage_count
  from public.process_steps step
  join public.process_stages stage on stage.id = step.stage_id
  where step.id = '${id.authenticatedStep}'
`);
assert.deepEqual(authenticatedStepStage.rows, [{
  step_id: id.authenticatedStep,
  stage_id: authenticatedStepStage.rows[0].stage_id,
  template_id: id.template,
  slug: "authenticated-step",
  step_count: 1,
  stage_count: 1
}]);

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
const hotBootstrapSamples = [];
let hotBootstrapPayload = null;
for (let sample = 0; sample < 20; sample += 1) {
  let startedAt = performance.now();
  await db.query(`select public.get_process_workspace_snapshot('${id.template}') as snapshot`);
  snapshotSamples.push(performance.now() - startedAt);
  startedAt = performance.now();
  await db.query(`select public.get_process_workspace_delta('${id.template}', ${deltaAfterRevision}) as delta`);
  deltaSamples.push(performance.now() - startedAt);
  startedAt = performance.now();
  const bootstrapResult = await db.query(`
    select public.get_process_hot_bootstrap(
      '${id.template}',
      date_trunc('week', now()),
      date_trunc('week', now()) + interval '7 days'
    ) as bootstrap
  `);
  hotBootstrapSamples.push(performance.now() - startedAt);
  hotBootstrapPayload = bootstrapResult.rows[0].bootstrap;
}
assert.equal(hotBootstrapPayload.templateId, id.template);
assert.equal(hotBootstrapPayload.processSummary.id, id.template);
assert.equal(hotBootstrapPayload.currentState.length, 500);
assert.ok(Array.isArray(hotBootstrapPayload.processDefinition.steps));
assert.ok(Array.isArray(hotBootstrapPayload.calendar));
console.log(`Snapshot/delta/hot-bootstrap samples complete (${p95(snapshotSamples).toFixed(2)}/${p95(deltaSamples).toFixed(2)}/${p95(hotBootstrapSamples).toFixed(2)} ms p95).`);
assert.ok(p95(snapshotSamples) <= 750, `Workspace snapshot p95 exceeded 750 ms: ${p95(snapshotSamples)}`);
assert.ok(p95(deltaSamples) <= 200, `Workspace delta p95 exceeded 200 ms: ${p95(deltaSamples)}`);
assert.ok(p95(hotBootstrapSamples) <= 750, `Hot bootstrap p95 exceeded 750 ms: ${p95(hotBootstrapSamples)}`);
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

// A correction destination is a redo only when that destination already has
// performed evidence. Its numeric process order is deliberately misleading in
// this fixture so the old comparison would fail both assertions.
await db.exec(`
  insert into public.process_steps (
    id, template_id, stage_id, step_order, stage_step_order,
    name, slug, process_area, required_reviewer_id
  )
  select fixture.id, '${id.template}', existing.stage_id, fixture.step_order, fixture.stage_step_order,
         fixture.name, fixture.slug, 'History verification', '${id.actor}'
  from public.process_steps existing
  cross join (values
    ('${id.correctionSource}'::uuid, 100, 101, 'Correction source', 'correction-source'),
    ('${id.correctionMistaken}'::uuid, 200, 102, 'Mistaken destination', 'mistaken-destination'),
    ('${id.correctionFirstTarget}'::uuid, 40, 103, 'First-time destination', 'first-time-destination'),
    ('${id.correctionRepeatTarget}'::uuid, 30, 104, 'Repeated destination', 'repeated-destination')
  ) fixture(id, step_order, stage_step_order, name, slug)
  where existing.id = '${id.step}';

  insert into public.wafers (id, project_id, wafer_code, status, metadata) values
    ('${id.firstRouteWafer}', '${id.project}', 'FIRST-ROUTE', 'queued', '{}'),
    ('${id.repeatRouteWafer}', '${id.project}', 'REPEAT-ROUTE', 'queued', '{}');
  alter table public.wafer_process_assignments
    disable trigger wafer_assignments_require_published_template;
  alter table public.wafer_process_assignments
    disable trigger wafer_assignments_checkpoint_transition;
  insert into public.wafer_process_assignments (
    id, wafer_id, template_id, assigned_by, status, current_step_id
  ) values
    ('${id.firstRouteAssignment}', '${id.firstRouteWafer}', '${id.template}', '${id.actor}', 'queued', '${id.correctionSource}'),
    ('${id.repeatRouteAssignment}', '${id.repeatRouteWafer}', '${id.template}', '${id.actor}', 'queued', '${id.correctionSource}');
  alter table public.wafer_process_assignments
    enable trigger wafer_assignments_checkpoint_transition;
  alter table public.wafer_process_assignments
    enable trigger wafer_assignments_require_published_template;
  alter table public.step_executions
    disable trigger step_executions_checkpoint_transition;
  insert into public.step_executions (
    id, assignment_id, wafer_id, process_step_id, status, queue_started_at, started_at, completed_at
  ) values
    ('${id.firstRouteSourceExecution}', '${id.firstRouteAssignment}', '${id.firstRouteWafer}', '${id.correctionSource}', 'queued', now(), null, null),
    ('${id.firstRouteMistakenExecution}', '${id.firstRouteAssignment}', '${id.firstRouteWafer}', '${id.correctionMistaken}', 'pending', null, null, null),
    ('${id.firstRouteTargetExecution}', '${id.firstRouteAssignment}', '${id.firstRouteWafer}', '${id.correctionFirstTarget}', 'pending', null, null, null),
    ('${id.repeatRouteSourceExecution}', '${id.repeatRouteAssignment}', '${id.repeatRouteWafer}', '${id.correctionSource}', 'queued', now(), null, null),
    ('${id.repeatRouteMistakenExecution}', '${id.repeatRouteAssignment}', '${id.repeatRouteWafer}', '${id.correctionMistaken}', 'pending', null, null, null),
    ('${id.repeatRouteTargetExecution}', '${id.repeatRouteAssignment}', '${id.repeatRouteWafer}', '${id.correctionRepeatTarget}', 'completed', null, '2026-07-01T10:00:00Z', '2026-07-01T10:30:00Z');
  alter table public.step_executions
    enable trigger step_executions_checkpoint_transition;
  insert into public.operation_runs (
    id, template_id, process_step_id, run_kind, status, started_at, completed_at, created_by
  ) values (
    '${id.repeatPriorRun}', '${id.template}', '${id.correctionRepeatTarget}',
    'normal', 'completed', '2026-07-01T10:00:00Z', '2026-07-01T10:30:00Z', '${id.actor}'
  );
  insert into public.operation_run_members (
    id, operation_run_id, assignment_id, wafer_id, status,
    started_at, completed_at, history_effective
  ) values (
    '${id.repeatPriorMember}', '${id.repeatPriorRun}', '${id.repeatRouteAssignment}',
    '${id.repeatRouteWafer}', 'completed', '2026-07-01T10:00:00Z',
    '2026-07-01T10:30:00Z', true
  );
  set app.actor_id = '${id.actor}';
  set app.role = 'authenticated';
  set role authenticated;
`);

const firstRouteAttempt = await db.query(`
  select id from public.submit_step_checkpoint($1, $2, 'first-time correction', '{}'::jsonb)
`, [id.firstRouteSourceExecution, id.firstRouteSubmit]);
await db.query(`select public.route_checkpoint_submission($1, $2, $3, $4, 'wrong first destination', '[]'::jsonb)`, [
  firstRouteAttempt.rows[0].id,
  id.correctionMistaken,
  id.firstRouteDecision,
  id.firstRouteMove
]);
await db.query(`select public.correct_checkpoint_route_assignment($1, $2, $3, 'use first-time destination')`, [
  id.firstRouteAssignment,
  id.correctionFirstTarget,
  id.firstRouteCorrection
]);

const repeatRouteAttempt = await db.query(`
  select id from public.submit_step_checkpoint($1, $2, 'repeat correction', '{}'::jsonb)
`, [id.repeatRouteSourceExecution, id.repeatRouteSubmit]);
await db.query(`select public.route_checkpoint_submission($1, $2, $3, $4, 'wrong repeat destination', '[]'::jsonb)`, [
  repeatRouteAttempt.rows[0].id,
  id.correctionMistaken,
  id.repeatRouteDecision,
  id.repeatRouteMove
]);
await db.query(`select public.correct_checkpoint_route_assignment($1, $2, $3, 'use performed destination')`, [
  id.repeatRouteAssignment,
  id.correctionRepeatTarget,
  id.repeatRouteCorrection
]);
await db.exec("reset role");

const correctedRouteEvidence = await db.query(`
  select
    first_event.metadata ->> 'route_decision' as first_route_decision,
    first_execution.status as first_target_status,
    repeat_event.metadata ->> 'route_decision' as repeat_route_decision,
    repeat_execution.status as repeat_target_status,
    prior_member.history_effective as repeat_source_preserved
  from public.process_events first_event
  join public.step_executions first_execution on first_execution.id = '${id.firstRouteTargetExecution}'
  join public.process_events repeat_event on repeat_event.client_mutation_id = '${id.repeatRouteCorrection}'
  join public.step_executions repeat_execution on repeat_execution.id = '${id.repeatRouteTargetExecution}'
  join public.operation_run_members prior_member on prior_member.id = '${id.repeatPriorMember}'
  where first_event.client_mutation_id = '${id.firstRouteCorrection}'
`);
assert.deepEqual(correctedRouteEvidence.rows, [{
  first_route_decision: "approved",
  first_target_status: "queued",
  repeat_route_decision: "redo",
  repeat_target_status: "redo_required",
  repeat_source_preserved: true
}]);

// Reapply the additive repair over an A1-shaped legacy fixture. The empty
// wrapper is suppressed, while attempt 1 and its process batch remain intact.
await db.exec(`
  insert into public.wafers (id, project_id, wafer_code, status, metadata)
  values ('${id.repairWafer}', '${id.project}', 'A1-REPAIR', 'in_progress', '{}');
  alter table public.wafer_process_assignments
    disable trigger wafer_assignments_require_published_template;
  alter table public.wafer_process_assignments
    disable trigger wafer_assignments_checkpoint_transition;
  insert into public.wafer_process_assignments (
    id, wafer_id, template_id, assigned_by, status, current_step_id
  ) values (
    '${id.repairAssignment}', '${id.repairWafer}', '${id.template}', '${id.actor}',
    'in_progress', '${id.correctionFirstTarget}'
  );
  alter table public.wafer_process_assignments
    enable trigger wafer_assignments_checkpoint_transition;
  alter table public.wafer_process_assignments
    enable trigger wafer_assignments_require_published_template;
  alter table public.step_executions
    disable trigger step_executions_checkpoint_transition;
  insert into public.step_executions (
    id, assignment_id, wafer_id, process_step_id, status, queue_started_at, started_at
  ) values (
    '${id.repairExecution}', '${id.repairAssignment}', '${id.repairWafer}',
    '${id.correctionFirstTarget}', 'redo_required', '2026-07-17T19:15:52Z', '2026-07-17T19:15:52Z'
  );
  alter table public.step_executions
    enable trigger step_executions_checkpoint_transition;
  insert into public.operation_runs (
    id, template_id, process_step_id, run_kind, status, started_at, completed_at, created_by
  ) values
    ('${id.repairEmptyRun}', '${id.template}', '${id.correctionFirstTarget}', 'normal', 'redo_required', '2026-07-17T19:15:52Z', null, '${id.actor}'),
    ('${id.repairCompletedRun}', '${id.template}', '${id.correctionFirstTarget}', 'redo', 'completed', '2026-07-17T19:15:52Z', '2026-08-14T15:56:26Z', '${id.actor}');
  insert into public.operation_run_members (
    id, operation_run_id, assignment_id, wafer_id, status, started_at, completed_at,
    legacy_step_execution_id, history_effective
  ) values
    ('${id.repairEmptyMember}', '${id.repairEmptyRun}', '${id.repairAssignment}', '${id.repairWafer}', 'redo_required', '2026-07-17T19:15:52Z', null, '${id.repairExecution}', true),
    ('${id.repairCompletedMember}', '${id.repairCompletedRun}', '${id.repairAssignment}', '${id.repairWafer}', 'completed', '2026-07-17T19:15:52Z', '2026-08-14T15:56:26Z', null, true);
  insert into public.process_batches (
    id, template_id, process_step_id, created_by, origin, note
  ) values (
    '${id.repairBatch}', '${id.template}', '${id.correctionFirstTarget}', '${id.actor}', 'arrival', 'Preserved EBL batch'
  );
  insert into public.process_batch_members (
    batch_id, assignment_id, wafer_id, process_step_id, step_execution_id
  ) values (
    '${id.repairBatch}', '${id.repairAssignment}', '${id.repairWafer}', '${id.correctionFirstTarget}', '${id.repairExecution}'
  );
  insert into public.process_step_attempts (
    id, assignment_id, wafer_id, template_id, process_step_id, step_execution_id,
    attempt_number, submitted_by, submitted_at, started_at_snapshot,
    submission_notes, evidence_snapshot, operation_run_member_id,
    submission_group_id, wafer_code_snapshot, template_name_snapshot,
    template_version_snapshot, process_step_name_snapshot, process_step_order_snapshot,
    reviewer_id_snapshot, reviewer_name_snapshot, submitted_by_name_snapshot,
    prior_step_status, client_mutation_id, created_at
  )
  select
    '${id.repairAttempt}', '${id.repairAssignment}', '${id.repairWafer}', '${id.template}',
    '${id.correctionFirstTarget}', '${id.repairExecution}', 1, submitted_by,
    '2026-08-14T15:56:12Z', '2026-07-17T19:15:52Z', 'Completed once',
    evidence_snapshot || jsonb_build_object('_waferwatch_batch_id', '${id.repairBatch}'),
    '${id.repairCompletedMember}', null,
    'A1-REPAIR', template_name_snapshot, template_version_snapshot,
    'First-time destination', 40, reviewer_id_snapshot, reviewer_name_snapshot,
    submitted_by_name_snapshot, 'running', '${id.repairAttemptMutation}', '2026-08-14T15:56:12Z'
  from public.process_step_attempts
  where id = '${firstRouteAttempt.rows[0].id}';
  insert into public.process_events (
    id, project_id, wafer_id, step_execution_id, actor_id, event_type,
    event_at, notes, metadata, client_mutation_id
  ) values (
    '${id.repairRouteEvent}', '${id.project}', '${id.repairWafer}', '${id.repairExecution}',
    '${id.actor}', 'checkpoint_step_entered', '2026-07-17T19:15:52Z',
    'Legacy false redo', jsonb_build_object(
      'assignment_id', '${id.repairAssignment}',
      'checkpoint_decision_id', '${id.repairDecisionReference}',
      'from_step_id', '${id.correctionSource}',
      'from_step_name', 'Correction source',
      'target_step_id', '${id.correctionFirstTarget}',
      'target_step_name', 'First-time destination',
      'corrected_event_id', '${id.repairExecution}',
      'movement_kind', 'checkpoint_route_correction',
      'route_decision', 'redo'
    ), '${id.repairRouteEvent}'
  );
`);
const redoEvidenceRepairMigration = await readFile(
  new URL("../supabase/migrations/202608140003_history_redo_evidence_repair.sql", import.meta.url),
  "utf8"
);
await db.exec(redoEvidenceRepairMigration);

const repairedLegacyHistory = await db.query(`
  select
    empty_member.history_effective as empty_member_effective,
    empty_member.history_suppression_reason as suppression_reason,
    completed_member.history_effective as completed_member_effective,
    attempt.attempt_number,
    attempt.batch_id,
    (select count(*)::integer from public.process_batch_members batch_member
      where batch_member.batch_id = '${id.repairBatch}') as batch_member_count,
    (select repair.metadata ->> 'route_decision'
      from public.process_events repair
      where repair.metadata ->> 'checkpoint_decision_id' = '${id.repairDecisionReference}'
      order by repair.event_at desc, repair.id desc limit 1) as effective_route_decision
  from public.operation_run_members empty_member
  join public.operation_run_members completed_member on completed_member.id = '${id.repairCompletedMember}'
  join public.process_step_attempts attempt on attempt.id = '${id.repairAttempt}'
  where empty_member.id = '${id.repairEmptyMember}'
`);
assert.equal(repairedLegacyHistory.rows.length, 1);
assert.equal(repairedLegacyHistory.rows[0].empty_member_effective, false);
assert.match(repairedLegacyHistory.rows[0].suppression_reason, /Superseded/i);
assert.equal(repairedLegacyHistory.rows[0].completed_member_effective, true);
assert.equal(repairedLegacyHistory.rows[0].attempt_number, 1);
assert.equal(repairedLegacyHistory.rows[0].batch_id, id.repairBatch);
assert.equal(repairedLegacyHistory.rows[0].batch_member_count, 1);
assert.equal(repairedLegacyHistory.rows[0].effective_route_decision, "approved");

// Older automatic corrections can also carry an approved label even though
// their destination had already been performed. The follow-up migration
// supersedes that label and stays rerunnable.
await db.exec(`
  alter table public.process_events
    disable trigger process_events_link_effective_history;
  insert into public.process_events (
    id, project_id, wafer_id, step_execution_id, actor_id, event_type,
    event_at, notes, metadata, client_mutation_id
  ) values
    (
      '${id.legacyAutoRouteOriginal}', '${id.project}', '${id.repeatRouteWafer}',
      '${id.repeatRouteTargetExecution}', '${id.actor}', 'checkpoint_step_entered',
      '2026-07-02T10:00:00Z', 'Legacy route', jsonb_build_object(
        'assignment_id', '${id.repeatRouteAssignment}',
        'checkpoint_decision_id', '${id.legacyAutoDecisionReference}',
        'from_step_id', '${id.correctionSource}',
        'from_step_name', 'Correction source',
        'target_step_id', '${id.correctionRepeatTarget}',
        'target_step_name', 'Repeated destination',
        'attempt_id', '${repeatRouteAttempt.rows[0].id}',
        'movement_kind', 'checkpoint_redo_route',
        'route_decision', 'redo'
      ), '${id.legacyAutoRouteOriginal}'
    ),
    (
      '${id.legacyAutoRouteCorrection}', '${id.project}', '${id.repeatRouteWafer}',
      '${id.repeatRouteTargetExecution}', '${id.actor}', 'checkpoint_step_entered',
      '2026-07-03T10:00:00Z', 'Legacy automatic correction', jsonb_build_object(
        'assignment_id', '${id.repeatRouteAssignment}',
        'checkpoint_decision_id', '${id.legacyAutoDecisionReference}',
        'from_step_id', '${id.correctionSource}',
        'from_step_name', 'Correction source',
        'target_step_id', '${id.correctionRepeatTarget}',
        'target_step_name', 'Repeated destination',
        'corrected_event_id', '${id.legacyAutoRouteOriginal}',
        'attempt_id', '${repeatRouteAttempt.rows[0].id}',
        'movement_kind', 'checkpoint_route_auto_redo_correction',
        'route_decision', 'approved'
      ), '${id.legacyAutoRouteCorrection}'
    );
  alter table public.process_events
    enable trigger process_events_link_effective_history;
`);
const routeEvidenceAlignmentMigration = await readFile(
  new URL("../supabase/migrations/202608140004_effective_route_evidence_alignment.sql", import.meta.url),
  "utf8"
);
await db.exec(routeEvidenceAlignmentMigration);
await db.exec(routeEvidenceAlignmentMigration);

const alignedLegacyAutoRoute = await db.query(`
  select
    event.step_execution_id,
    event.operation_run_id,
    event.operation_run_member_id,
    event.metadata ->> 'route_decision' as route_decision,
    event.metadata ->> 'corrected_event_id' as corrected_event_id,
    event.metadata ->> 'history_repair_version' as repair_version,
    (
      select count(*)::integer
      from public.process_events repair
      where repair.metadata ->> 'checkpoint_decision_id' = '${id.legacyAutoDecisionReference}'
        and repair.metadata ->> 'history_repair_version' = '202608140004'
    ) as repair_count
  from public.process_events event
  where event.metadata ->> 'checkpoint_decision_id' = '${id.legacyAutoDecisionReference}'
  order by event.event_at desc, event.id desc
  limit 1
`);
assert.deepEqual(alignedLegacyAutoRoute.rows, [{
  step_execution_id: null,
  operation_run_id: null,
  operation_run_member_id: null,
  route_decision: "redo",
  corrected_event_id: id.legacyAutoRouteCorrection,
  repair_version: "202608140004",
  repair_count: 1
}]);

const result = await db.query(`
  select
    to_regclass('public.process_plans') is not null as plans,
    to_regclass('public.operation_runs') is not null as runs,
    to_regclass('public.vw_process_current_state') is not null as current_state,
    to_regprocedure('public.get_process_workspace_delta(uuid,bigint)') is not null as delta_rpc,
    to_regprocedure('public.get_process_hot_bootstrap(uuid,timestamptz,timestamptz)') is not null as hot_bootstrap_rpc,
    to_regprocedure('public.execute_process_flow_mutations_batch_v2(uuid,bigint,uuid,jsonb)') is not null as batch_v2_rpc
`);
console.log(JSON.stringify({
  migrations: files.length,
  ...result.rows[0],
  operationRuns: "200-member atomic start, repeat, complete, and retry",
  mixedReview: "approved and rejected members split into successor and redo runs; draft unchanged",
  redoEvidence: "first-time destinations approve, performed destinations redo, legacy automatic labels align, and batches remain intact",
  planning: "independent edits, stale rejection, publish immutability",
  fixture: performanceRows.rows[0],
  performanceMs: {
    atomicRunP95: Number(p95(mutationSamples).toFixed(2)),
    snapshotP95: Number(p95(snapshotSamples).toFixed(2)),
    deltaP95: Number(p95(deltaSamples).toFixed(2)),
    hotBootstrapP95: Number(p95(hotBootstrapSamples).toFixed(2)),
    historyExplainAnalyze: true
  }
}, null, 2));
