import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = {
  submitter: "10000000-0000-4000-8000-000000000001",
  reviewer: "10000000-0000-4000-8000-000000000002",
  project: "10000000-0000-4000-8000-000000000003",
  legacyTemplate: "10000000-0000-4000-8000-000000000004",
  draft: "10000000-0000-4000-8000-000000000005",
  first: "10000000-0000-4000-8000-000000000006",
  second: "10000000-0000-4000-8000-000000000007",
  wafer: "10000000-0000-4000-8000-000000000008",
  assignment: "10000000-0000-4000-8000-000000000009",
  firstExecution: "10000000-0000-4000-8000-000000000010",
  secondExecution: "10000000-0000-4000-8000-000000000011",
  submit1: "10000000-0000-4000-8000-000000000012",
  withdraw1: "10000000-0000-4000-8000-000000000013",
  submit2: "10000000-0000-4000-8000-000000000014",
  approve1: "10000000-0000-4000-8000-000000000015",
  submit3: "10000000-0000-4000-8000-000000000016",
  redo2: "10000000-0000-4000-8000-000000000017",
  submit4: "10000000-0000-4000-8000-000000000018",
  redoFirst: "10000000-0000-4000-8000-000000000019",
  legacyFirst: "10000000-0000-4000-8000-000000000020",
  legacySecond: "10000000-0000-4000-8000-000000000021",
  plannedWafer: "10000000-0000-4000-8000-000000000022",
  failedWafer: "10000000-0000-4000-8000-000000000023",
  completedWafer: "10000000-0000-4000-8000-000000000024",
  plannedAssignment: "10000000-0000-4000-8000-000000000025",
  failedAssignment: "10000000-0000-4000-8000-000000000026",
  completedAssignment: "10000000-0000-4000-8000-000000000027",
  redoWithoutNote: "10000000-0000-4000-8000-000000000028",
  bypassWafer: "10000000-0000-4000-8000-000000000029",
  bypassAssignment: "10000000-0000-4000-8000-000000000030",
  dicingTemplate: "10000000-0000-4000-8000-000000000031",
  dicingStep: "10000000-0000-4000-8000-000000000032",
  postDicingStep: "10000000-0000-4000-8000-000000000033",
  dicingWafer: "10000000-0000-4000-8000-000000000034",
  dicingAssignment: "10000000-0000-4000-8000-000000000035",
  dicingExecution: "10000000-0000-4000-8000-000000000036",
  postDicingExecution: "10000000-0000-4000-8000-000000000037",
  dicingSubmit: "10000000-0000-4000-8000-000000000038",
  dicingApprove: "10000000-0000-4000-8000-000000000039",
  childOne: "10000000-0000-4000-8000-000000000040",
  childTwo: "10000000-0000-4000-8000-000000000041",
  replacementReviewer: "10000000-0000-4000-8000-000000000042",
  recoveryMutation: "10000000-0000-4000-8000-000000000043",
  recoverySubmit: "10000000-0000-4000-8000-000000000044",
  recoveryApprove: "10000000-0000-4000-8000-000000000045",
  dicingBypass: "10000000-0000-4000-8000-000000000046",
  dicingSubset: "10000000-0000-4000-8000-000000000047",
  inactiveWithdraw: "10000000-0000-4000-8000-000000000048",
  roleWafer: "10000000-0000-4000-8000-000000000049",
  roleAssignment: "10000000-0000-4000-8000-000000000050",
  roleExecution: "10000000-0000-4000-8000-000000000051",
  roleFutureExecution: "10000000-0000-4000-8000-000000000052",
  correctionTemplate: "10000000-0000-4000-8000-000000000053",
  correctionFirst: "10000000-0000-4000-8000-000000000054",
  correctionEnd: "10000000-0000-4000-8000-000000000055",
  correctionDisconnected: "10000000-0000-4000-8000-000000000056",
  correctionWafer: "10000000-0000-4000-8000-000000000057",
  correctionAssignment: "10000000-0000-4000-8000-000000000058",
  correctionFirstExecution: "10000000-0000-4000-8000-000000000059",
  correctionEndExecution: "10000000-0000-4000-8000-000000000060",
  correctionDisconnectedExecution: "10000000-0000-4000-8000-000000000061",
  correctionSubmit: "10000000-0000-4000-8000-000000000062",
  correctionApprove: "10000000-0000-4000-8000-000000000063",
  correctionMove: "10000000-0000-4000-8000-000000000064",
  correctionSubmitRedo: "10000000-0000-4000-8000-000000000065",
  correctionRedo: "10000000-0000-4000-8000-000000000066",
  correctionSubmitEnd: "10000000-0000-4000-8000-000000000067",
  correctionWithdraw: "10000000-0000-4000-8000-000000000068",
  correctionSubmitEndAgain: "10000000-0000-4000-8000-000000000069",
  correctionApproveEnd: "10000000-0000-4000-8000-000000000070",
  correctionDicingWafer: "10000000-0000-4000-8000-000000000071",
  correctionDicingAssignment: "10000000-0000-4000-8000-000000000072",
  correctionDicingExecution: "10000000-0000-4000-8000-000000000073",
  correctionDicingFutureExecution: "10000000-0000-4000-8000-000000000074",
  correctionDicingSubmit: "10000000-0000-4000-8000-000000000075",
  correctionDicingApprove: "10000000-0000-4000-8000-000000000076",
  correctionReplacementWafer: "10000000-0000-4000-8000-000000000077",
  routeWafer: "10000000-0000-4000-8000-000000000078",
  routeAssignment: "10000000-0000-4000-8000-000000000079",
  routeFirstExecution: "10000000-0000-4000-8000-000000000080",
  routeEndExecution: "10000000-0000-4000-8000-000000000081",
  routeDisconnectedExecution: "10000000-0000-4000-8000-000000000082",
  routeSubmitForward: "10000000-0000-4000-8000-000000000083",
  routeDecisionForward: "10000000-0000-4000-8000-000000000084",
  routeMoveForward: "10000000-0000-4000-8000-000000000085",
  routeSubmitBack: "10000000-0000-4000-8000-000000000086",
  routeDecisionBack: "10000000-0000-4000-8000-000000000087",
  routeMoveBack: "10000000-0000-4000-8000-000000000088",
  routeSubmitSame: "10000000-0000-4000-8000-000000000089",
  routeDecisionSame: "10000000-0000-4000-8000-000000000090",
  routeMoveSame: "10000000-0000-4000-8000-000000000091",
  routeDicingWafer: "10000000-0000-4000-8000-000000000092",
  routeDicingAssignment: "10000000-0000-4000-8000-000000000093",
  routeDicingExecution: "10000000-0000-4000-8000-000000000094",
  routeDicingFutureExecution: "10000000-0000-4000-8000-000000000095",
  routeDicingSubmit: "10000000-0000-4000-8000-000000000096",
  routeDicingDecision: "10000000-0000-4000-8000-000000000097",
  routeDicingAggregate: "10000000-0000-4000-8000-000000000098",
  routeDicingChildMoveOne: "10000000-0000-4000-8000-000000000099",
  routeDicingChildMoveTwo: "10000000-0000-4000-8000-000000000100",
  anytimeTemplate: "10000000-0000-4000-8000-000000000101",
  anytimeMain: "10000000-0000-4000-8000-000000000102",
  anytimeProcedure: "10000000-0000-4000-8000-000000000103",
  anytimeOtherMain: "10000000-0000-4000-8000-000000000104",
  anytimeWafer: "10000000-0000-4000-8000-000000000105",
  anytimeAssignment: "10000000-0000-4000-8000-000000000106",
  anytimeMainExecution: "10000000-0000-4000-8000-000000000107",
  anytimeMovement: "10000000-0000-4000-8000-000000000108",
  rejectedMainMovement: "10000000-0000-4000-8000-000000000109",
  routeCorrectionWafer: "10000000-0000-4000-8000-000000000110",
  routeCorrectionAssignment: "10000000-0000-4000-8000-000000000111",
  routeCorrectionFirstExecution: "10000000-0000-4000-8000-000000000112",
  routeCorrectionWrongExecution: "10000000-0000-4000-8000-000000000113",
  routeCorrectionTargetExecution: "10000000-0000-4000-8000-000000000114",
  routeCorrectionSubmit: "10000000-0000-4000-8000-000000000115",
  routeCorrectionDecision: "10000000-0000-4000-8000-000000000116",
  routeCorrectionWrongMove: "10000000-0000-4000-8000-000000000117",
  routeCorrectionMove: "10000000-0000-4000-8000-000000000118",
  routeCorrectionPremature: "10000000-0000-4000-8000-000000000119",
  routeSubmitForwardAgain: "10000000-0000-4000-8000-000000000120",
  routeDecisionForwardAgain: "10000000-0000-4000-8000-000000000121",
  routeMoveForwardAgain: "10000000-0000-4000-8000-000000000122",
  routeSubmitBackApproved: "10000000-0000-4000-8000-000000000123",
  routeDecisionBackApproved: "10000000-0000-4000-8000-000000000124",
  routeMoveBackApproved: "10000000-0000-4000-8000-000000000125"
};

await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create type public.user_role as enum ('admin', 'process_engineer', 'researcher', 'viewer');
  create type public.project_member_role as enum ('owner', 'editor', 'viewer');
  create type public.fabrication_status as enum ('planned', 'queued', 'in_progress', 'on_hold', 'completed', 'scrapped');
  create type public.step_status as enum ('pending', 'queued', 'running', 'blocked', 'completed', 'skipped', 'failed');

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('app.actor_id', true), '')::uuid
  $$;

  create table public.profiles (
    id uuid primary key,
    email text not null,
    display_name text,
    role public.user_role not null,
    is_active boolean not null default true
  );
  create table public.projects (
    id uuid primary key,
    owner_id uuid references public.profiles(id),
    name text not null
  );
  create table public.project_members (
    project_id uuid references public.projects(id),
    user_id uuid references public.profiles(id),
    role public.project_member_role not null,
    created_at timestamptz not null default now(),
    primary key (project_id, user_id)
  );
  create table public.process_templates (
    id uuid primary key default gen_random_uuid(),
    owner_project_id uuid references public.projects(id),
    name text not null,
    version text not null default '1.0',
    description text,
    is_active boolean not null default true,
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_project_id, name, version)
  );
  create table public.process_steps (
    id uuid primary key default gen_random_uuid(),
    template_id uuid not null references public.process_templates(id) on delete cascade,
    step_order integer not null,
    name text not null,
    slug text not null,
    process_area text not null,
    node_type text not null default 'procedure',
    canvas_x integer,
    canvas_y integer,
    expected_duration_minutes integer,
    queue_target_minutes integer,
    required_tool_type text,
    requires_recipe boolean not null default false,
    instructions text,
    parameters_schema jsonb not null default '{}'::jsonb,
    revision bigint not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (template_id, step_order),
    unique (template_id, slug)
  );
  create table public.process_step_transitions (
    id uuid primary key default gen_random_uuid(),
    template_id uuid not null references public.process_templates(id),
    from_step_id uuid not null references public.process_steps(id),
    to_step_id uuid not null references public.process_steps(id),
    edge_type text not null default 'flow',
    label text,
    condition jsonb not null default '{}'::jsonb,
    priority integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.wafers (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id),
    wafer_code text not null,
    material_stack text,
    diameter_mm numeric,
    status public.fabrication_status not null default 'queued',
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    unique (project_id, wafer_code)
  );
  create table public.wafer_process_assignments (
    id uuid primary key,
    wafer_id uuid not null references public.wafers(id),
    template_id uuid not null references public.process_templates(id),
    assigned_by uuid references public.profiles(id),
    status public.fabrication_status not null default 'queued',
    assigned_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    current_step_id uuid references public.process_steps(id),
    revision bigint not null default 1
  );
  create table public.step_executions (
    id uuid primary key default gen_random_uuid(),
    assignment_id uuid not null references public.wafer_process_assignments(id),
    wafer_id uuid not null references public.wafers(id),
    process_step_id uuid not null references public.process_steps(id),
    recipe_id uuid,
    tool_id uuid,
    status public.step_status not null default 'pending',
    planned_start_at timestamptz,
    planned_end_at timestamptz,
    queue_started_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    skipped_at timestamptz,
    completed_by uuid references public.profiles(id),
    operator_id uuid references public.profiles(id),
    run_notes text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (assignment_id, process_step_id)
  );
  create table public.process_events (
    id uuid primary key default gen_random_uuid(),
    project_id uuid,
    wafer_id uuid,
    step_execution_id uuid,
    actor_id uuid,
    event_type text not null,
    event_at timestamptz not null default now(),
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    client_mutation_id uuid unique
  );

  create function public.can_manage_process_library() returns boolean language sql stable as $$ select true $$;
  create function public.can_edit_project(target_project_id uuid) returns boolean language sql stable as $$
    select exists (
      select 1 from public.projects project
      where project.id = target_project_id and project.owner_id = auth.uid()
    ) or exists (
      select 1 from public.project_members member
      where member.project_id = target_project_id and member.user_id = auth.uid()
        and member.role in ('owner', 'editor')
    )
  $$;
  create function public.can_access_project(target_project_id uuid) returns boolean language sql stable as $$
    select public.can_edit_project(target_project_id)
  $$;
  create function public.can_access_wafer(target_wafer_id uuid) returns boolean language sql stable as $$
    select exists (
      select 1 from public.wafers wafer
      where wafer.id = target_wafer_id and public.can_access_project(wafer.project_id)
    )
  $$;
  create publication supabase_realtime;

  insert into public.profiles (id, email, display_name, role) values
    ('${id.submitter}', 'submitter@example.test', 'Submitter', 'process_engineer'),
    ('${id.reviewer}', 'reviewer@example.test', 'Reviewer', 'process_engineer'),
    ('${id.replacementReviewer}', 'replacement@example.test', 'Replacement reviewer', 'process_engineer');
  insert into public.projects (id, owner_id, name) values ('${id.project}', '${id.submitter}', 'Test project');
  insert into public.project_members (project_id, user_id, role) values
    ('${id.project}', '${id.submitter}', 'owner'),
    ('${id.project}', '${id.reviewer}', 'editor'),
    ('${id.project}', '${id.replacementReviewer}', 'editor');
  insert into public.process_templates (id, owner_project_id, name, version, created_by)
  values ('${id.legacyTemplate}', '${id.project}', 'Legacy flow', '1.0', '${id.submitter}');
  insert into public.process_steps (id, template_id, step_order, name, slug, process_area) values
    ('${id.legacyFirst}', '${id.legacyTemplate}', 10, 'Legacy first', 'legacy-first', 'work'),
    ('${id.legacySecond}', '${id.legacyTemplate}', 20, 'Legacy second', 'legacy-second', 'work');
  insert into public.wafers (id, project_id, wafer_code, status) values
    ('${id.plannedWafer}', '${id.project}', 'LEGACY-PLANNED', 'planned'),
    ('${id.failedWafer}', '${id.project}', 'LEGACY-FAILED', 'on_hold'),
    ('${id.completedWafer}', '${id.project}', 'LEGACY-COMPLETE', 'completed');
  insert into public.wafer_process_assignments (id, wafer_id, template_id, status) values
    ('${id.plannedAssignment}', '${id.plannedWafer}', '${id.legacyTemplate}', 'planned'),
    ('${id.failedAssignment}', '${id.failedWafer}', '${id.legacyTemplate}', 'on_hold'),
    ('${id.completedAssignment}', '${id.completedWafer}', '${id.legacyTemplate}', 'completed');
  insert into public.step_executions (assignment_id, wafer_id, process_step_id, status) values
    ('${id.plannedAssignment}', '${id.plannedWafer}', '${id.legacyFirst}', 'pending'),
    ('${id.plannedAssignment}', '${id.plannedWafer}', '${id.legacySecond}', 'pending'),
    ('${id.failedAssignment}', '${id.failedWafer}', '${id.legacyFirst}', 'pending'),
    ('${id.failedAssignment}', '${id.failedWafer}', '${id.legacySecond}', 'failed'),
    ('${id.completedAssignment}', '${id.completedWafer}', '${id.legacyFirst}', 'completed'),
    ('${id.completedAssignment}', '${id.completedWafer}', '${id.legacySecond}', 'completed');
`);

for (const migrationName of [
  "202607150001_checkpoint_workflow.sql",
  "202607150002_checkpoint_reviewer_recovery.sql",
  "202607150003_checkpoint_dicing_atomic_review.sql"
]) {
  const migration = await readFile(
    new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
    "utf8"
  );
  await db.exec(migration);
}

const legacy = await db.query(`select lifecycle_status from public.process_templates where id = $1`, [id.legacyTemplate]);
assert.equal(legacy.rows[0].lifecycle_status, "published");
const legacyReviewers = await db.query(
  `select distinct required_reviewer_id from public.process_steps where template_id = $1`,
  [id.legacyTemplate]
);
assert.deepEqual(legacyReviewers.rows, [{ required_reviewer_id: id.submitter }]);
const repairedAssignments = await db.query(
  `select id, current_step_id from public.wafer_process_assignments where id = any($1::uuid[])`,
  [[id.plannedAssignment, id.failedAssignment, id.completedAssignment]]
);
assert.equal(repairedAssignments.rows.find((row) => row.id === id.plannedAssignment).current_step_id, id.legacyFirst);
assert.equal(repairedAssignments.rows.find((row) => row.id === id.failedAssignment).current_step_id, id.legacySecond);
assert.equal(repairedAssignments.rows.find((row) => row.id === id.completedAssignment).current_step_id, id.legacySecond);

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await assert.rejects(
  db.query(
    `insert into public.process_templates (owner_project_id, name, version, created_by, lifecycle_status)
     values ($1, 'Invalid direct publish', '1.0', $2, 'published')`,
    [id.project, id.submitter]
  ),
  /authorized publish action/i
);
const emptyDraft = await db.query(
  `insert into public.process_templates (owner_project_id, name, version, created_by, lifecycle_status)
   values ($1, 'Empty draft', '1.0', $2, 'draft') returning id`,
  [id.project, id.submitter]
);
await assert.rejects(
  db.query(`select id from public.publish_process_template_version($1)`, [emptyDraft.rows[0].id]),
  /at least one active step/i
);
const sharedDraft = await db.query(
  `insert into public.process_templates (name, version, created_by, lifecycle_status)
   values ('Shared non-admin review', '1.0', $1, 'draft') returning id`,
  [id.submitter]
);
await db.query(
  `insert into public.process_steps
   (template_id, step_order, name, slug, process_area, required_reviewer_id)
   values ($1, 10, 'Shared step', 'shared-step', 'work', $2)`,
  [sharedDraft.rows[0].id, id.reviewer]
);
await assert.rejects(
  db.query(`select id from public.publish_process_template_version($1)`, [sharedDraft.rows[0].id]),
  /administrator reviewers/i
);
const terminalDicingDraft = await db.query(
  `insert into public.process_templates (owner_project_id, name, version, created_by, lifecycle_status)
   values ($1, 'Terminal dicing', '1.0', $2, 'draft') returning id`,
  [id.project, id.submitter]
);
await db.query(
  `insert into public.process_steps
   (template_id, step_order, name, slug, process_area, required_reviewer_id)
   values ($1, 10, 'Dicing', 'dicing', 'singulation', $2)`,
  [terminalDicingDraft.rows[0].id, id.reviewer]
);
await assert.rejects(
  db.query(`select id from public.publish_process_template_version($1)`, [terminalDicingDraft.rows[0].id]),
  /later active step/i
);
await db.query(
  `insert into public.process_templates (id, owner_project_id, name, version, created_by, lifecycle_status)
   values ($1, $2, 'Checkpoint flow', '2.0', $3, 'draft')`,
  [id.draft, id.project, id.submitter]
);
await db.query(
  `insert into public.process_steps
   (id, template_id, step_order, name, slug, process_area, node_type, required_reviewer_id)
   values ($1, $2, 10, 'First', 'first', 'work', 'start', $3),
          ($4, $2, 20, 'Second', 'second', 'work', 'end', $3)`,
  [id.first, id.draft, id.reviewer, id.second]
);
await db.query(`select id from public.publish_process_template_version($1)`, [id.draft]);
await assert.rejects(
  db.query(`update public.process_steps set name = 'Changed' where id = $1`, [id.first]),
  /immutable/i
);

await db.exec(`
  grant usage on schema public to authenticated;
  grant select, insert, update on public.wafers, public.wafer_process_assignments, public.step_executions to authenticated;
`);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await db.exec(`set role authenticated`);
await db.query(
  `insert into public.wafers (id, project_id, wafer_code) values ($1, $2, 'ROLE-CHECK')`,
  [id.roleWafer, id.project]
);
await db.query(
  `insert into public.wafer_process_assignments
   (id, wafer_id, template_id, assigned_by, status, current_step_id)
   values ($1, $2, $3, $4, 'queued', $5)`,
  [id.roleAssignment, id.roleWafer, id.draft, id.submitter, id.first]
);
await db.query(
  `insert into public.step_executions
   (id, assignment_id, wafer_id, process_step_id, status, queue_started_at)
   values ($1, $2, $3, $4, 'queued', now()), ($5, $2, $3, $6, 'pending', null)`,
  [id.roleExecution, id.roleAssignment, id.roleWafer, id.first, id.roleFutureExecution, id.second]
);
await assert.rejects(
  db.query(
    `update public.wafer_process_assignments set current_step_id = $1 where id = $2`,
    [id.second, id.roleAssignment]
  ),
  /explicit checkpoint decision/i
);
await assert.rejects(
  db.query(`update public.step_executions set status = 'running' where id = $1`, [id.roleFutureExecution]),
  /only the assignment current step/i
);
await db.exec(`reset role`);

const duplicated = await db.query(
  `select id, lifecycle_status from public.duplicate_process_template_version($1, '2.1', null)`,
  [id.draft]
);
assert.equal(duplicated.rows[0].lifecycle_status, "draft");
const clonedSteps = await db.query(
  `select id from public.process_steps where template_id = $1 and archived_at is null order by step_order`,
  [duplicated.rows[0].id]
);
assert.equal(clonedSteps.rows.length, 2);
await assert.rejects(
  db.query(
    `update public.process_templates set lifecycle_status = 'published' where id = $1`,
    [duplicated.rows[0].id]
  ),
  /authorized publish action/i
);
await assert.rejects(
  db.query(`update public.process_steps set template_id = $1 where id = $2`, [duplicated.rows[0].id, id.first]),
  /immutable/i
);
const insertedDraftStep = await db.query(
  `select id from public.create_ordered_draft_process_step(
    $1, 2, 'Inserted', 'inserted', 'work', $2, null, null, null, false, null, '{}'::jsonb, null, null
  )`,
  [duplicated.rows[0].id, id.reviewer]
);
await db.query(
  `select id from public.normalize_draft_process_step_order($1, $2, 1)`,
  [duplicated.rows[0].id, insertedDraftStep.rows[0].id]
);
const firstDraftStep = await db.query(
  `select id, step_order from public.process_steps where template_id = $1 and archived_at is null order by step_order limit 1`,
  [duplicated.rows[0].id]
);
assert.equal(firstDraftStep.rows[0].id, insertedDraftStep.rows[0].id);
assert.equal(firstDraftStep.rows[0].step_order, 10);
await db.query(`select id from public.archive_draft_process_step($1)`, [insertedDraftStep.rows[0].id]);
const remainingDraftSteps = await db.query(
  `select count(*)::integer as count from public.process_steps where template_id = $1 and archived_at is null`,
  [duplicated.rows[0].id]
);
assert.equal(remainingDraftSteps.rows[0].count, 2);

await db.query(`insert into public.wafers (id, project_id, wafer_code) values ($1, $2, 'W-1')`, [id.wafer, id.project]);
await db.query(
  `insert into public.wafer_process_assignments
   (id, wafer_id, template_id, assigned_by, status, current_step_id)
   values ($1, $2, $3, $4, 'queued', $5)`,
  [id.assignment, id.wafer, id.draft, id.submitter, id.first]
);
await assert.rejects(
  db.query(`update public.wafer_process_assignments set template_id = $1 where id = $2`, [id.legacyTemplate, id.assignment]),
  /pinned|identity is immutable/i
);
await assert.rejects(
  db.query(`update public.wafer_process_assignments set wafer_id = $1 where id = $2`, [id.plannedWafer, id.assignment]),
  /identity is immutable/i
);
await assert.rejects(
  db.query(`update public.wafer_process_assignments set completed_at = now() where id = $1`, [id.assignment]),
  /checkpoint decision/i
);
await db.query(
  `insert into public.step_executions
   (id, assignment_id, wafer_id, process_step_id, status, queue_started_at)
   values ($1, $2, $3, $4, 'queued', now()), ($5, $2, $3, $6, 'pending', null)`,
  [id.firstExecution, id.assignment, id.wafer, id.first, id.secondExecution, id.second]
);
await assert.rejects(
  db.query(`update public.step_executions set status = 'running' where id = $1`, [id.secondExecution]),
  /only the assignment current step/i
);

const attempt1 = await db.query(
  `select id, attempt_number, started_at_snapshot from public.submit_step_checkpoint($1, $2, 'ready', '{}'::jsonb)`,
  [id.firstExecution, id.submit1]
);
const attempt1Retry = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'ready', '{}'::jsonb)`,
  [id.firstExecution, id.submit1]
);
assert.equal(attempt1.rows[0].id, attempt1Retry.rows[0].id);
assert.equal(attempt1.rows[0].attempt_number, 1);
assert.ok(attempt1.rows[0].started_at_snapshot);

await db.query(`update public.profiles set is_active = false where id = $1`, [id.submitter]);
await assert.rejects(
  db.query(
    `select id from public.withdraw_step_checkpoint_submission($1, $2, 'inactive retry')`,
    [attempt1.rows[0].id, id.inactiveWithdraw]
  ),
  /active account/i
);
await db.query(`update public.profiles set is_active = true where id = $1`, [id.submitter]);
await db.query(
  `select id from public.withdraw_step_checkpoint_submission($1, $2, 'more work')`,
  [attempt1.rows[0].id, id.withdraw1]
);
const restored = await db.query(`select status from public.step_executions where id = $1`, [id.firstExecution]);
assert.equal(restored.rows[0].status, "queued");

const attempt2 = await db.query(
  `select id, attempt_number from public.submit_step_checkpoint($1, $2, null, '{}'::jsonb)`,
  [id.firstExecution, id.submit2]
);
assert.equal(attempt2.rows[0].attempt_number, 2);

await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(
  `select id from public.review_step_checkpoint($1, 'approved', $2, 'approved')`,
  [attempt2.rows[0].id, id.approve1]
);
const afterApproval = await db.query(
  `select current_step_id, status from public.wafer_process_assignments where id = $1`,
  [id.assignment]
);
assert.equal(afterApproval.rows[0].current_step_id, id.second);
assert.equal(afterApproval.rows[0].status, "in_progress");

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
const attempt3 = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, null, '{}'::jsonb)`,
  [id.secondExecution, id.submit3]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await assert.rejects(
  db.query(`select id from public.review_step_checkpoint($1, 'redo', $2, null)`, [
    attempt3.rows[0].id,
    id.redoWithoutNote
  ]),
  /requires a note/i
);
await db.query(
  `select id from public.review_step_checkpoint($1, 'redo', $2, 'redo previous')`,
  [attempt3.rows[0].id, id.redo2]
);
const afterRedo = await db.query(
  `select current_step_id from public.wafer_process_assignments where id = $1`,
  [id.assignment]
);
const redoStatuses = await db.query(
  `select process_step_id, status from public.step_executions where assignment_id = $1 order by process_step_id`,
  [id.assignment]
);
assert.equal(afterRedo.rows[0].current_step_id, id.first);
assert.equal(redoStatuses.rows.find((row) => row.process_step_id === id.first).status, "redo_required");
assert.equal(redoStatuses.rows.find((row) => row.process_step_id === id.second).status, "pending");

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
const attempt4 = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, null, '{}'::jsonb)`,
  [id.firstExecution, id.submit4]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(
  `select id from public.review_step_checkpoint($1, 'redo', $2, 'redo first')`,
  [attempt4.rows[0].id, id.redoFirst]
);
const firstRedo = await db.query(`select status from public.step_executions where id = $1`, [id.firstExecution]);
assert.equal(firstRedo.rows[0].status, "redo_required");

await assert.rejects(
  db.query(`update public.wafer_process_assignments set current_step_id = $1 where id = $2`, [id.second, id.assignment]),
  /explicit checkpoint decision/i
);
await assert.rejects(
  db.query(`update public.step_executions set status = 'completed' where id = $1`, [id.firstExecution]),
  /explicit checkpoint action/i
);

await assert.rejects(
  db.query(`update public.checkpoint_decisions set decision_notes = 'rewrite' where client_mutation_id = $1`, [id.redoFirst]),
  /append-only/i
);

const persistedAttemptSnapshot = await db.query(
  `select started_at_snapshot from public.process_step_attempts where id = $1`,
  [attempt1.rows[0].id]
);
assert.equal(
  new Date(persistedAttemptSnapshot.rows[0].started_at_snapshot).toISOString(),
  new Date(attempt1.rows[0].started_at_snapshot).toISOString()
);

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await db.query(
  `insert into public.wafers (id, project_id, wafer_code) values ($1, $2, 'BYPASS')`,
  [id.bypassWafer, id.project]
);
await assert.rejects(
  db.query(
    `insert into public.wafer_process_assignments
     (id, wafer_id, template_id, assigned_by, status, current_step_id, completed_at)
     values ($1, $2, $3, $4, 'completed', $5, now())`,
    [id.bypassAssignment, id.bypassWafer, id.draft, id.submitter, id.second]
  ),
  /begin at the first ordered step|cannot bypass checkpoint progression/i
);
await db.query(
  `insert into public.wafer_process_assignments
   (id, wafer_id, template_id, assigned_by, status, current_step_id)
   values ($1, $2, $3, $4, 'queued', $5)`,
  [id.bypassAssignment, id.bypassWafer, id.draft, id.submitter, id.first]
);
await assert.rejects(
  db.query(
    `insert into public.step_executions
     (assignment_id, wafer_id, process_step_id, status, completed_at)
     values ($1, $2, $3, 'completed', now())`,
    [id.bypassAssignment, id.bypassWafer, id.first]
  ),
  /must begin queued/i
);

await db.query(
  `insert into public.process_templates (id, owner_project_id, name, version, created_by, lifecycle_status)
   values ($1, $2, 'Dicing checkpoint flow', '1.0', $3, 'draft')`,
  [id.dicingTemplate, id.project, id.submitter]
);
await db.query(
  `insert into public.process_steps
   (id, template_id, step_order, name, slug, process_area, node_type, required_reviewer_id)
   values ($1, $2, 10, 'Dicing', 'dicing', 'singulation', 'start', $3),
          ($4, $2, 20, 'Post-dicing inspection', 'post-dicing-inspection', 'inspection', 'end', $3)`,
  [id.dicingStep, id.dicingTemplate, id.reviewer, id.postDicingStep]
);
await db.query(`select id from public.publish_process_template_version($1)`, [id.dicingTemplate]);
await db.query(
  `insert into public.wafers (id, project_id, wafer_code, status, metadata)
   values ($1, $2, 'DICE-PARENT', 'queued', jsonb_build_object(
     'die_labels', jsonb_build_array('DICE-PARENT_1', 'DICE-PARENT_2')
   ))`,
  [id.dicingWafer, id.project]
);
await db.query(
  `insert into public.wafer_process_assignments
   (id, wafer_id, template_id, assigned_by, status, current_step_id)
   values ($1, $2, $3, $4, 'queued', $5)`,
  [id.dicingAssignment, id.dicingWafer, id.dicingTemplate, id.submitter, id.dicingStep]
);
await db.query(
  `insert into public.step_executions
   (id, assignment_id, wafer_id, process_step_id, status, queue_started_at)
   values ($1, $2, $3, $4, 'queued', now()), ($5, $2, $3, $6, 'pending', null)`,
  [
    id.dicingExecution,
    id.dicingAssignment,
    id.dicingWafer,
    id.dicingStep,
    id.postDicingExecution,
    id.postDicingStep
  ]
);
const dicingAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'ready to dice', '{}'::jsonb)`,
  [id.dicingExecution, id.dicingSubmit]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await assert.rejects(
  db.query(
    `select id from public.review_step_checkpoint($1, 'approved', $2, 'bypass split')`,
    [dicingAttempt.rows[0].id, id.dicingBypass]
  ),
  /atomic child handoff/i
);
await assert.rejects(
  db.query(
    `select id from public.review_dicing_step_checkpoint(
      $1,
      $2,
      'invalid subset',
      jsonb_build_array(
        jsonb_build_object('wafer_code', 'DICE-PARENT_1', 'die_label', 'DICE-PARENT_1')
      )
    )`,
    [dicingAttempt.rows[0].id, id.dicingSubset]
  ),
  /exactly match the parent wafer die configuration/i
);
const dicingDecision = await db.query(
  `select id from public.review_dicing_step_checkpoint(
    $1,
    $2,
    'approved for split',
    jsonb_build_array(
      jsonb_build_object('wafer_code', 'DICE-PARENT_1', 'die_label', 'DICE-PARENT_1'),
      jsonb_build_object('wafer_code', 'DICE-PARENT_2', 'die_label', 'DICE-PARENT_2')
    )
  )`,
  [dicingAttempt.rows[0].id, id.dicingApprove]
);
const childState = await db.query(
  `select assignment.id as assignment_id, execution.id as execution_id, wafer.id as wafer_id
   from public.wafers wafer
   join public.wafer_process_assignments assignment on assignment.wafer_id = wafer.id
   join public.step_executions execution on execution.assignment_id = assignment.id
     and execution.process_step_id = $1
   where wafer.project_id = $2 and wafer.wafer_code = 'DICE-PARENT_1'`,
  [id.postDicingStep, id.project]
);
await db.query(
  `update public.wafer_process_assignments set status = 'in_progress' where id = $1`,
  [childState.rows[0].assignment_id]
);
await db.query(
  `update public.step_executions set status = 'running' where id = $1`,
  [childState.rows[0].execution_id]
);
await db.query(
  `update public.wafers set status = 'in_progress' where id = $1`,
  [childState.rows[0].wafer_id]
);
const dicingRetry = await db.query(
  `select id from public.review_dicing_step_checkpoint(
    $1,
    $2,
    'approved for split',
    jsonb_build_array(
      jsonb_build_object('wafer_code', 'DICE-PARENT_1', 'die_label', 'DICE-PARENT_1'),
      jsonb_build_object('wafer_code', 'DICE-PARENT_2', 'die_label', 'DICE-PARENT_2')
    )
  )`,
  [dicingAttempt.rows[0].id, id.dicingApprove]
);
assert.equal(dicingRetry.rows[0].id, dicingDecision.rows[0].id);
const dicingState = await db.query(
  `select
     (select status from public.wafer_process_assignments where id = $1) as parent_status,
     (select status from public.step_executions where id = $2) as parent_successor_status,
     (select count(*)::integer from public.wafer_process_assignments assignment
       join public.wafers wafer on wafer.id = assignment.wafer_id
       where wafer.wafer_code in ('DICE-PARENT_1', 'DICE-PARENT_2') and assignment.template_id = $3) as child_assignments,
     (select count(*)::integer from public.step_executions execution
       join public.wafer_process_assignments assignment on assignment.id = execution.assignment_id
       join public.wafers wafer on wafer.id = assignment.wafer_id
       where wafer.wafer_code in ('DICE-PARENT_1', 'DICE-PARENT_2') and assignment.template_id = $3) as child_executions,
     (select status from public.wafer_process_assignments where id = $4) as progressed_child_status,
     (select status from public.step_executions where id = $5) as progressed_child_execution_status,
     (select count(*)::integer from public.process_events where client_mutation_id = $6) as dicing_events`,
  [
    id.dicingAssignment,
    id.postDicingExecution,
    id.dicingTemplate,
    childState.rows[0].assignment_id,
    childState.rows[0].execution_id,
    dicingDecision.rows[0].id
  ]
);
assert.deepEqual(dicingState.rows[0], {
  parent_status: "completed",
  parent_successor_status: "pending",
  child_assignments: 2,
  child_executions: 2,
  progressed_child_status: "in_progress",
  progressed_child_execution_status: "running",
  dicing_events: 1
});

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
const recoveryAttempt = await db.query(
  `select id, reviewer_id_snapshot from public.submit_step_checkpoint($1, $2, 'recovery review', '{}'::jsonb)`,
  [id.firstExecution, id.recoverySubmit]
);
assert.equal(recoveryAttempt.rows[0].reviewer_id_snapshot, id.reviewer);
await db.query(`update public.profiles set is_active = false where id = $1`, [id.reviewer]);
const recovery = await db.query(
  `select id, new_reviewer_id from public.reassign_unavailable_checkpoint_reviewer($1, $2, $3, 'Prior reviewer left the project')`,
  [id.first, id.replacementReviewer, id.recoveryMutation]
);
const recoveryRetry = await db.query(
  `select id from public.reassign_unavailable_checkpoint_reviewer($1, $2, $3, 'Prior reviewer left the project')`,
  [id.first, id.replacementReviewer, id.recoveryMutation]
);
assert.equal(recovery.rows[0].id, recoveryRetry.rows[0].id);
assert.equal(recovery.rows[0].new_reviewer_id, id.replacementReviewer);
await assert.rejects(
  db.query(`update public.process_steps set required_reviewer_id = $1 where id = $2`, [id.submitter, id.first]),
  /immutable|audited reviewer recovery/i
);
await assert.rejects(
  db.query(`update public.checkpoint_reviewer_reassignments set reason = 'rewritten' where id = $1`, [recovery.rows[0].id]),
  /append-only/i
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.replacementReviewer]);
const recoveryDecision = await db.query(
  `select id, decided_by from public.review_step_checkpoint($1, 'approved', $2, 'reviewed after handoff')`,
  [recoveryAttempt.rows[0].id, id.recoveryApprove]
);
assert.equal(recoveryDecision.rows[0].decided_by, id.replacementReviewer);
const recoveredStep = await db.query(
  `select required_reviewer_id from public.process_steps where id = $1`,
  [id.first]
);
assert.equal(recoveredStep.rows[0].required_reviewer_id, id.replacementReviewer);
await db.exec(`set role authenticated`);
const roleHistoryRead = await db.query(
  `select count(*)::integer as count from public.checkpoint_reviewer_reassignments where id = $1`,
  [recovery.rows[0].id]
);
assert.equal(roleHistoryRead.rows[0].count, 1);
await db.exec(`reset role`);

const correctiveMigration = await readFile(
  new URL("../supabase/migrations/202607150004_restore_graph_checkpoint_phases.sql", import.meta.url),
  "utf8"
);
await db.exec(correctiveMigration);

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await db.query(`update public.profiles set is_active = true where id = $1`, [id.reviewer]);
await db.query(`update public.process_steps set name = 'First restored' where id = $1`, [id.first]);
const restoredGraphMutation = await db.query(`select name from public.process_steps where id = $1`, [id.first]);
assert.equal(restoredGraphMutation.rows[0].name, "First restored");

await db.query(
  `insert into public.process_templates (id, owner_project_id, name, version, created_by)
   values ($1, $2, 'Corrected graph checkpoints', '1.0', $3)`,
  [id.correctionTemplate, id.project, id.submitter]
);
await db.query(
  `insert into public.process_steps
   (id, template_id, step_order, name, slug, process_area, node_type, required_reviewer_id)
   values ($1, $2, 10, 'Beginning work', 'beginning-work', 'work', 'start', $3),
          ($4, $2, 20, 'Final checkpoint', 'final-checkpoint', 'work', 'end', $3),
          ($5, $2, 30, 'Disconnected inspection', 'disconnected-inspection', 'inspection', 'procedure', null)`,
  [id.correctionFirst, id.correctionTemplate, id.reviewer, id.correctionEnd, id.correctionDisconnected]
);
await db.query(`insert into public.wafers (id, project_id, wafer_code) values ($1, $2, 'CORRECTED-1')`, [id.correctionWafer, id.project]);
await db.query(
  `insert into public.wafer_process_assignments
   (id, wafer_id, template_id, assigned_by, status, current_step_id)
   values ($1, $2, $3, $4, 'queued', $5)`,
  [id.correctionAssignment, id.correctionWafer, id.correctionTemplate, id.submitter, id.correctionFirst]
);
await db.query(
  `insert into public.step_executions
   (id, assignment_id, wafer_id, process_step_id, status, queue_started_at)
   values ($1, $2, $3, $4, 'queued', now()),
          ($5, $2, $3, $6, 'pending', null),
          ($7, $2, $3, $8, 'pending', null)`,
  [
    id.correctionFirstExecution,
    id.correctionAssignment,
    id.correctionWafer,
    id.correctionFirst,
    id.correctionEndExecution,
    id.correctionEnd,
    id.correctionDisconnectedExecution,
    id.correctionDisconnected
  ]
);
await db.query(`select id from public.assign_process_step_checkpoint_reviewer($1, $2)`, [
  id.correctionDisconnected,
  id.reviewer
]);
await assert.rejects(
  db.query(`select public.move_approved_checkpoint_assignment($1, $2, $3, 'premature')`, [
    id.correctionAssignment,
    id.correctionDisconnected,
    id.correctionMove
  ]),
  /approved before the wafer can move/i
);
const correctedAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'work complete', '{}'::jsonb)`,
  [id.correctionFirstExecution, id.correctionSubmit]
);
await assert.rejects(
  db.query(`select id from public.review_step_checkpoint($1, 'approved', $2, 'self review', null)`, [
    correctedAttempt.rows[0].id,
    id.correctionApprove
  ]),
  /assigned checkpoint reviewer/i
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(`select id from public.review_step_checkpoint($1, 'approved', $2, 'approved', null)`, [
  correctedAttempt.rows[0].id,
  id.correctionApprove
]);
const correctedApproved = await db.query(
  `select assignment.current_step_id, execution.status
   from public.wafer_process_assignments assignment
   join public.step_executions execution on execution.id = $2
   where assignment.id = $1`,
  [id.correctionAssignment, id.correctionFirstExecution]
);
assert.deepEqual(correctedApproved.rows[0], {
  current_step_id: id.correctionFirst,
  status: "ready_to_move"
});

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await db.query(`select public.move_approved_checkpoint_assignment($1, $2, $3, 'move without graph edge')`, [
  id.correctionAssignment,
  id.correctionDisconnected,
  id.correctionMove
]);
const disconnectedMove = await db.query(
  `select assignment.current_step_id, source.status as source_status, destination.status as destination_status
   from public.wafer_process_assignments assignment
   join public.step_executions source on source.id = $2
   join public.step_executions destination on destination.id = $3
   where assignment.id = $1`,
  [id.correctionAssignment, id.correctionFirstExecution, id.correctionDisconnectedExecution]
);
assert.deepEqual(disconnectedMove.rows[0], {
  current_step_id: id.correctionDisconnected,
  source_status: "completed",
  destination_status: "queued"
});

const disconnectedAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'inspect complete', '{}'::jsonb)`,
  [id.correctionDisconnectedExecution, id.correctionSubmitRedo]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(`select id from public.review_step_checkpoint($1, 'redo', $2, 'repeat final checkpoint', $3)`, [
  disconnectedAttempt.rows[0].id,
  id.correctionRedo,
  id.correctionEnd
]);
const redoDestination = await db.query(
  `select assignment.current_step_id, destination.status
   from public.wafer_process_assignments assignment
   join public.step_executions destination on destination.id = $2
   where assignment.id = $1`,
  [id.correctionAssignment, id.correctionEndExecution]
);
assert.deepEqual(redoDestination.rows[0], { current_step_id: id.correctionEnd, status: "redo_required" });

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
const endAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'ready for final review', '{}'::jsonb)`,
  [id.correctionEndExecution, id.correctionSubmitEnd]
);
await db.query(`select id from public.withdraw_step_checkpoint_submission($1, $2, 'one more check')`, [
  endAttempt.rows[0].id,
  id.correctionWithdraw
]);
const afterCorrectionWithdraw = await db.query(`select status from public.step_executions where id = $1`, [id.correctionEndExecution]);
assert.equal(afterCorrectionWithdraw.rows[0].status, "redo_required");
const endAttemptAgain = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'final work complete', '{}'::jsonb)`,
  [id.correctionEndExecution, id.correctionSubmitEndAgain]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(`select id from public.review_step_checkpoint($1, 'approved', $2, 'final approved', null)`, [
  endAttemptAgain.rows[0].id,
  id.correctionApproveEnd
]);
const completedCorrection = await db.query(`select status from public.wafer_process_assignments where id = $1`, [id.correctionAssignment]);
assert.equal(completedCorrection.rows[0].status, "completed");

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await db.query(
  `insert into public.wafers (id, project_id, wafer_code, metadata)
   values ($1, $2, 'DICE-CORRECTED', jsonb_build_object(
     'die_labels', jsonb_build_array('DICE-CORRECTED_1', 'DICE-CORRECTED_2')
   ))`,
  [id.correctionDicingWafer, id.project]
);
await db.query(
  `insert into public.wafer_process_assignments
   (id, wafer_id, template_id, assigned_by, status, current_step_id)
   values ($1, $2, $3, $4, 'queued', $5)`,
  [id.correctionDicingAssignment, id.correctionDicingWafer, id.dicingTemplate, id.submitter, id.dicingStep]
);
await db.query(
  `insert into public.step_executions
   (id, assignment_id, wafer_id, process_step_id, status, queue_started_at)
   values ($1, $2, $3, $4, 'queued', now()), ($5, $2, $3, $6, 'pending', null)`,
  [
    id.correctionDicingExecution,
    id.correctionDicingAssignment,
    id.correctionDicingWafer,
    id.dicingStep,
    id.correctionDicingFutureExecution,
    id.postDicingStep
  ]
);
const correctedDicingAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'ready to split', '{}'::jsonb)`,
  [id.correctionDicingExecution, id.correctionDicingSubmit]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(
  `select id from public.review_dicing_step_checkpoint(
    $1, $2, 'split approved',
    jsonb_build_array(
      jsonb_build_object('wafer_code', 'DICE-CORRECTED_1', 'die_label', 'DICE-CORRECTED_1'),
      jsonb_build_object('wafer_code', 'DICE-CORRECTED_2', 'die_label', 'DICE-CORRECTED_2')
    )
  )`,
  [correctedDicingAttempt.rows[0].id, id.correctionDicingApprove]
);
const correctedChildren = await db.query(
  `select assignment.current_step_id, execution.status
   from public.wafers child
   join public.wafer_process_assignments assignment on assignment.wafer_id = child.id
   join public.step_executions execution on execution.assignment_id = assignment.id
     and execution.process_step_id = assignment.current_step_id
   where child.metadata ->> 'parent_wafer_id' = $1
   order by child.wafer_code`,
  [id.correctionDicingWafer]
);
assert.equal(correctedChildren.rows.length, 2);
assert.ok(correctedChildren.rows.every((row) => row.current_step_id === id.dicingStep && row.status === "ready_to_move"));

const softDeleteMigration = await readFile(
  new URL("../supabase/migrations/202607150005_soft_delete_checkpoint_wafers.sql", import.meta.url),
  "utf8"
);
await db.exec(softDeleteMigration);
const uniqueSoftDeleteTombstoneMigration = await readFile(
  new URL("../supabase/migrations/202607150006_unique_soft_delete_wafer_tombstones.sql", import.meta.url),
  "utf8"
);
await db.exec(uniqueSoftDeleteTombstoneMigration);

const reviewerRouteMigration = await readFile(
  new URL("../supabase/migrations/202607150007_reviewer_routes_completed_wafers.sql", import.meta.url),
  "utf8"
);
await db.exec(reviewerRouteMigration);
const anytimeModeMigration = await readFile(
  new URL("../supabase/migrations/202607160001_anytime_process_steps.sql", import.meta.url),
  "utf8"
);
await db.exec(anytimeModeMigration);
const anytimeDetourMigration = await readFile(
  new URL("../supabase/migrations/202607160002_allow_beginning_anytime_detours.sql", import.meta.url),
  "utf8"
);
await db.exec(anytimeDetourMigration);
const checkpointRouteCorrectionMigration = await readFile(
  new URL("../supabase/migrations/202607170001_correct_beginning_checkpoint_routes.sql", import.meta.url),
  "utf8"
);
await db.exec(checkpointRouteCorrectionMigration);

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await db.query(
  `insert into public.wafers (id, project_id, wafer_code)
   values ($1, $2, 'ROUTE-CORRECTION')`,
  [id.routeCorrectionWafer, id.project]
);
await db.query(
  `insert into public.wafer_process_assignments
   (id, wafer_id, template_id, assigned_by, status, current_step_id)
   values ($1, $2, $3, $4, 'queued', $5)`,
  [
    id.routeCorrectionAssignment,
    id.routeCorrectionWafer,
    id.correctionTemplate,
    id.submitter,
    id.correctionFirst
  ]
);
await db.query(
  `insert into public.step_executions
   (id, assignment_id, wafer_id, process_step_id, status, queue_started_at)
   values ($1, $2, $3, $4, 'queued', now()),
          ($5, $2, $3, $6, 'pending', null),
          ($7, $2, $3, $8, 'pending', null)`,
  [
    id.routeCorrectionFirstExecution,
    id.routeCorrectionAssignment,
    id.routeCorrectionWafer,
    id.correctionFirst,
    id.routeCorrectionWrongExecution,
    id.correctionDisconnected,
    id.routeCorrectionTargetExecution,
    id.correctionEnd
  ]
);
await db.exec(`set role authenticated`);
await assert.rejects(
  db.query(
    `select public.correct_checkpoint_route_assignment($1, $2, $3, 'no checkpoint route yet')`,
    [id.routeCorrectionAssignment, id.correctionEnd, id.routeCorrectionPremature]
  ),
  /not created by a checkpoint route/i
);
await db.exec(`reset role`);

const routeCorrectionAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'route to the wrong step', '{}'::jsonb)`,
  [id.routeCorrectionFirstExecution, id.routeCorrectionSubmit]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(
  `select public.route_checkpoint_submission($1, $2, $3, $4, 'wrong destination', '[]'::jsonb)`,
  [
    routeCorrectionAttempt.rows[0].id,
    id.correctionDisconnected,
    id.routeCorrectionDecision,
    id.routeCorrectionWrongMove
  ]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await db.exec(`set role authenticated`);
await db.query(
  `select public.correct_checkpoint_route_assignment($1, $2, $3, 'replace the wrong destination')`,
  [id.routeCorrectionAssignment, id.correctionEnd, id.routeCorrectionMove]
);
await db.query(
  `select public.correct_checkpoint_route_assignment($1, $2, $3, 'replace the wrong destination')`,
  [id.routeCorrectionAssignment, id.correctionEnd, id.routeCorrectionMove]
);
await db.exec(`reset role`);

const correctedBeginningRoute = await db.query(
  `select assignment.current_step_id,
          wrong_execution.status as wrong_status,
          target_execution.status as target_status,
          decision.decision,
          correction.metadata ->> 'corrected_event_id' = wrong_event.id::text as corrected_wrong_event,
          correction.metadata ->> 'route_decision' as route_decision,
          (select count(*)::integer from public.process_events event
           where event.metadata ->> 'assignment_id' = assignment.id::text
             and event.event_type = 'checkpoint_step_entered') as route_event_count
   from public.wafer_process_assignments assignment
   join public.step_executions wrong_execution on wrong_execution.id = $2
   join public.step_executions target_execution on target_execution.id = $3
   join public.checkpoint_decisions decision on decision.client_mutation_id = $4
   join public.process_events correction on correction.client_mutation_id = $5
   join public.process_events wrong_event on wrong_event.client_mutation_id = $6
   where assignment.id = $1`,
  [
    id.routeCorrectionAssignment,
    id.routeCorrectionWrongExecution,
    id.routeCorrectionTargetExecution,
    id.routeCorrectionDecision,
    id.routeCorrectionMove,
    id.routeCorrectionWrongMove
  ]
);
assert.deepEqual(correctedBeginningRoute.rows[0], {
  current_step_id: id.correctionEnd,
  wrong_status: "pending",
  target_status: "queued",
  decision: "approved",
  corrected_wrong_event: true,
  route_decision: "approved",
  route_event_count: 2
});

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await db.query(`insert into public.wafers (id, project_id, wafer_code) values ($1, $2, 'ROUTED-1')`, [id.routeWafer, id.project]);
await db.query(
  `insert into public.wafer_process_assignments
   (id, wafer_id, template_id, assigned_by, status, current_step_id)
   values ($1, $2, $3, $4, 'queued', $5)`,
  [id.routeAssignment, id.routeWafer, id.correctionTemplate, id.submitter, id.correctionFirst]
);
await db.query(
  `insert into public.step_executions
   (id, assignment_id, wafer_id, process_step_id, status, queue_started_at)
   values ($1, $2, $3, $4, 'queued', now()),
          ($5, $2, $3, $6, 'pending', null),
          ($7, $2, $3, $8, 'pending', null)`,
  [
    id.routeFirstExecution,
    id.routeAssignment,
    id.routeWafer,
    id.correctionFirst,
    id.routeEndExecution,
    id.correctionEnd,
    id.routeDisconnectedExecution,
    id.correctionDisconnected
  ]
);
const routeForwardAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'route forward', '{}'::jsonb)`,
  [id.routeFirstExecution, id.routeSubmitForward]
);
await assert.rejects(
  db.query(
    `select public.route_checkpoint_submission($1, $2, $3, $4, 'unauthorized route', '[]'::jsonb)`,
    [routeForwardAttempt.rows[0].id, id.correctionDisconnected, id.routeDecisionForward, id.routeMoveForward]
  ),
  /assigned checkpoint reviewer/i
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(
  `select public.route_checkpoint_submission($1, $2, $3, $4, 'approved and routed forward', '[]'::jsonb)`,
  [routeForwardAttempt.rows[0].id, id.correctionDisconnected, id.routeDecisionForward, id.routeMoveForward]
);
await db.query(
  `select public.route_checkpoint_submission($1, $2, $3, $4, 'approved and routed forward', '[]'::jsonb)`,
  [routeForwardAttempt.rows[0].id, id.correctionDisconnected, id.routeDecisionForward, id.routeMoveForward]
);
const forwardRoute = await db.query(
  `select assignment.current_step_id, source.status as source_status, destination.status as destination_status,
          decision.decision, count(event.id)::integer as movement_events
   from public.wafer_process_assignments assignment
   join public.step_executions source on source.id = $2
   join public.step_executions destination on destination.id = $3
   join public.checkpoint_decisions decision on decision.client_mutation_id = $4
   left join public.process_events event on event.client_mutation_id = $5
   where assignment.id = $1
   group by assignment.current_step_id, source.status, destination.status, decision.decision`,
  [id.routeAssignment, id.routeFirstExecution, id.routeDisconnectedExecution, id.routeDecisionForward, id.routeMoveForward]
);
assert.deepEqual(forwardRoute.rows[0], {
  current_step_id: id.correctionDisconnected,
  source_status: "completed",
  destination_status: "queued",
  decision: "approved",
  movement_events: 1
});

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
const routeBackAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'route backward', '{}'::jsonb)`,
  [id.routeDisconnectedExecution, id.routeSubmitBack]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(
  `select public.route_checkpoint_submission($1, $2, $3, $4, 'redo at first step', '[]'::jsonb)`,
  [routeBackAttempt.rows[0].id, id.correctionFirst, id.routeDecisionBack, id.routeMoveBack]
);
const backwardRoute = await db.query(
  `select assignment.current_step_id, execution.status, decision.decision, event.event_type
   from public.wafer_process_assignments assignment
   join public.step_executions execution on execution.id = $2
   join public.checkpoint_decisions decision on decision.client_mutation_id = $3
   join public.process_events event on event.client_mutation_id = $4
   where assignment.id = $1`,
  [id.routeAssignment, id.routeFirstExecution, id.routeDecisionBack, id.routeMoveBack]
);
assert.deepEqual(backwardRoute.rows[0], {
  current_step_id: id.correctionFirst,
  status: "redo_required",
  decision: "redo",
  event_type: "checkpoint_step_entered"
});

const onlyExplicitRedoRouteMigration = await readFile(
  new URL("../supabase/migrations/202607170003_only_explicit_redo_routes.sql", import.meta.url),
  "utf8"
);
await db.exec(onlyExplicitRedoRouteMigration);

const correctedAutomaticRedo = await db.query(
  `select decision.decision as stored_decision,
          correction.metadata ->> 'route_decision' as effective_decision,
          correction.metadata ->> 'corrected_event_id' = original.id::text as corrects_original
   from public.checkpoint_decisions decision
   join public.process_events original on original.client_mutation_id = $2
   join public.process_events correction
     on correction.metadata ->> 'corrected_event_id' = original.id::text
    and correction.metadata ->> 'movement_kind' = 'checkpoint_route_auto_redo_correction'
   where decision.client_mutation_id = $1`,
  [id.routeDecisionBack, id.routeMoveBack]
);
assert.deepEqual(correctedAutomaticRedo.rows[0], {
  stored_decision: "redo",
  effective_decision: "approved",
  corrects_original: true
});

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
const routeSameAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'repeat this step', '{}'::jsonb)`,
  [id.routeFirstExecution, id.routeSubmitSame]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(
  `select public.route_checkpoint_submission($1, $2, $3, $4, 'redo in the same step', '[]'::jsonb)`,
  [routeSameAttempt.rows[0].id, id.correctionFirst, id.routeDecisionSame, id.routeMoveSame]
);
const sameStepRoute = await db.query(
  `select assignment.current_step_id, execution.status, decision.decision
   from public.wafer_process_assignments assignment
   join public.step_executions execution on execution.id = $2
   join public.checkpoint_decisions decision on decision.client_mutation_id = $3
   where assignment.id = $1`,
  [id.routeAssignment, id.routeFirstExecution, id.routeDecisionSame]
);
assert.deepEqual(sameStepRoute.rows[0], {
  current_step_id: id.correctionFirst,
  status: "redo_required",
  decision: "redo"
});

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
const forwardAgainAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'move to disconnected inspection', '{}'::jsonb)`,
  [id.routeFirstExecution, id.routeSubmitForwardAgain]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(
  `select public.route_checkpoint_submission($1, $2, $3, $4, 'normal forward route', '[]'::jsonb)`,
  [forwardAgainAttempt.rows[0].id, id.correctionDisconnected, id.routeDecisionForwardAgain, id.routeMoveForwardAgain]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
const backwardApprovedAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'return to beginning work', '{}'::jsonb)`,
  [id.routeDisconnectedExecution, id.routeSubmitBackApproved]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(
  `select public.route_checkpoint_submission($1, $2, $3, $4, 'normal backward route', '[]'::jsonb)`,
  [backwardApprovedAttempt.rows[0].id, id.correctionFirst, id.routeDecisionBackApproved, id.routeMoveBackApproved]
);
const backwardApprovedRoute = await db.query(
  `select assignment.current_step_id, execution.status, decision.decision
   from public.wafer_process_assignments assignment
   join public.step_executions execution on execution.id = $2
   join public.checkpoint_decisions decision on decision.client_mutation_id = $3
   where assignment.id = $1`,
  [id.routeAssignment, id.routeFirstExecution, id.routeDecisionBackApproved]
);
assert.deepEqual(backwardApprovedRoute.rows[0], {
  current_step_id: id.correctionFirst,
  status: "queued",
  decision: "approved"
});

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await db.query(
  `insert into public.wafers (id, project_id, wafer_code, metadata)
   values ($1, $2, 'DICE-ROUTE', jsonb_build_object(
     'die_labels', jsonb_build_array('DICE-ROUTE_1', 'DICE-ROUTE_2')
   ))`,
  [id.routeDicingWafer, id.project]
);
await db.query(
  `insert into public.wafer_process_assignments
   (id, wafer_id, template_id, assigned_by, status, current_step_id)
   values ($1, $2, $3, $4, 'queued', $5)`,
  [id.routeDicingAssignment, id.routeDicingWafer, id.dicingTemplate, id.submitter, id.dicingStep]
);
await db.query(
  `insert into public.step_executions
   (id, assignment_id, wafer_id, process_step_id, status, queue_started_at)
   values ($1, $2, $3, $4, 'queued', now()), ($5, $2, $3, $6, 'pending', null)`,
  [
    id.routeDicingExecution,
    id.routeDicingAssignment,
    id.routeDicingWafer,
    id.dicingStep,
    id.routeDicingFutureExecution,
    id.postDicingStep
  ]
);
const routeDicingAttempt = await db.query(
  `select id from public.submit_step_checkpoint($1, $2, 'split and route', '{}'::jsonb)`,
  [id.routeDicingExecution, id.routeDicingSubmit]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.reviewer]);
await db.query(
  `select public.route_checkpoint_submission(
    $1, $2, $3, $4, 'approved split route',
    jsonb_build_array(
      jsonb_build_object(
        'wafer_code', 'DICE-ROUTE_1', 'die_label', 'DICE-ROUTE_1', 'movement_mutation_id', $5::text
      ),
      jsonb_build_object(
        'wafer_code', 'DICE-ROUTE_2', 'die_label', 'DICE-ROUTE_2', 'movement_mutation_id', $6::text
      )
    )
  )`,
  [
    routeDicingAttempt.rows[0].id,
    id.postDicingStep,
    id.routeDicingDecision,
    id.routeDicingAggregate,
    id.routeDicingChildMoveOne,
    id.routeDicingChildMoveTwo
  ]
);
const routedChildren = await db.query(
  `select assignment.current_step_id, execution.status
   from public.wafers child
   join public.wafer_process_assignments assignment on assignment.wafer_id = child.id
   join public.step_executions execution on execution.assignment_id = assignment.id
     and execution.process_step_id = assignment.current_step_id
   where child.metadata ->> 'parent_wafer_id' = $1
   order by child.wafer_code`,
  [id.routeDicingWafer]
);
assert.equal(routedChildren.rows.length, 2);
assert.ok(routedChildren.rows.every((row) => row.current_step_id === id.postDicingStep && row.status === "queued"));
const dicingRouteEvents = await db.query(
  `select event_type, metadata ->> 'target_step_id' as target_step_id
   from public.process_events where client_mutation_id = $1`,
  [id.routeDicingAggregate]
);
assert.deepEqual(dicingRouteEvents.rows, [{
  event_type: "checkpoint_dicing_children_routed",
  target_step_id: id.postDicingStep
}]);

await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await db.query(
  `insert into public.process_templates
   (id, owner_project_id, name, version, created_by)
   values ($1, $2, 'Anytime detour verification', '1.0', $3)`,
  [id.anytimeTemplate, id.project, id.submitter]
);
await db.query(
  `insert into public.process_steps
   (id, template_id, step_order, name, slug, process_area, node_type, execution_mode)
   values ($1, $2, 10, 'Main work', 'main-work', 'Verification', 'start', 'main'),
          ($3, $2, 20, 'Piranha', 'piranha', 'Verification', 'procedure', 'anytime'),
          ($4, $2, 30, 'Other main work', 'other-main-work', 'Verification', 'end', 'main')`,
  [id.anytimeMain, id.anytimeTemplate, id.anytimeProcedure, id.anytimeOtherMain]
);
await db.query(
  `insert into public.wafers (id, project_id, wafer_code)
   values ($1, $2, 'ANYTIME-VERIFY')`,
  [id.anytimeWafer, id.project]
);
await db.query(
  `insert into public.wafer_process_assignments
   (id, wafer_id, template_id, assigned_by, status, current_step_id)
   values ($1, $2, $3, $4, 'in_progress', $5)`,
  [id.anytimeAssignment, id.anytimeWafer, id.anytimeTemplate, id.submitter, id.anytimeMain]
);
await db.query(
  `insert into public.step_executions
   (id, assignment_id, wafer_id, process_step_id, status, queue_started_at)
   values ($1, $2, $3, $4, 'queued', now())`,
  [id.anytimeMainExecution, id.anytimeAssignment, id.anytimeWafer, id.anytimeMain]
);
await db.exec(`set role authenticated`);
await assert.rejects(
  db.query(
    `select public.move_approved_checkpoint_assignment($1, $2, $3, 'must stay checkpoint gated')`,
    [id.anytimeAssignment, id.anytimeOtherMain, id.rejectedMainMovement]
  ),
  /must be approved before the wafer can move/i
);
await db.query(
  `select public.move_approved_checkpoint_assignment($1, $2, $3, 'enter optional piranha procedure')`,
  [id.anytimeAssignment, id.anytimeProcedure, id.anytimeMovement]
);
await db.exec(`reset role`);
const anytimeDetour = await db.query(
  `select assignment.current_step_id,
          assignment.anytime_return_step_id,
          source.status as source_status,
          destination.status as destination_status,
          event.metadata ->> 'movement_kind' as movement_kind,
          event.metadata ->> 'anytime_return_step_id' as event_return_step_id
   from public.wafer_process_assignments assignment
   join public.step_executions source on source.id = $2
   join public.step_executions destination
     on destination.assignment_id = assignment.id
    and destination.process_step_id = $3
   join public.process_events event on event.client_mutation_id = $4
   where assignment.id = $1`,
  [id.anytimeAssignment, id.anytimeMainExecution, id.anytimeProcedure, id.anytimeMovement]
);
assert.deepEqual(anytimeDetour.rows[0], {
  current_step_id: id.anytimeProcedure,
  anytime_return_step_id: id.anytimeMain,
  source_status: "pending",
  destination_status: "queued",
  movement_kind: "anytime_enter",
  event_return_step_id: id.anytimeMain
});

const checkpointHistoryBeforeDelete = await db.query(
  `select
     (select count(*)::integer from public.process_step_attempts where assignment_id = $1) as attempts,
     (select count(*)::integer from public.checkpoint_decisions where assignment_id = $1) as decisions,
     (select count(*)::integer from public.checkpoint_submission_withdrawals where assignment_id = $1) as withdrawals`,
  [id.correctionAssignment]
);
await db.query(`select set_config('app.actor_id', $1, false)`, [id.submitter]);
await db.exec(`set role authenticated`);
const softDeleted = await db.query(
  `select wafer_id from public.soft_delete_process_flow_wafer_family($1, array[$2]::uuid[])`,
  [id.project, id.correctionWafer]
);
await db.exec(`reset role`);
assert.deepEqual(softDeleted.rows, [{ wafer_id: id.correctionWafer }]);

const deletedOperationalRows = await db.query(
  `select
     wafer.deleted_at is not null as wafer_deleted,
     wafer.status as wafer_status,
     wafer.wafer_code,
     wafer.metadata ->> 'process_flow_deleted_wafer_code' as original_wafer_code,
     assignment.deleted_at is not null as assignment_deleted,
     assignment.status as assignment_status,
     assignment.current_step_id
   from public.wafers wafer
   join public.wafer_process_assignments assignment on assignment.wafer_id = wafer.id
   where wafer.id = $1`,
  [id.correctionWafer]
);
assert.equal(deletedOperationalRows.rows[0].wafer_deleted, true);
assert.equal(deletedOperationalRows.rows[0].wafer_status, "scrapped");
assert.equal(
  deletedOperationalRows.rows[0].wafer_code,
  `CORRECTED-1__deleted__${id.correctionWafer.replaceAll("-", "")}`
);
assert.equal(deletedOperationalRows.rows[0].original_wafer_code, "CORRECTED-1");
assert.equal(deletedOperationalRows.rows[0].assignment_deleted, true);
assert.equal(deletedOperationalRows.rows[0].assignment_status, "scrapped");
assert.equal(deletedOperationalRows.rows[0].current_step_id, id.correctionEnd);

const checkpointHistoryAfterDelete = await db.query(
  `select
     (select count(*)::integer from public.process_step_attempts where assignment_id = $1) as attempts,
     (select count(*)::integer from public.checkpoint_decisions where assignment_id = $1) as decisions,
     (select count(*)::integer from public.checkpoint_submission_withdrawals where assignment_id = $1) as withdrawals`,
  [id.correctionAssignment]
);
assert.deepEqual(checkpointHistoryAfterDelete.rows, checkpointHistoryBeforeDelete.rows);
await db.query(
  `insert into public.wafers (id, project_id, wafer_code) values ($1, $2, 'CORRECTED-1')`,
  [id.correctionReplacementWafer, id.project]
);
await db.exec(`set role authenticated`);
await db.query(
  `select wafer_id from public.soft_delete_process_flow_wafer_family($1, array[$2]::uuid[])`,
  [id.project, id.correctionReplacementWafer]
);
await db.exec(`reset role`);
const replacementDelete = await db.query(
  `select wafer_code, deleted_at is not null as wafer_deleted
   from public.wafers
   where id = $1`,
  [id.correctionReplacementWafer]
);
assert.deepEqual(replacementDelete.rows, [{
  wafer_code: `CORRECTED-1__deleted__${id.correctionReplacementWafer.replaceAll("-", "")}`,
  wafer_deleted: true
}]);

console.log(JSON.stringify({
  migration: "applied",
  legacyBackfill: "published with eligible project-owner reviewer",
  assignmentProjectionBackfill: "planned, failed, and completed states repaired",
  submitRetry: "idempotent",
  withdrawal: "restored prior status",
  approve: "stays on Complete as ready to move",
  redo: "reviewer-selected destination returns to Beginning",
  history: "append-only",
  directBypass: "assignment movement, late starts, and completed inserts rejected",
  dicing: "reviewer drop atomically creates children and enters each destination Beginning",
  attemptSnapshots: "start time remains append-only across redo",
  reviewerRecovery: "audited, idempotent handoff lets current reviewer decide an older submission",
  authenticatedRole: "trigger helpers and reviewer-history RLS work without exposing mutation helpers",
  versioning: "legacy versioning remains compatible while active graph editing is restored",
  graphMovement: "reviewer drop approves every different destination, records only a same-step repeat as redo, and always begins at the destination",
  beginningRouteCorrection: "wrong Beginning arrival is superseded and replaced without mutating checkpoint history",
  anytimeDetour: "active main work enters an anytime procedure while preserving its main-flow return step",
  checkpointedDelete: "history stays append-only and reused codes can be deleted repeatedly without tombstone collisions",
  attempts: 4
}, null, 2));

await db.close();
