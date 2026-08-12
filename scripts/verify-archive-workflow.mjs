import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = {
  actor: "20000000-0000-4000-8000-000000000001",
  project: "20000000-0000-4000-8000-000000000002",
  template: "20000000-0000-4000-8000-000000000003",
  first: "20000000-0000-4000-8000-000000000004",
  final: "20000000-0000-4000-8000-000000000005",
  wafer: "20000000-0000-4000-8000-000000000006",
  assignment: "20000000-0000-4000-8000-000000000007",
  mutation: "20000000-0000-4000-8000-000000000008",
  restoreMutation: "20000000-0000-4000-8000-000000000009",
  directWafer: "20000000-0000-4000-8000-000000000010",
  directAssignment: "20000000-0000-4000-8000-000000000011",
  middle: "20000000-0000-4000-8000-000000000012",
  stepCompleteWafer: "20000000-0000-4000-8000-000000000013",
  stepCompleteAssignment: "20000000-0000-4000-8000-000000000014",
  stepCompleteMutation: "20000000-0000-4000-8000-000000000015",
  stepCompleteRestoreMutation: "20000000-0000-4000-8000-000000000016",
  reviewWafer: "20000000-0000-4000-8000-000000000017",
  reviewAssignment: "20000000-0000-4000-8000-000000000018",
  reviewExecution: "20000000-0000-4000-8000-000000000019",
  reviewAttempt: "20000000-0000-4000-8000-000000000020",
  reviewRun: "20000000-0000-4000-8000-000000000021",
  reviewMember: "20000000-0000-4000-8000-000000000022",
  reviewMutation: "20000000-0000-4000-8000-000000000023"
};

await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create type public.fabrication_status as enum ('planned', 'queued', 'in_progress', 'on_hold', 'completed', 'scrapped');
  create type public.step_status as enum (
    'pending', 'queued', 'running', 'blocked', 'awaiting_checkpoint',
    'ready_to_move', 'redo_required', 'completed', 'skipped', 'failed'
  );

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('app.actor_id', true), '')::uuid
  $$;

  create table public.profiles (
    id uuid primary key,
    email text not null,
    display_name text,
    is_active boolean not null default true
  );
  create table public.projects (
    id uuid primary key,
    owner_id uuid references public.profiles(id),
    name text not null
  );
  create table public.process_templates (
    id uuid primary key,
    owner_project_id uuid references public.projects(id),
    name text not null,
    is_active boolean not null default true
  );
  create table public.process_steps (
    id uuid primary key,
    template_id uuid not null references public.process_templates(id),
    step_order integer not null,
    name text not null,
    slug text,
    process_area text,
    node_type text not null default 'step',
    required_reviewer_id uuid references public.profiles(id),
    archived_at timestamptz,
    created_at timestamptz not null default now()
  );
  create table public.wafers (
    id uuid primary key,
    project_id uuid not null references public.projects(id),
    wafer_code text not null,
    status public.fabrication_status not null,
    metadata jsonb not null default '{}'::jsonb,
    deleted_at timestamptz,
    deleted_by uuid references public.profiles(id),
    unique (project_id, wafer_code)
  );
  create table public.wafer_process_assignments (
    id uuid primary key,
    wafer_id uuid not null references public.wafers(id),
    template_id uuid not null references public.process_templates(id),
    assigned_by uuid references public.profiles(id),
    status public.fabrication_status not null,
    assigned_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    current_step_id uuid references public.process_steps(id),
    revision bigint not null default 1,
    deleted_at timestamptz,
    deleted_by uuid references public.profiles(id)
  );
  create table public.step_executions (
    id uuid primary key default gen_random_uuid(),
    assignment_id uuid not null references public.wafer_process_assignments(id),
    wafer_id uuid not null references public.wafers(id),
    process_step_id uuid not null references public.process_steps(id),
    status public.step_status not null,
    queue_started_at timestamptz,
    completed_at timestamptz,
    completed_by uuid references public.profiles(id),
    metadata jsonb not null default '{}'::jsonb,
    unique (assignment_id, process_step_id)
  );
  create table public.process_events (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id),
    wafer_id uuid references public.wafers(id),
    actor_id uuid references public.profiles(id),
    event_type text not null,
    event_at timestamptz not null default now(),
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    client_mutation_id uuid unique
  );

  create table public.operation_runs (
    id uuid primary key,
    status text not null,
    completed_at timestamptz
  );
  create table public.operation_run_members (
    id uuid primary key,
    operation_run_id uuid not null references public.operation_runs(id),
    assignment_id uuid not null references public.wafer_process_assignments(id),
    status text not null,
    completed_at timestamptz,
    legacy_step_execution_id uuid references public.step_executions(id)
  );
  alter table public.wafer_process_assignments
    add column current_operation_run_member_id uuid references public.operation_run_members(id);
  create table public.process_step_attempts (
    id uuid primary key,
    assignment_id uuid not null references public.wafer_process_assignments(id),
    step_execution_id uuid not null references public.step_executions(id),
    operation_run_member_id uuid references public.operation_run_members(id),
    attempt_number integer not null,
    reviewer_id_snapshot uuid references public.profiles(id)
  );
  create table public.checkpoint_decisions (
    id uuid primary key default gen_random_uuid(),
    attempt_id uuid not null references public.process_step_attempts(id),
    decision text not null,
    decided_by uuid references public.profiles(id),
    client_mutation_id uuid unique
  );
  create table public.checkpoint_submission_withdrawals (
    id uuid primary key default gen_random_uuid(),
    attempt_id uuid not null references public.process_step_attempts(id)
  );

  create function public.can_edit_project(target_project_id uuid) returns boolean language sql stable as $$
    select exists (
      select 1 from public.projects project
      where project.id = target_project_id and project.owner_id = auth.uid()
    )
  $$;
  create function public.checkpoint_dicing_child_is_authorized(uuid, uuid, uuid)
  returns boolean language sql stable as $$ select false $$;
  create function public.derived_mutation_uuid(uuid, uuid, text)
  returns uuid language sql immutable as $$ select $2 $$;
  create function public.review_step_checkpoint(uuid, text, uuid, text, uuid)
  returns void language plpgsql security definer set search_path = public as $$
  declare
    target_attempt public.process_step_attempts%rowtype;
  begin
    select * into target_attempt from public.process_step_attempts where id = $1;
    if target_attempt.id is null
       or target_attempt.reviewer_id_snapshot is distinct from auth.uid() then
      raise exception using errcode = '42501', message = 'Only the assigned checkpoint reviewer can decide this submission.';
    end if;
    insert into public.checkpoint_decisions (
      attempt_id, decision, decided_by, client_mutation_id
    ) values ($1, $2, auth.uid(), $3);
    update public.step_executions
    set status = 'ready_to_move', completed_at = now(), completed_by = auth.uid()
    where id = target_attempt.step_execution_id;
  end;
  $$;
  create function public.enforce_published_assignment_template()
  returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger wafer_assignments_require_published_template
    before insert or update of template_id on public.wafer_process_assignments
    for each row execute function public.enforce_published_assignment_template();

  insert into public.profiles (id, email, display_name) values
    ('${id.actor}', 'archive@example.test', 'Archive verifier');
  insert into public.projects (id, owner_id, name) values
    ('${id.project}', '${id.actor}', 'Archive verification');
  insert into public.process_templates (id, owner_project_id, name) values
    ('${id.template}', '${id.project}', 'Archive process');
  insert into public.process_steps (id, template_id, step_order, name) values
    ('${id.first}', '${id.template}', 10, 'Start'),
    ('${id.middle}', '${id.template}', 15, 'Completed middle step'),
    ('${id.final}', '${id.template}', 20, 'Finish');
  update public.process_steps set required_reviewer_id = '${id.actor}' where id = '${id.middle}';
  insert into public.wafers (id, project_id, wafer_code, status) values
    ('${id.wafer}', '${id.project}', 'ARCHIVE-VERIFY', 'completed'),
    ('${id.directWafer}', '${id.project}', 'DIRECT-VERIFY', 'completed'),
    ('${id.stepCompleteWafer}', '${id.project}', 'STEP-ARCHIVE-VERIFY', 'in_progress'),
    ('${id.reviewWafer}', '${id.project}', 'REVIEW-ARCHIVE-VERIFY', 'in_progress');
  insert into public.wafer_process_assignments (
    id, wafer_id, template_id, assigned_by, status, completed_at, current_step_id
  ) values (
    '${id.assignment}', '${id.wafer}', '${id.template}', '${id.actor}', 'completed', now(), '${id.final}'
  ), (
    '${id.stepCompleteAssignment}', '${id.stepCompleteWafer}', '${id.template}', '${id.actor}', 'in_progress', null, '${id.middle}'
  ), (
    '${id.reviewAssignment}', '${id.reviewWafer}', '${id.template}', '${id.actor}', 'in_progress', null, '${id.middle}'
  );
  insert into public.step_executions (id, assignment_id, wafer_id, process_step_id, status) values
    (gen_random_uuid(), '${id.stepCompleteAssignment}', '${id.stepCompleteWafer}', '${id.middle}', 'completed'),
    ('${id.reviewExecution}', '${id.reviewAssignment}', '${id.reviewWafer}', '${id.middle}', 'awaiting_checkpoint');
  insert into public.operation_runs (id, status) values ('${id.reviewRun}', 'awaiting_review');
  insert into public.operation_run_members (
    id, operation_run_id, assignment_id, status, legacy_step_execution_id
  ) values (
    '${id.reviewMember}', '${id.reviewRun}', '${id.reviewAssignment}', 'awaiting_review', '${id.reviewExecution}'
  );
  update public.wafer_process_assignments
  set current_operation_run_member_id = '${id.reviewMember}'
  where id = '${id.reviewAssignment}';
  insert into public.process_step_attempts (
    id, assignment_id, step_execution_id, operation_run_member_id,
    attempt_number, reviewer_id_snapshot
  ) values (
    '${id.reviewAttempt}', '${id.reviewAssignment}', '${id.reviewExecution}',
    '${id.reviewMember}', 1, '${id.actor}'
  );
`);

const migration = await readFile(
  new URL("../supabase/migrations/202607150010_completed_wafer_archive.sql", import.meta.url),
  "utf8"
);
const completedStepArchiveMigration = await readFile(
  new URL("../supabase/migrations/202607210002_allow_completed_step_archive.sql", import.meta.url),
  "utf8"
);
const readyToMoveArchiveMigration = await readFile(
  new URL("../supabase/migrations/202607220002_archive_ready_to_move.sql", import.meta.url),
  "utf8"
);
const reviewerArchiveMigration = await readFile(
  new URL("../supabase/migrations/202607220003_archive_reviewer_checkpoint.sql", import.meta.url),
  "utf8"
);
await db.exec(migration);
await db.exec(completedStepArchiveMigration);
await db.exec(readyToMoveArchiveMigration);
await db.exec(reviewerArchiveMigration);
await db.exec(`select set_config('app.actor_id', '${id.actor}', false)`);

await assert.rejects(
  db.exec(`
    insert into public.wafer_process_assignments (
      id, wafer_id, template_id, assigned_by, status, current_step_id
    ) values (
      '${id.directAssignment}', '${id.directWafer}', '${id.template}', '${id.actor}', 'queued', '${id.final}'
    )
  `),
  /New assignments must begin at the first step/
);

const archiveResult = await db.query(
  `select * from public.archive_completed_wafer_assignments($1::uuid[], $2::uuid[])`,
  [[id.assignment], [id.mutation]]
);
assert.equal(archiveResult.rows.length, 1);

const archivedState = await db.query(`
  select wafer.archived_at as wafer_archived_at,
         assignment.archived_at as assignment_archived_at,
         assignment.status as assignment_status
  from public.wafers wafer
  join public.wafer_process_assignments assignment on assignment.wafer_id = wafer.id
  where assignment.id = '${id.assignment}'
`);
assert.ok(archivedState.rows[0].wafer_archived_at);
assert.ok(archivedState.rows[0].assignment_archived_at);
assert.equal(archivedState.rows[0].assignment_status, "completed");

const restoreResult = await db.query(
  `select public.restore_archived_wafer_to_step($1, $2, $3, $4) as restored`,
  [id.wafer, id.assignment, id.first, id.restoreMutation]
);
const restored = restoreResult.rows[0].restored;
assert.equal(restored.target_step_id, id.first);

const restoredState = await db.query(`
  select wafer.archived_at,
         wafer.status as wafer_status,
         old_assignment.status as old_status,
         old_assignment.archived_at as old_archived_at,
         new_assignment.status as new_status,
         new_assignment.current_step_id,
         execution.status as execution_status
  from public.wafers wafer
  join public.wafer_process_assignments old_assignment on old_assignment.id = '${id.assignment}'
  join public.wafer_process_assignments new_assignment on new_assignment.id = '${restored.assignment_id}'
  join public.step_executions execution on execution.assignment_id = new_assignment.id
  where wafer.id = '${id.wafer}'
`);
assert.equal(restoredState.rows[0].archived_at, null);
assert.equal(restoredState.rows[0].wafer_status, "queued");
assert.equal(restoredState.rows[0].old_status, "completed");
assert.ok(restoredState.rows[0].old_archived_at);
assert.equal(restoredState.rows[0].new_status, "queued");
assert.equal(restoredState.rows[0].current_step_id, id.first);
assert.equal(restoredState.rows[0].execution_status, "queued");

const events = await db.query(`
  select event_type from public.process_events
  where wafer_id = '${id.wafer}'
  order by event_at
`);
assert.deepEqual(events.rows.map((event) => event.event_type), [
  "wafer_archived",
  "wafer_restored_from_archive"
]);

const completedStepArchiveResult = await db.query(
  `select * from public.archive_completed_wafer_assignments($1::uuid[], $2::uuid[])`,
  [[id.stepCompleteAssignment], [id.stepCompleteMutation]]
);
assert.equal(completedStepArchiveResult.rows.length, 1);

const completedStepArchivedState = await db.query(`
  select wafer.status as wafer_status,
         wafer.archived_at as wafer_archived_at,
         assignment.status as assignment_status,
         assignment.archived_at as assignment_archived_at
  from public.wafers wafer
  join public.wafer_process_assignments assignment on assignment.wafer_id = wafer.id
  where assignment.id = '${id.stepCompleteAssignment}'
`);
assert.equal(completedStepArchivedState.rows[0].wafer_status, "in_progress");
assert.ok(completedStepArchivedState.rows[0].wafer_archived_at);
assert.equal(completedStepArchivedState.rows[0].assignment_status, "in_progress");
assert.ok(completedStepArchivedState.rows[0].assignment_archived_at);

const completedStepRestoreResult = await db.query(
  `select public.restore_archived_wafer_to_step($1, $2, $3, $4) as restored`,
  [
    id.stepCompleteWafer,
    id.stepCompleteAssignment,
    id.middle,
    id.stepCompleteRestoreMutation
  ]
);
const completedStepRestored = completedStepRestoreResult.rows[0].restored;
assert.equal(completedStepRestored.target_step_id, id.middle);

const completedStepEvents = await db.query(`
  select event_type from public.process_events
  where wafer_id = '${id.stepCompleteWafer}'
  order by event_at
`);
assert.deepEqual(completedStepEvents.rows.map((event) => event.event_type), [
  "wafer_archived",
  "wafer_restored_from_archive"
]);

const reviewedArchiveResult = await db.query(
  `select * from public.archive_completed_wafer_assignments($1::uuid[], $2::uuid[])`,
  [[id.reviewAssignment], [id.reviewMutation]]
);
assert.equal(reviewedArchiveResult.rows.length, 1);

const reviewedArchiveState = await db.query(`
  select wafer.archived_at as wafer_archived_at,
         assignment.archived_at as assignment_archived_at,
         execution.status as execution_status,
         member.status as member_status,
         run.status as run_status,
         decision.decision
  from public.wafers wafer
  join public.wafer_process_assignments assignment on assignment.wafer_id = wafer.id
  join public.step_executions execution on execution.id = '${id.reviewExecution}'
  join public.operation_run_members member on member.id = '${id.reviewMember}'
  join public.operation_runs run on run.id = member.operation_run_id
  join public.checkpoint_decisions decision on decision.attempt_id = '${id.reviewAttempt}'
  where assignment.id = '${id.reviewAssignment}'
`);
assert.ok(reviewedArchiveState.rows[0].wafer_archived_at);
assert.ok(reviewedArchiveState.rows[0].assignment_archived_at);
assert.equal(reviewedArchiveState.rows[0].execution_status, "ready_to_move");
assert.equal(reviewedArchiveState.rows[0].member_status, "completed");
assert.equal(reviewedArchiveState.rows[0].run_status, "completed");
assert.equal(reviewedArchiveState.rows[0].decision, "approved");

console.log("Archive workflow verification passed: completed, approved, and reviewer-approved steps archive with preserved history.");
