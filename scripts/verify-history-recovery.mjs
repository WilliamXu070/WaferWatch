import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const recoveryMigration = "202607230001_recover_effective_operation_history.sql";
const db = new PGlite({ extensions: { pgcrypto } });

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
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const recoveryIndex = migrationFiles.indexOf(recoveryMigration);
assert.notEqual(recoveryIndex, -1, "Recovery migration is missing");

for (const file of migrationFiles.slice(0, recoveryIndex)) {
  const sql = await readFile(new URL(file, migrationDirectory), "utf8");
  await db.exec(sql);
}

const id = {
  actor: "66000000-0000-4000-8000-000000000001",
  project: "66000000-0000-4000-8000-000000000002",
  template: "66000000-0000-4000-8000-000000000003",
  wafer: "66000000-0000-4000-8000-000000000004",
  assignment: "66000000-0000-4000-8000-000000000005",
  eblStep: "66000000-0000-4000-8000-000000000006",
  pl2Step: "66000000-0000-4000-8000-000000000007",
  polingStep: "66000000-0000-4000-8000-000000000008",
  inspectionStep: "66000000-0000-4000-8000-000000000009",
  eblExecution: "66000000-0000-4000-8000-000000000010",
  pl2Execution: "66000000-0000-4000-8000-000000000011",
  polingExecution: "66000000-0000-4000-8000-000000000012",
  inspectionExecution: "66000000-0000-4000-8000-000000000013",
  eblRun: "66000000-0000-4000-8000-000000000014",
  pl2Run: "66000000-0000-4000-8000-000000000015",
  polingRun: "66000000-0000-4000-8000-000000000016",
  eblMember: "66000000-0000-4000-8000-000000000017",
  pl2Member: "66000000-0000-4000-8000-000000000018",
  polingMember: "66000000-0000-4000-8000-000000000019",
  pl2AttemptOne: "66000000-0000-4000-8000-000000000020",
  pl2AttemptTwo: "66000000-0000-4000-8000-000000000021",
  polingAttempt: "66000000-0000-4000-8000-000000000022",
  pl2DecisionOne: "66000000-0000-4000-8000-000000000023",
  pl2DecisionTwo: "66000000-0000-4000-8000-000000000024",
  polingDecision: "66000000-0000-4000-8000-000000000025",
  otherProject: "66000000-0000-4000-8000-000000000026",
  otherWafer: "66000000-0000-4000-8000-000000000027"
};

await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data)
  values ('${id.actor}', 'history-recovery@example.com', '{"display_name":"History recovery"}');
  update public.profiles set role = 'admin' where id = '${id.actor}';
  insert into public.projects (id, slug, name, owner_id)
  values ('${id.project}', 'history-recovery', 'History recovery', '${id.actor}');
  insert into public.process_templates (id, owner_project_id, name, version, created_by)
  values ('${id.template}', '${id.project}', 'History recovery', '1.0', '${id.actor}');
  insert into public.process_steps (
    id, template_id, step_order, name, slug, process_area, required_reviewer_id
  ) values
    ('${id.eblStep}', '${id.template}', 1, 'EBL', 'ebl', 'Lithography', '${id.actor}'),
    ('${id.pl2Step}', '${id.template}', 2, 'PL2', 'pl2', 'Lithography', '${id.actor}'),
    ('${id.polingStep}', '${id.template}', 3, 'Poling', 'poling', 'Poling', '${id.actor}'),
    ('${id.inspectionStep}', '${id.template}', 4, 'Inspection', 'inspection', 'Inspection', '${id.actor}');
  insert into public.wafers (id, project_id, wafer_code, status, metadata)
  values ('${id.wafer}', '${id.project}', 'A4', 'in_progress', '{"wafer_family":"ALPHA"}');
  alter table public.wafer_process_assignments
    disable trigger wafer_assignments_require_published_template;
  alter table public.wafer_process_assignments
    disable trigger wafer_assignments_checkpoint_transition;
  alter table public.step_executions
    disable trigger step_executions_checkpoint_transition;
  insert into public.wafer_process_assignments (
    id, wafer_id, template_id, assigned_by, status, current_step_id
  ) values (
    '${id.assignment}', '${id.wafer}', '${id.template}', '${id.actor}',
    'in_progress', '${id.eblStep}'
  );
  update public.wafer_process_assignments
  set current_step_id = '${id.inspectionStep}'
  where id = '${id.assignment}';
  insert into public.step_executions (
    id, assignment_id, wafer_id, process_step_id, status,
    queue_started_at, completed_at, created_at, updated_at
  ) values
    (
      '${id.eblExecution}', '${id.assignment}', '${id.wafer}', '${id.eblStep}',
      'pending', null, null, '2026-07-17T03:27:23Z', '2026-07-17T03:27:23Z'
    ),
    (
      '${id.pl2Execution}', '${id.assignment}', '${id.wafer}', '${id.pl2Step}',
      'completed', '2026-07-20T17:38:19Z', '2026-07-22T19:29:59Z',
      '2026-07-20T17:38:19Z', '2026-07-22T19:29:59Z'
    ),
    (
      '${id.polingExecution}', '${id.assignment}', '${id.wafer}', '${id.polingStep}',
      'completed', '2026-07-22T19:29:59Z', '2026-07-22T19:31:09Z',
      '2026-07-21T13:12:58Z', '2026-07-22T19:31:09Z'
    ),
    (
      '${id.inspectionExecution}', '${id.assignment}', '${id.wafer}', '${id.inspectionStep}',
      'queued', '2026-07-22T19:33:13Z', null,
      '2026-07-22T19:31:09Z', '2026-07-22T19:33:13Z'
    );
  insert into public.operation_runs (
    id, template_id, process_step_id, run_kind, status, created_by, created_at, updated_at
  ) values
    ('${id.eblRun}', '${id.template}', '${id.eblStep}', 'normal', 'queued', '${id.actor}', '2026-07-17T03:27:23Z', '2026-07-17T03:27:23Z'),
    ('${id.pl2Run}', '${id.template}', '${id.pl2Step}', 'normal', 'redo_required', '${id.actor}', '2026-07-20T17:38:19Z', '2026-07-22T19:29:59Z'),
    ('${id.polingRun}', '${id.template}', '${id.polingStep}', 'normal', 'queued', '${id.actor}', '2026-07-21T13:12:58Z', '2026-07-22T19:31:09Z');
  insert into public.operation_run_members (
    id, operation_run_id, assignment_id, wafer_id, status,
    legacy_step_execution_id, created_at, updated_at
  ) values
    ('${id.eblMember}', '${id.eblRun}', '${id.assignment}', '${id.wafer}', 'completed', '${id.eblExecution}', '2026-07-17T03:27:23Z', '2026-07-17T03:27:23Z'),
    ('${id.pl2Member}', '${id.pl2Run}', '${id.assignment}', '${id.wafer}', 'redo_required', '${id.pl2Execution}', '2026-07-20T17:38:19Z', '2026-07-22T19:29:59Z'),
    ('${id.polingMember}', '${id.polingRun}', '${id.assignment}', '${id.wafer}', 'completed', '${id.polingExecution}', '2026-07-21T13:12:58Z', '2026-07-22T19:31:09Z');
  update public.wafer_process_assignments
  set current_operation_run_member_id = '${id.pl2Member}'
  where id = '${id.assignment}';
  alter table public.step_executions
    enable trigger step_executions_checkpoint_transition;
  alter table public.wafer_process_assignments
    enable trigger wafer_assignments_checkpoint_transition;
  alter table public.wafer_process_assignments
    enable trigger wafer_assignments_require_published_template;
`);

const attemptValues = [
  {
    id: id.pl2AttemptOne,
    step: id.pl2Step,
    execution: id.pl2Execution,
    number: 1,
    started: "2026-07-20T17:38:19Z",
    submitted: "2026-07-21T02:06:35Z"
  },
  {
    id: id.pl2AttemptTwo,
    step: id.pl2Step,
    execution: id.pl2Execution,
    number: 2,
    started: "2026-07-21T18:08:39Z",
    submitted: "2026-07-22T19:29:56Z"
  },
  {
    id: id.polingAttempt,
    step: id.polingStep,
    execution: id.polingExecution,
    number: 1,
    started: "2026-07-22T19:29:59Z",
    submitted: "2026-07-22T19:31:06Z"
  }
];
for (const attempt of attemptValues) {
  await db.query(`
    insert into public.process_step_attempts (
      id, assignment_id, wafer_id, template_id, process_step_id, step_execution_id,
      attempt_number, submitted_by, submitted_at, started_at_snapshot,
      evidence_snapshot, wafer_code_snapshot, template_name_snapshot,
      template_version_snapshot, process_step_name_snapshot, process_step_order_snapshot,
      reviewer_id_snapshot, reviewer_name_snapshot, submitted_by_name_snapshot,
      prior_step_status, client_mutation_id, operation_run_member_id
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      '{}'::jsonb, 'A4', 'History recovery', '1.0',
      (select name from public.process_steps where id = $5),
      (select step_order from public.process_steps where id = $5),
      $8, 'History recovery', 'History recovery',
      'completed', gen_random_uuid(), $11
    )
  `, [
    attempt.id,
    id.assignment,
    id.wafer,
    id.template,
    attempt.step,
    attempt.execution,
    attempt.number,
    id.actor,
    attempt.submitted,
    attempt.started,
    id.pl2Member
  ]);
}

const decisionValues = [
  [id.pl2DecisionOne, id.pl2AttemptOne, id.pl2Step, id.pl2Execution, "2026-07-21T13:12:58Z"],
  [id.pl2DecisionTwo, id.pl2AttemptTwo, id.pl2Step, id.pl2Execution, "2026-07-22T19:29:59Z"],
  [id.polingDecision, id.polingAttempt, id.polingStep, id.polingExecution, "2026-07-22T19:31:09Z"]
];
for (const [decisionId, attemptId, stepId, executionId, decidedAt] of decisionValues) {
  await db.query(`
    insert into public.checkpoint_decisions (
      id, attempt_id, assignment_id, wafer_id, template_id, process_step_id,
      step_execution_id, decision, decided_by, decided_at,
      wafer_code_snapshot, process_step_name_snapshot, process_step_order_snapshot,
      decided_by_name_snapshot, client_mutation_id
    ) values (
      $1, $2, $3, $4, $5, $6, $7, 'approved', $8, $9,
      'A4',
      (select name from public.process_steps where id = $6),
      (select step_order from public.process_steps where id = $6),
      'History recovery', gen_random_uuid()
    )
  `, [
    decisionId,
    attemptId,
    id.assignment,
    id.wafer,
    id.template,
    stepId,
    executionId,
    id.actor,
    decidedAt
  ]);
}

for (const attempt of attemptValues) {
  await db.query(`
    insert into public.process_events (
      project_id, wafer_id, step_execution_id, actor_id, event_type, event_at, metadata
    ) values
      ($1, $2, $3, $4, 'checkpoint_step_entered', $5, jsonb_build_object(
        'assignment_id', $6::text, 'target_step_id', $7::text
      )),
      ($1, $2, $3, $4, 'checkpoint_submitted', $8, jsonb_build_object('attempt_id', $9::text)),
      ($1, $2, $3, $4, 'checkpoint_approved', $10, jsonb_build_object('attempt_id', $9::text))
  `, [
    id.project,
    id.wafer,
    attempt.execution,
    id.actor,
    attempt.started,
    id.assignment,
    attempt.step,
    attempt.submitted,
    attempt.id,
    decisionValues.find((row) => row[1] === attempt.id)?.[4]
  ]);
}
await db.query(`
  insert into public.process_events (
    project_id, wafer_id, step_execution_id, actor_id, event_type, event_at, metadata
  ) values (
    $1, $2, $3, $4, 'checkpoint_step_entered', '2026-07-22T19:33:13Z',
    jsonb_build_object('assignment_id', $5::text, 'target_step_id', $6::text)
  )
`, [id.project, id.wafer, id.inspectionExecution, id.actor, id.assignment, id.inspectionStep]);

for (const file of migrationFiles.slice(recoveryIndex)) {
  const sql = await readFile(new URL(file, migrationDirectory), "utf8");
  await db.exec(sql);
}

const attempts = await db.query(`
  select
    attempt.id,
    attempt.process_step_id,
    member.id as member_id,
    run.process_step_id as member_step_id,
    member.started_at,
    member.completed_at
  from public.process_step_attempts attempt
  join public.operation_run_members member on member.id = attempt.operation_run_member_id
  join public.operation_runs run on run.id = member.operation_run_id
  where attempt.assignment_id = '${id.assignment}'
  order by attempt.submitted_at
`);
assert.equal(new Set(attempts.rows.map((row) => row.member_id)).size, 3);
assert.ok(attempts.rows.every((row) => row.process_step_id === row.member_step_id));
assert.deepEqual(
  attempts.rows.map((row) => [row.started_at.toISOString(), row.completed_at.toISOString()]),
  [
    ["2026-07-20T17:38:19.000Z", "2026-07-21T13:12:58.000Z"],
    ["2026-07-21T18:08:39.000Z", "2026-07-22T19:29:59.000Z"],
    ["2026-07-22T19:29:59.000Z", "2026-07-22T19:31:09.000Z"]
  ]
);

const suppressed = await db.query(`
  select id, history_effective, history_suppression_reason
  from public.operation_run_members
  where id in ('${id.eblMember}', '${id.pl2Member}', '${id.polingMember}')
  order by id
`);
assert.equal(suppressed.rows.length, 3);
assert.ok(suppressed.rows.every((row) => row.history_effective === false));
assert.ok(suppressed.rows.every((row) => String(row.history_suppression_reason).length > 0));

const current = await db.query(`
  select
    assignment.current_operation_run_member_id as member_id,
    run.process_step_id,
    member.started_at,
    member.history_effective
  from public.wafer_process_assignments assignment
  join public.operation_run_members member on member.id = assignment.current_operation_run_member_id
  join public.operation_runs run on run.id = member.operation_run_id
  where assignment.id = '${id.assignment}'
`);
assert.equal(current.rows[0].process_step_id, id.inspectionStep);
assert.equal(current.rows[0].history_effective, true);
assert.equal(current.rows[0].started_at.toISOString(), "2026-07-22T19:33:13.000Z");

const orphanEvents = await db.query(`
  select count(*)::integer as count
  from public.process_events event
  where event.wafer_id = '${id.wafer}'
    and event.event_type in ('checkpoint_step_entered', 'checkpoint_submitted', 'checkpoint_approved')
    and (event.operation_run_id is null or event.operation_run_member_id is null)
`);
assert.equal(orphanEvents.rows[0].count, 0);

const memberCountBeforeRetry = await db.query(`
  select count(*)::integer as count from public.operation_run_members
  where assignment_id = '${id.assignment}'
`);
await db.query("select public.repair_operation_history_from_evidence()");
const memberCountAfterRetry = await db.query(`
  select count(*)::integer as count from public.operation_run_members
  where assignment_id = '${id.assignment}'
`);
assert.equal(memberCountAfterRetry.rows[0].count, memberCountBeforeRetry.rows[0].count);

await db.exec(`
  insert into public.projects (id, slug, name, owner_id)
  values ('${id.otherProject}', 'history-recovery-other', 'Other recovery project', '${id.actor}');
  insert into public.wafers (id, project_id, wafer_code, status, metadata)
  values ('${id.otherWafer}', '${id.otherProject}', 'OTHER', 'in_progress', '{}');
`);
await db.query(`
  insert into public.process_events (
    project_id, wafer_id, actor_id, event_type, event_at, metadata
  ) values (
    $1, $2, $3, 'checkpoint_step_entered', '2026-07-22T20:00:00Z',
    jsonb_build_object(
      'assignment_id', $4::text,
      'target_step_id', $5::text,
      'attempt_id', $6::text,
      'corrected_event_id', 'not-a-uuid'
    )
  )
`, [
  id.otherProject,
  id.otherWafer,
  id.actor,
  id.assignment,
  id.pl2Step,
  id.polingAttempt
]);
const currentAfterHostileEvent = await db.query(`
  select current_operation_run_member_id
  from public.wafer_process_assignments
  where id = '${id.assignment}'
`);
assert.equal(currentAfterHostileEvent.rows[0].current_operation_run_member_id, current.rows[0].member_id);

await db.exec(`
  set app.actor_id = '${id.actor}';
  set app.role = 'authenticated';
  set role authenticated;
`);
const visibleMembers = await db.query(`
  select member.id
  from public.operation_run_members member
  where member.assignment_id = '${id.assignment}'
  order by member.started_at, member.id
`);
await db.exec("reset role");
assert.ok(!visibleMembers.rows.some((row) => row.id === id.eblMember));
assert.ok(!visibleMembers.rows.some((row) => row.id === id.pl2Member));
assert.ok(!visibleMembers.rows.some((row) => row.id === id.polingMember));
assert.equal(visibleMembers.rows.length, 4);

console.log(JSON.stringify({
  exactRepro: "A4 merged PL2 repeats, cross-step Poling link, false EBL completion, and missing Inspection member",
  recoveredVisits: visibleMembers.rows.length,
  distinctAttemptMembers: new Set(attempts.rows.map((row) => row.member_id)).size,
  orphanEvents: orphanEvents.rows[0].count,
  rerunnable: memberCountAfterRetry.rows[0].count === memberCountBeforeRetry.rows[0].count,
  suppressedEvidenceRetained: suppressed.rows.length,
  hostileMetadataBoundToWafer: currentAfterHostileEvent.rows[0].current_operation_run_member_id === current.rows[0].member_id
}, null, 2));
