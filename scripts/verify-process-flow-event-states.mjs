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

const repairMigration = "202608120001_process_flow_transition_identity.sql";
const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();

const id = {
  actor: "60000000-0000-4000-8000-000000000001",
  project: "60000000-0000-4000-8000-000000000002",
  template: "60000000-0000-4000-8000-000000000003",
  previousStep: "60000000-0000-4000-8000-000000000004",
  checkpointStep: "60000000-0000-4000-8000-000000000005",
  nextStep: "60000000-0000-4000-8000-000000000006",
  anytimeStep: "60000000-0000-4000-8000-000000000007"
};

const fixtureNames = [
  "queued",
  "running",
  "redo_required",
  "approved_move",
  "route_correction",
  "anytime_move",
  "pending",
  "blocked",
  "awaiting_checkpoint",
  "ready_to_move",
  "completed",
  "skipped",
  "failed"
];
const fixture = Object.fromEntries(fixtureNames.map((name, index) => {
  const suffix = String(index + 1).padStart(12, "0");
  return [name, {
    wafer: `61000000-0000-4000-8000-${suffix}`,
    assignment: `62000000-0000-4000-8000-${suffix}`,
    execution: `63000000-0000-4000-8000-${suffix}`,
    run: `64000000-0000-4000-8000-${suffix}`,
    member: `65000000-0000-4000-8000-${suffix}`
  }];
}));

let seededPreRepair = false;
let reproducedOriginalFailure = false;

async function setAuthenticated() {
  await db.exec(`
    select set_config('app.actor_id', '${id.actor}', false);
    select set_config('app.role', 'authenticated', false);
    set role authenticated;
  `);
}

async function resetRole() {
  await db.exec("reset role");
}

async function executeBatch(mutations) {
  return db.query(
    "select public.execute_process_flow_mutations_batch($1::jsonb) as result",
    [JSON.stringify(mutations)]
  );
}

async function seedPreRepairFixtures() {
  const waferValues = fixtureNames.map((name) => {
    const row = fixture[name];
    return `('${row.wafer}', '${id.project}', 'STATE-${name.toUpperCase()}', 'in_progress', '{}'::jsonb)`;
  }).join(",\n");
  const assignmentValues = fixtureNames.map((name) => {
    const row = fixture[name];
    return `('${row.assignment}', '${row.wafer}', '${id.template}', '${id.actor}', 'in_progress', '${id.checkpointStep}')`;
  }).join(",\n");
  const executionValues = fixtureNames.map((name) => {
    const row = fixture[name];
    return `('${row.execution}', '${row.assignment}', '${row.wafer}', '${id.checkpointStep}', 'queued', now(), '{}'::jsonb)`;
  }).join(",\n");
  const runValues = fixtureNames.map((name) => {
    const row = fixture[name];
    return `('${row.run}', '${id.template}', '${id.checkpointStep}', 'normal', 'queued', '${id.actor}')`;
  }).join(",\n");
  const memberValues = fixtureNames.map((name) => {
    const row = fixture[name];
    return `('${row.member}', '${row.run}', '${row.assignment}', '${row.wafer}', 'queued', '${row.execution}')`;
  }).join(",\n");

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data)
    values ('${id.actor}', 'process-flow-states@example.test', '{"display_name":"State verifier"}');
    update public.profiles set role = 'admin' where id = '${id.actor}';
    insert into public.projects (id, slug, name, owner_id)
    values ('${id.project}', 'process-flow-states', 'Process Flow states', '${id.actor}');
    insert into public.process_templates (id, owner_project_id, name, version, created_by)
    values ('${id.template}', '${id.project}', 'Process Flow states', '1.0', '${id.actor}');
    insert into public.process_steps (
      id, template_id, step_order, name, slug, process_area,
      execution_mode, required_reviewer_id
    ) values
      ('${id.previousStep}', '${id.template}', 10, 'Previous', 'previous', 'Test', 'main', null),
      ('${id.checkpointStep}', '${id.template}', 20, 'Checkpoint', 'checkpoint', 'Test', 'main', '${id.actor}'),
      ('${id.nextStep}', '${id.template}', 30, 'Next', 'next', 'Test', 'main', null),
      ('${id.anytimeStep}', '${id.template}', 40, 'Anytime', 'anytime', 'Test', 'anytime', null);
    insert into public.wafers (id, project_id, wafer_code, status, metadata) values
      ${waferValues};
    alter table public.wafer_process_assignments
      disable trigger wafer_assignments_require_published_template;
    insert into public.wafer_process_assignments (
      id, wafer_id, template_id, assigned_by, status, current_step_id
    ) values
      ${assignmentValues};
    alter table public.wafer_process_assignments
      enable trigger wafer_assignments_require_published_template;
    insert into public.step_executions (
      id, assignment_id, wafer_id, process_step_id, status, queue_started_at, metadata
    ) values
      ${executionValues};
    insert into public.operation_runs (
      id, template_id, process_step_id, run_kind, status, created_by
    ) values
      ${runValues};
    insert into public.operation_run_members (
      id, operation_run_id, assignment_id, wafer_id, status, legacy_step_execution_id
    ) values
      ${memberValues};
    ${fixtureNames.map((name) => `
      update public.wafer_process_assignments
      set current_operation_run_member_id = '${fixture[name].member}'
      where id = '${fixture[name].assignment}';
    `).join("\n")}
  `);
  seededPreRepair = true;

  await setAuthenticated();
  await assert.rejects(
    executeBatch([{
      kind: "submit",
      assignmentId: fixture.queued.assignment,
      stepExecutionId: fixture.queued.execution,
      mutationId: "66000000-0000-4000-8000-000000000001",
      batchId: "67000000-0000-4000-8000-000000000001",
      notes: "Original failure reproduction",
      evidence: {}
    }]),
    /canonical operation-run transition is invalid/i
  );
  reproducedOriginalFailure = true;
  await resetRole();
}

for (const file of files) {
  if (file === repairMigration) await seedPreRepairFixtures();
  try {
    const sql = (await readFile(new URL(file, migrationDirectory), "utf8"))
      .replace(/^create extension if not exists "pgcrypto";\s*$/m, "");
    await db.exec(sql);
  } catch (error) {
    throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

assert.equal(seededPreRepair, true);
assert.equal(reproducedOriginalFailure, true);

await setAuthenticated();

const identityBackfill = await db.query(`
  select count(*)::integer as matched
  from public.step_executions execution
  join public.operation_run_members member
    on member.legacy_step_execution_id = execution.id
  join public.wafer_process_assignments assignment
    on assignment.current_operation_run_member_id = member.id
  where assignment.template_id = '${id.template}'
    and execution.metadata ->> 'operation_run_id' = member.operation_run_id::text
`);
assert.equal(identityBackfill.rows[0].matched, fixtureNames.length);

const stateByName = {
  running: "running",
  redo_required: "redo_required",
  pending: "pending",
  blocked: "blocked",
  awaiting_checkpoint: "awaiting_checkpoint",
  ready_to_move: "ready_to_move",
  completed: "completed",
  skipped: "skipped",
  failed: "failed"
};
await resetRole();
await db.exec(`select set_config('waferwatch.canonical_workflow_mutation', 'on', false)`);
for (const [name, state] of Object.entries(stateByName)) {
  await db.query("update public.step_executions set status = $1::public.step_status where id = $2", [state, fixture[name].execution]);
  const canonicalState = state === "awaiting_checkpoint"
    ? "awaiting_review"
    : state === "ready_to_move"
      ? "completed"
      : state === "pending"
        ? "queued"
        : state;
  await db.query("update public.operation_run_members set status = $1 where id = $2", [canonicalState, fixture[name].member]);
  await db.query("update public.operation_runs set status = $1 where id = $2", [canonicalState === "skipped" ? "completed" : canonicalState, fixture[name].run]);
}
await db.exec(`select set_config('waferwatch.canonical_workflow_mutation', 'off', false)`);
await setAuthenticated();

const submitNames = ["queued", "running", "redo_required", "approved_move"];
const submitMutations = submitNames.map((name, index) => ({
  kind: "submit",
  assignmentId: fixture[name].assignment,
  stepExecutionId: fixture[name].execution,
  mutationId: `68000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  batchId: `68100000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  notes: `Submit ${name}`,
  evidence: { state: name }
}));
const submitResult = await executeBatch(submitMutations);
assert.equal(submitResult.rows[0].result.outcomes.length, submitNames.length);
const submittedState = await db.query(`
  select
    count(*) filter (where execution.status = 'awaiting_checkpoint')::integer as executions,
    count(*) filter (where member.status = 'awaiting_review')::integer as members,
    count(*) filter (where run.status = 'awaiting_review')::integer as runs,
    count(attempt.id)::integer as attempts
  from public.step_executions execution
  join public.operation_run_members member on member.legacy_step_execution_id = execution.id
  join public.operation_runs run on run.id = member.operation_run_id
  left join public.process_step_attempts attempt on attempt.operation_run_member_id = member.id
  where execution.id = any($1::uuid[])
`, [submitNames.map((name) => fixture[name].execution)]);
assert.deepEqual(submittedState.rows, [{ executions: 4, members: 4, runs: 4, attempts: 4 }]);

const attempts = await db.query(`
  select assignment_id, id
  from public.process_step_attempts
  where assignment_id = any($1::uuid[])
`, [submitNames.map((name) => fixture[name].assignment)]);
const attemptByAssignment = new Map(attempts.rows.map((row) => [row.assignment_id, row.id]));

const routeMutations = [
  { name: "queued", targetStepId: id.nextStep },
  { name: "running", targetStepId: id.checkpointStep },
  { name: "redo_required", targetStepId: id.nextStep }
].map(({ name, targetStepId }, index) => ({
  kind: "route",
  assignmentId: fixture[name].assignment,
  batchId: `69000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  attemptId: attemptByAssignment.get(fixture[name].assignment),
  targetStepId,
  decisionMutationId: `69100000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  movementMutationId: `69200000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  note: `Route ${name}`,
  childSpecs: []
}));
await executeBatch(routeMutations);
await executeBatch(routeMutations);

const routeState = await db.query(`
  select assignment.id, assignment.current_step_id,
         execution.status, member.operation_run_id,
         execution.metadata ->> 'operation_run_id' as metadata_run_id,
         run.run_kind
  from public.wafer_process_assignments assignment
  join public.operation_run_members member on member.id = assignment.current_operation_run_member_id
  join public.operation_runs run on run.id = member.operation_run_id
  join public.step_executions execution on execution.id = member.legacy_step_execution_id
  where assignment.id = any($1::uuid[])
`, [[fixture.queued.assignment, fixture.running.assignment, fixture.redo_required.assignment]]);
for (const row of routeState.rows) {
  assert.equal(row.metadata_run_id, row.operation_run_id);
}
assert.equal(routeState.rows.find((row) => row.id === fixture.queued.assignment).current_step_id, id.nextStep);
assert.equal(routeState.rows.find((row) => row.id === fixture.running.assignment).current_step_id, id.checkpointStep);
assert.equal(routeState.rows.find((row) => row.id === fixture.running.assignment).status, "redo_required");
assert.equal(routeState.rows.find((row) => row.id === fixture.running.assignment).run_kind, "redo");

await db.query(
  "select public.review_step_checkpoint($1, 'approved', $2, 'Approved for move', null)",
  [
    attemptByAssignment.get(fixture.approved_move.assignment),
    "69300000-0000-4000-8000-000000000001"
  ]
);
const approvedMoveMutation = {
  kind: "move",
  assignmentId: fixture.approved_move.assignment,
  sourceStepId: id.checkpointStep,
  targetStepId: id.nextStep,
  batchId: "69400000-0000-4000-8000-000000000001",
  mutationId: "69500000-0000-4000-8000-000000000001",
  note: "Move approved work",
  correctCheckpointRoute: false
};
await executeBatch([approvedMoveMutation]);
await executeBatch([approvedMoveMutation]);

const correctionMutation = {
  kind: "move",
  assignmentId: fixture.route_correction.assignment,
  sourceStepId: id.checkpointStep,
  targetStepId: id.nextStep,
  batchId: "69600000-0000-4000-8000-000000000001",
  mutationId: "69700000-0000-4000-8000-000000000001",
  note: "Correct checkpoint destination",
  correctCheckpointRoute: true
};
await executeBatch([correctionMutation]);
await executeBatch([correctionMutation]);

const anytimeMutation = {
  kind: "move",
  assignmentId: fixture.anytime_move.assignment,
  sourceStepId: id.checkpointStep,
  targetStepId: id.anytimeStep,
  batchId: "69800000-0000-4000-8000-000000000001",
  mutationId: "69900000-0000-4000-8000-000000000001",
  note: "Enter anytime work",
  correctCheckpointRoute: false
};
await executeBatch([anytimeMutation]);
await executeBatch([anytimeMutation]);

for (const name of ["approved_move", "route_correction", "anytime_move"]) {
  const current = await db.query(`
    select assignment.current_step_id, member.operation_run_id,
           execution.metadata ->> 'operation_run_id' as metadata_run_id
    from public.wafer_process_assignments assignment
    join public.operation_run_members member on member.id = assignment.current_operation_run_member_id
    join public.step_executions execution on execution.id = member.legacy_step_execution_id
    where assignment.id = $1
  `, [fixture[name].assignment]);
  assert.equal(current.rows[0].metadata_run_id, current.rows[0].operation_run_id);
}

const invalidSubmitStates = [
  "pending",
  "blocked",
  "awaiting_checkpoint",
  "ready_to_move",
  "completed",
  "skipped",
  "failed"
];
for (const [index, name] of invalidSubmitStates.entries()) {
  await assert.rejects(
    executeBatch([{
      kind: "submit",
      assignmentId: fixture[name].assignment,
      stepExecutionId: fixture[name].execution,
      mutationId: `6a000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      batchId: `6a100000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      notes: `Invalid ${name}`,
      evidence: {}
    }]),
    /Only active or redo-required work can be submitted/i
  );
}

const protectedExecution = await db.query(`
  select member.legacy_step_execution_id as id
  from public.wafer_process_assignments assignment
  join public.operation_run_members member on member.id = assignment.current_operation_run_member_id
  where assignment.id = $1
`, [fixture.approved_move.assignment]);
await assert.rejects(
  db.query("update public.step_executions set status = 'ready_to_move' where id = $1", [protectedExecution.rows[0].id]),
  /explicit checkpoint action/i
);

await db.exec(`select set_config('waferwatch.canonical_workflow_mutation', 'on', false)`);
await assert.rejects(
  db.query(`
    update public.step_executions
    set metadata = jsonb_set(metadata, '{operation_run_id}', '"not-a-uuid"'::jsonb)
    where id = $1
  `, [protectedExecution.rows[0].id]),
  /canonical operation-run transition is invalid/i
);
await db.exec(`select set_config('waferwatch.canonical_workflow_mutation', 'off', false)`);

await resetRole();
console.log(JSON.stringify({
  originalFailure: "reproduced before repair",
  identityBackfill: `${identityBackfill.rows[0].matched} current executions`,
  validSubmissions: ["queued", "running", "redo_required"],
  validRoutes: ["approved", "redo", "approved_move", "checkpoint_route_correction", "anytime_enter"],
  idempotentRetries: true,
  rejectedSubmitStates: invalidSubmitStates,
  directProtectedWrite: "rejected",
  malformedCanonicalIdentity: "rejected"
}, null, 2));
