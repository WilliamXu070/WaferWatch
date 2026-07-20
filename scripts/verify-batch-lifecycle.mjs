import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = {
  actor: "40000000-0000-4000-8000-000000000001",
  project: "40000000-0000-4000-8000-000000000002",
  template: "40000000-0000-4000-8000-000000000003",
  source: "40000000-0000-4000-8000-000000000004",
  target: "40000000-0000-4000-8000-000000000005",
  waferOne: "40000000-0000-4000-8000-000000000006",
  waferTwo: "40000000-0000-4000-8000-000000000007",
  waferThree: "40000000-0000-4000-8000-000000000008",
  assignmentOne: "40000000-0000-4000-8000-000000000009",
  assignmentTwo: "40000000-0000-4000-8000-000000000010",
  assignmentThree: "40000000-0000-4000-8000-000000000011",
  sourceExecutionOne: "40000000-0000-4000-8000-000000000012",
  sourceExecutionTwo: "40000000-0000-4000-8000-000000000013",
  sourceExecutionThree: "40000000-0000-4000-8000-000000000014",
  targetExecutionOne: "40000000-0000-4000-8000-000000000015",
  targetExecutionTwo: "40000000-0000-4000-8000-000000000016",
  childBatch: "40000000-0000-4000-8000-000000000017",
  retryBatch: "40000000-0000-4000-8000-000000000018"
};

await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;

  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('app.actor_id', true), '')::uuid
  $$;
  create function public.can_edit_project(uuid) returns boolean language sql stable as $$
    select auth.uid() is not null
  $$;
  create function public.can_access_wafer(uuid) returns boolean language sql stable as $$
    select auth.uid() is not null
  $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;

  create table public.profiles (id uuid primary key);
  create table public.projects (id uuid primary key);
  create table public.process_templates (
    id uuid primary key,
    owner_project_id uuid references public.projects(id)
  );
  create table public.process_steps (
    id uuid primary key,
    template_id uuid not null references public.process_templates(id)
  );
  create table public.wafers (
    id uuid primary key,
    project_id uuid not null references public.projects(id)
  );
  create table public.wafer_process_assignments (
    id uuid primary key,
    wafer_id uuid not null references public.wafers(id),
    template_id uuid not null references public.process_templates(id),
    assigned_by uuid references public.profiles(id),
    status text not null,
    assigned_at timestamptz not null default now(),
    current_step_id uuid references public.process_steps(id),
    deleted_at timestamptz,
    archived_at timestamptz
  );
  create table public.step_executions (
    id uuid primary key,
    assignment_id uuid not null references public.wafer_process_assignments(id),
    wafer_id uuid not null references public.wafers(id),
    process_step_id uuid not null references public.process_steps(id),
    status text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.process_calendar_events (
    id uuid primary key default gen_random_uuid(),
    process_template_id uuid not null references public.process_templates(id),
    location text not null,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    process_step_id uuid references public.process_steps(id),
    manual_action text,
    description text,
    created_by uuid references public.profiles(id)
  );
  grant select on public.process_calendar_events to authenticated;

  insert into public.profiles values ('${id.actor}');
  insert into public.projects values ('${id.project}');
  insert into public.process_templates values ('${id.template}', '${id.project}');
  insert into public.process_steps values
    ('${id.source}', '${id.template}'),
    ('${id.target}', '${id.template}');
  insert into public.wafers values
    ('${id.waferOne}', '${id.project}'),
    ('${id.waferTwo}', '${id.project}'),
    ('${id.waferThree}', '${id.project}');
  insert into public.wafer_process_assignments (
    id, wafer_id, template_id, assigned_by, status, current_step_id
  ) values
    ('${id.assignmentOne}', '${id.waferOne}', '${id.template}', '${id.actor}', 'in_progress', '${id.source}'),
    ('${id.assignmentTwo}', '${id.waferTwo}', '${id.template}', '${id.actor}', 'in_progress', '${id.source}'),
    ('${id.assignmentThree}', '${id.waferThree}', '${id.template}', '${id.actor}', 'in_progress', '${id.source}');
  insert into public.step_executions (
    id, assignment_id, wafer_id, process_step_id, status
  ) values
    ('${id.sourceExecutionOne}', '${id.assignmentOne}', '${id.waferOne}', '${id.source}', 'queued'),
    ('${id.sourceExecutionTwo}', '${id.assignmentTwo}', '${id.waferTwo}', '${id.source}', 'queued');
`);

const migrations = await Promise.all([
  readFile(
    new URL("../supabase/migrations/202607200002_batch_lifecycle_planning.sql", import.meta.url),
    "utf8"
  ),
  readFile(
    new URL("../supabase/migrations/202607200004_batch_lifecycle_hardening.sql", import.meta.url),
    "utf8"
  )
]);
for (const migration of migrations) {
  await db.exec(migration);
}

const legacy = await db.query(`
  select batch.origin, count(*)::integer as member_count
  from public.process_batches batch
  join public.process_batch_members member on member.batch_id = batch.id
  group by batch.origin
`);
assert.deepEqual(legacy.rows, [{ origin: "legacy_active", member_count: 2 }]);

const parentRows = await db.query(`
  select assignment_id, batch_id from public.process_batch_members
  where step_execution_id in ('${id.sourceExecutionOne}', '${id.sourceExecutionTwo}')
  order by assignment_id
`);
const parentOne = parentRows.rows[0].batch_id;
const parentTwo = parentRows.rows[1].batch_id;

await db.exec(`
  update public.wafer_process_assignments
  set current_step_id = '${id.target}'
  where id in ('${id.assignmentOne}', '${id.assignmentTwo}');
  insert into public.step_executions (
    id, assignment_id, wafer_id, process_step_id, status
  ) values
    ('${id.targetExecutionOne}', '${id.assignmentOne}', '${id.waferOne}', '${id.target}', 'queued'),
    ('${id.targetExecutionTwo}', '${id.assignmentTwo}', '${id.waferTwo}', '${id.target}', 'queued'),
    ('${id.sourceExecutionThree}', '${id.assignmentThree}', '${id.waferThree}', '${id.source}', 'queued');
  set app.actor_id = '${id.actor}';
  set role authenticated;
`);

const first = await db.query(
  `select public.record_planned_batch_member($1, $2, $3, $4, $5, $6, $7) as batch_id`,
  [id.childBatch, id.targetExecutionOne, "Shared move", parentOne, "2026-07-21T14:00:00Z", "2026-07-21T15:00:00Z", "Bay 2"]
);
const second = await db.query(
  `select public.record_planned_batch_member($1, $2, $3, $4) as batch_id`,
  [id.childBatch, id.targetExecutionTwo, "Shared move", parentTwo]
);
assert.equal(first.rows[0].batch_id, id.childBatch);
assert.equal(second.rows[0].batch_id, id.childBatch);

const child = await db.query(`
  select batch.origin,
    (select count(*)::integer from public.process_batch_members member where member.batch_id = batch.id) as members,
    (select count(*)::integer from public.process_batch_links link where link.child_batch_id = batch.id) as parents,
    (select count(*)::integer from public.process_calendar_events event where event.batch_id = batch.id) as events
  from public.process_batches batch where batch.id = $1
`, [id.childBatch]);
assert.deepEqual(child.rows, [{ origin: "arrival", members: 2, parents: 2, events: 1 }]);

const retry = await db.query(
  `select public.record_planned_batch_member($1, $2, null, $3) as batch_id`,
  [id.retryBatch, id.targetExecutionOne, parentOne]
);
assert.equal(retry.rows[0].batch_id, id.childBatch);

await assert.rejects(
  db.query(
    `select public.record_planned_batch_member($1, $2, null, null)`,
    [id.childBatch, id.sourceExecutionThree]
  ),
  /different process step/
);
await assert.rejects(
  db.query(`insert into public.process_batches (id, template_id, process_step_id) values (gen_random_uuid(), $1, $2)`, [id.template, id.target]),
  /permission denied|row-level security/i
);

await db.exec("reset role; set app.actor_id = '';");
await db.exec("set role authenticated");
await assert.rejects(
  db.query(`select public.record_planned_batch_member($1, $2, null, null)`, [id.retryBatch, id.sourceExecutionThree]),
  /authenticated account is required/i
);
await db.exec("reset role");

console.log(JSON.stringify({
  legacySingletons: 2,
  sharedArrivalMembers: 2,
  predecessorLinks: 2,
  scheduledEvents: 1,
  retry: "reused exact visit batch",
  collision: "rejected cross-step batch id",
  writes: "RPC-only under RLS"
}, null, 2));
