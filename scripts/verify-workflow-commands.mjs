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
    id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id), name text not null, owner uuid
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
const migrations = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
for (const migration of migrations) {
  const sql = (await readFile(new URL(migration, migrationDirectory), "utf8"))
    .replace(/^create extension if not exists "pgcrypto";\s*$/m, "");
  await db.exec(sql);
}

const id = {
  actor: "91000000-0000-4000-8000-000000000001",
  outsider: "91000000-0000-4000-8000-000000000002",
  project: "91000000-0000-4000-8000-000000000003",
  template: "91000000-0000-4000-8000-000000000004",
  startStep: "91000000-0000-4000-8000-000000000005",
  authenticatedStep: "91000000-0000-4000-8000-000000000006",
  stepMutation: "91000000-0000-4000-8000-000000000007",
  staleMutation: "91000000-0000-4000-8000-000000000008",
  transitionMutation: "91000000-0000-4000-8000-000000000009",
  unauthorizedMutation: "91000000-0000-4000-8000-000000000010",
  failedStepMutation: "91000000-0000-4000-8000-000000000011",
  waferMutation: "91000000-0000-4000-8000-000000000012",
  failedWaferMutation: "91000000-0000-4000-8000-000000000013",
  archiveMutation: "91000000-0000-4000-8000-000000000014",
  calendarCreateMutation: "91000000-0000-4000-8000-000000000016",
  calendarMoveMutation: "91000000-0000-4000-8000-000000000017",
  calendarDeleteMutation: "91000000-0000-4000-8000-000000000018",
  calendarUnauthorizedMutation: "91000000-0000-4000-8000-000000000019",
  calendarForcedMutation: "91000000-0000-4000-8000-000000000020"
};

await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${id.actor}', 'command-owner@example.com', '{"display_name":"Command owner"}'),
    ('${id.outsider}', 'command-viewer@example.com', '{"display_name":"Command viewer"}');
  update public.profiles set role = 'admin' where id = '${id.actor}';
  update public.profiles set role = 'viewer' where id = '${id.outsider}';
  insert into public.projects (id, slug, name, owner_id)
  values ('${id.project}', 'workflow-command-verifier', 'Workflow command verifier', '${id.actor}');
  insert into public.process_templates (id, owner_project_id, name, version, created_by, lifecycle_status)
  values ('${id.template}', '${id.project}', 'Workflow command verifier', '1.0', '${id.actor}', 'draft');
  insert into public.process_steps (
    id, template_id, step_order, name, slug, process_area, node_type, canvas_x, canvas_y,
    required_reviewer_id
  ) values (
    '${id.startStep}', '${id.template}', 10, 'Beginning', 'beginning', 'Start', 'start', 120, 120,
    '${id.actor}'
  );
  set app.actor_id = '${id.actor}';
  set app.role = 'authenticated';
  set role authenticated;
`);

// Exact reported path: an authenticated process_steps insert synthesizes its
// process_stages row without broadening direct stage write permissions.
await db.exec(`
  insert into public.process_steps (
    id, template_id, step_order, name, slug, process_area, node_type, canvas_x, canvas_y,
    required_reviewer_id
  ) values (
    '${id.authenticatedStep}', '${id.template}', 20, 'Authenticated insert',
    'authenticated-insert', 'Verification', 'procedure', 280, 120, '${id.actor}'
  );
`);
const authenticatedInsert = await db.query(`
  select step.id, step.stage_id, stage.template_id, stage.slug
  from public.process_steps step
  join public.process_stages stage on stage.id = step.stage_id
  where step.id = '${id.authenticatedStep}'
`);
assert.equal(authenticatedInsert.rows.length, 1);
assert.equal(authenticatedInsert.rows[0].template_id, id.template);
assert.equal(authenticatedInsert.rows[0].slug, "authenticated-insert");

const createStep = () => db.query(`
  select public.create_process_step_command(
    '${id.template}', 'Command step', 'Verification', 'procedure', 440, 120,
    '{"version":1,"fields":[]}'::jsonb, 0, '${id.stepMutation}'
  ) as result
`);
const firstStepResult = await createStep();
const createdStepId = firstStepResult.rows[0].result.item.id;
assert.equal(firstStepResult.rows[0].result.workflowRevision, 1);
assert.equal(firstStepResult.rows[0].result.alreadyApplied, false);
const repeatedStepResult = await createStep();
assert.equal(repeatedStepResult.rows[0].result.item.id, createdStepId);
assert.equal(repeatedStepResult.rows[0].result.workflowRevision, 1);
assert.equal(repeatedStepResult.rows[0].result.alreadyApplied, true);

const staleStep = await db.query(`
  select public.create_process_step_command(
    '${id.template}', 'Stale step', 'Verification', 'procedure', 520, 120,
    '{"version":1,"fields":[]}'::jsonb, 0, '${id.staleMutation}'
  ) as result
`);
assert.equal(staleStep.rows[0].result.ok, false);
assert.equal(staleStep.rows[0].result.code, "stale");
assert.equal(staleStep.rows[0].result.currentRevision, 1);

const createTransition = () => db.query(`
  select public.create_process_transition_command(
    '${id.template}', '${id.startStep}', '${createdStepId}', 'flow', null, '{}'::jsonb,
    10, 1, '${id.transitionMutation}'
  ) as result
`);
const transitionResult = await createTransition();
const transitionId = transitionResult.rows[0].result.item.id;
assert.equal(transitionResult.rows[0].result.workflowRevision, 2);
assert.equal((await createTransition()).rows[0].result.item.id, transitionId);
await db.exec("reset role");
const transitionCount = await db.query(`
  select count(*)::integer as count from public.process_step_transitions
  where id = '${transitionId}'
`);
assert.equal(transitionCount.rows[0].count, 1);

await db.exec(`set app.actor_id = '${id.outsider}'; set role authenticated;`);
await assert.rejects(
  db.query(`
    select public.create_process_step_command(
      '${id.template}', 'Unauthorized', 'Verification', 'procedure', 600, 120,
      '{"version":1,"fields":[]}'::jsonb, 2, '${id.unauthorizedMutation}'
    )
  `),
  /cannot create a step/i
);

await db.exec(`
  reset role;
  create or replace function public.fail_forced_step_command()
  returns trigger language plpgsql as $$
  begin
    if new.name = 'Forced command failure' then
      raise exception using errcode = 'XX000', message = 'forced step command failure';
    end if;
    return new;
  end;
  $$;
  create trigger process_steps_force_command_failure
    after insert on public.process_steps
    for each row execute function public.fail_forced_step_command();
  set app.actor_id = '${id.actor}';
  set role authenticated;
`);
await assert.rejects(
  db.query(`
    select public.create_process_step_command(
      '${id.template}', 'Forced command failure', 'Verification', 'procedure', 680, 120,
      '{"version":1,"fields":[]}'::jsonb, 2, '${id.failedStepMutation}'
    )
  `),
  /forced step command failure/i
);
await db.exec("reset role");
const failedStepState = await db.query(`
  select
    (select count(*)::integer from public.process_steps where name = 'Forced command failure') as steps,
    (select count(*)::integer from public.process_stages where name = 'Forced command failure') as stages,
    (select count(*)::integer from public.workflow_change_log where client_mutation_id = '${id.failedStepMutation}') as revisions
`);
assert.deepEqual(failedStepState.rows, [{ steps: 0, stages: 0, revisions: 0 }]);

await db.exec(`
  drop trigger process_steps_force_command_failure on public.process_steps;
  update public.process_steps set required_reviewer_id = '${id.actor}' where template_id = '${id.template}';
  set app.actor_id = '${id.actor}';
  set role authenticated;
`);
await db.query(`select public.publish_process_template_version('${id.template}')`);

const createWafer = () => db.query(`
  select public.create_process_wafer_command(
    '${id.template}', '${id.project}', 'GOLDEN', 4, 2, '${id.waferMutation}'
  ) as result
`);
const waferResult = await createWafer();
assert.equal(waferResult.rows[0].result.workflowRevision, 3);
assert.equal(waferResult.rows[0].result.alreadyApplied, false);
const waferId = waferResult.rows[0].result.wafer.id;
const assignmentId = waferResult.rows[0].result.assignment.id;
const repeatWafer = await createWafer();
assert.equal(repeatWafer.rows[0].result.wafer.id, waferId);
assert.equal(repeatWafer.rows[0].result.alreadyApplied, true);
const waferAtomicState = await db.query(`
  select
    (select count(*)::integer from public.wafers where id = '${waferId}') as wafers,
    (select count(*)::integer from public.wafer_process_assignments where id = '${assignmentId}') as assignments,
    (select count(*)::integer from public.step_executions where assignment_id = '${assignmentId}') as executions,
    (select count(*)::integer from public.operation_runs where client_mutation_id = '${id.waferMutation}') as runs,
    (select count(*)::integer from public.operation_run_members where assignment_id = '${assignmentId}') as members,
    (select count(*)::integer from public.process_events where client_mutation_id = '${id.waferMutation}') as events,
    (select count(*)::integer from public.workflow_change_log where client_mutation_id = '${id.waferMutation}') as revisions
`);
assert.equal(waferAtomicState.rows[0].wafers, 1);
assert.equal(waferAtomicState.rows[0].assignments, 1);
assert.ok(waferAtomicState.rows[0].executions >= 3);
assert.deepEqual({
  runs: waferAtomicState.rows[0].runs,
  members: waferAtomicState.rows[0].members,
  events: waferAtomicState.rows[0].events,
  revisions: waferAtomicState.rows[0].revisions
}, { runs: 1, members: 1, events: 1, revisions: 1 });

await db.exec(`
  reset role;
  create or replace function public.fail_forced_wafer_command()
  returns trigger language plpgsql as $$
  begin
    raise exception using errcode = 'XX000', message = 'forced wafer command failure';
  end;
  $$;
  create trigger step_executions_force_command_failure
    after insert on public.step_executions
    for each row execute function public.fail_forced_wafer_command();
  set app.actor_id = '${id.actor}';
  set role authenticated;
`);
await assert.rejects(
  db.query(`
    select public.create_process_wafer_command(
      '${id.template}', '${id.project}', 'ROLLBACK', 2, 3, '${id.failedWaferMutation}'
    )
  `),
  /forced wafer command failure/i
);
await db.exec("reset role");
const failedWaferState = await db.query(`
  select
    (select count(*)::integer from public.wafers where wafer_code = 'ROLLBACK') as wafers,
    (select count(*)::integer from public.workflow_change_log where client_mutation_id = '${id.failedWaferMutation}') as revisions
`);
assert.deepEqual(failedWaferState.rows, [{ wafers: 0, revisions: 0 }]);

await db.exec(`
  drop trigger step_executions_force_command_failure on public.step_executions;
  set waferwatch.canonical_workflow_mutation = 'on';
  update public.step_executions
  set status = 'completed', started_at = now() - interval '1 minute', completed_at = now()
  where assignment_id = '${assignmentId}'
    and process_step_id = (select current_step_id from public.wafer_process_assignments where id = '${assignmentId}');
  set app.actor_id = '${id.actor}';
  set role authenticated;
`);
const archive = () => db.query(`
  select public.archive_process_assignments_command(
    '${id.template}', array['${assignmentId}'::uuid], array['${id.archiveMutation}'::uuid],
    3, '${id.archiveMutation}'
  ) as result
`);
const archiveResult = await archive();
assert.equal(archiveResult.rows[0].result.workflowRevision, 4);
assert.equal((await archive()).rows[0].result.alreadyApplied, true);
const snapshot = (await db.query(`select public.get_process_workspace_snapshot('${id.template}') as value`)).rows[0].value;
const delta = (await db.query(`select public.get_process_workspace_delta('${id.template}', 3) as value`)).rows[0].value;
assert.equal(snapshot.currentState.some((row) => row.assignment_id === assignmentId), false);
assert.equal(snapshot.archivedState.some((row) => row.assignment_id === assignmentId), true);
assert.equal(delta.currentState.length, 0);
assert.equal(delta.archivedState.some((row) => row.assignment_id === assignmentId), true);
assert.equal(snapshot.operationHistory.some((row) => row.assignment_id === assignmentId), true);

await db.exec("reset role");
const actorCalendarPerson = await db.query(`
  select id from public.process_people where profile_id = '${id.actor}'
`);
assert.equal(actorCalendarPerson.rows.length, 1);
const calendarPersonId = actorCalendarPerson.rows[0].id;
await db.exec(`set app.actor_id = '${id.actor}'; set role authenticated;`);
const createCalendar = () => db.query(`
  select public.create_calendar_schedule_item(
    '${id.template}', null, 'Toronto', '2026-09-01T14:00:00Z', '2026-09-01T15:00:00Z',
    null, 'Golden command event', 'Calendar command verification',
    array['${calendarPersonId}'::uuid], '${id.calendarCreateMutation}'
  ) as result
`);
const calendarCreate = await createCalendar();
const calendarEventId = calendarCreate.rows[0].result.item.id;
assert.equal(calendarCreate.rows[0].result.workflowRevision, 5);
assert.equal((await createCalendar()).rows[0].result.item.id, calendarEventId);

const staleCalendarMove = await db.query(`
  select public.move_calendar_schedule_item(
    '${calendarEventId}', 99, 'Toronto', '2026-09-01T15:00:00Z', '2026-09-01T16:00:00Z',
    '${id.calendarForcedMutation}'
  ) as result
`);
assert.equal(staleCalendarMove.rows[0].result.ok, false);
assert.equal(staleCalendarMove.rows[0].result.code, "stale");
assert.equal((await db.query(`select count(*)::integer as count from public.workflow_change_log where client_mutation_id = '${id.calendarForcedMutation}'`)).rows[0].count, 0);

const moveCalendar = () => db.query(`
  select public.move_calendar_schedule_item(
    '${calendarEventId}', 1, 'Toronto', '2026-09-01T15:00:00Z', '2026-09-01T16:00:00Z',
    '${id.calendarMoveMutation}'
  ) as result
`);
const calendarMove = await moveCalendar();
assert.equal(calendarMove.rows[0].result.workflowRevision, 6);
assert.equal((await moveCalendar()).rows[0].result.alreadyApplied, true);

await db.exec(`set app.actor_id = '${id.outsider}'; set role authenticated;`);
await assert.rejects(
  db.query(`
    select public.create_calendar_schedule_item(
      '${id.template}', null, 'Toronto', '2026-09-02T14:00:00Z', '2026-09-02T15:00:00Z',
      null, 'Unauthorized event', null, array['${calendarPersonId}'::uuid],
      '${id.calendarUnauthorizedMutation}'
    )
  `),
  /cannot edit this project schedule/i
);
await db.exec(`set app.actor_id = '${id.actor}'; set role authenticated;`);

const deleteCalendar = () => db.query(`
  select public.delete_calendar_schedule_item(
    '${calendarEventId}', 2, '${id.calendarDeleteMutation}'
  ) as result
`);
const calendarDelete = await deleteCalendar();
assert.equal(calendarDelete.rows[0].result.workflowRevision, 7);
assert.equal((await deleteCalendar()).rows[0].result.alreadyApplied, true);
assert.equal((await db.query(`select count(*)::integer as count from public.process_calendar_events where id = '${calendarEventId}'`)).rows[0].count, 0);

console.log(JSON.stringify({
  migrations: migrations.length,
  authenticatedStageInsert: "passed",
  stepCreate: "atomic, idempotent, stale-safe, unauthorized-safe, rollback-safe",
  transitionCreate: "one persisted edge and one revision",
  waferCreate: "wafer, assignment, executions, run/member, evidence, one revision",
  archive: "active removal, archive projection, append-only history, one revision",
  calendar: "create, move, delete, duplicate, stale, and unauthorized contracts"
}, null, 2));
