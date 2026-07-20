import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  new URL("../supabase/migrations/202607200003_wafer_history_corrections.sql", import.meta.url),
  "utf8"
);
const model = await readFile(
  new URL("../src/ui/waferwatch-wireframe/components/wafer-die-detail/stepVisitHistoryModel.ts", import.meta.url),
  "utf8"
);

assert.match(migration, /correct_wafer_process_history/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /expected_history_revision/);
assert.match(migration, /step_parameter_records/);
assert.match(migration, /is required/);
assert.match(migration, /This history anchor changed in another session/);
assert.match(migration, /target_visit_id' = anchor_visit_id/);
assert.match(migration, /This history visit was already removed/);
assert.match(model, /mergeHistoryCorrections/);
assert.match(model, /historyVisitId/);

const db = new PGlite();
const id = {
  actor: "50000000-0000-4000-8000-000000000001",
  project: "50000000-0000-4000-8000-000000000002",
  template: "50000000-0000-4000-8000-000000000003",
  completedStep: "50000000-0000-4000-8000-000000000004",
  currentStep: "50000000-0000-4000-8000-000000000005",
  wafer: "50000000-0000-4000-8000-000000000006",
  assignment: "50000000-0000-4000-8000-000000000007",
  completedExecution: "50000000-0000-4000-8000-000000000008",
  currentExecution: "50000000-0000-4000-8000-000000000009",
  attempt: "50000000-0000-4000-8000-000000000010",
  insertMutation: "50000000-0000-4000-8000-000000000011",
  staleMutation: "50000000-0000-4000-8000-000000000012",
  removeMutation: "50000000-0000-4000-8000-000000000013",
  duplicateRemoveMutation: "50000000-0000-4000-8000-000000000014",
  currentRemoveMutation: "50000000-0000-4000-8000-000000000015",
  requiredFieldMutation: "50000000-0000-4000-8000-000000000016"
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
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;

  create table public.profiles (id uuid primary key);
  create table public.process_templates (id uuid primary key);
  create table public.process_steps (
    id uuid primary key,
    template_id uuid not null references public.process_templates(id),
    name text not null,
    process_area text not null,
    parameters_schema jsonb not null default '{"version":1,"fields":[]}'::jsonb,
    archived_at timestamptz
  );
  create table public.wafers (
    id uuid primary key,
    project_id uuid not null
  );
  create table public.wafer_process_assignments (
    id uuid primary key,
    wafer_id uuid not null references public.wafers(id),
    template_id uuid not null references public.process_templates(id),
    current_step_id uuid references public.process_steps(id),
    deleted_at timestamptz
  );
  create table public.step_executions (
    id uuid primary key,
    assignment_id uuid not null references public.wafer_process_assignments(id),
    wafer_id uuid not null references public.wafers(id),
    process_step_id uuid not null references public.process_steps(id),
    status text not null
  );
  create table public.process_step_attempts (
    id uuid primary key,
    assignment_id uuid not null references public.wafer_process_assignments(id),
    step_execution_id uuid not null references public.step_executions(id)
  );
  create table public.process_events (
    id uuid primary key default gen_random_uuid(),
    project_id uuid,
    wafer_id uuid,
    step_execution_id uuid,
    actor_id uuid references public.profiles(id),
    event_type text not null,
    event_at timestamptz not null default now(),
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    client_mutation_id uuid unique
  );
  create table public.step_parameter_records (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null,
    wafer_id uuid not null,
    assignment_id uuid,
    process_step_id uuid not null,
    step_execution_id uuid,
    process_event_id uuid,
    movement_mutation_id uuid,
    schema_snapshot jsonb not null default '{}'::jsonb,
    global_values jsonb not null default '{}'::jsonb,
    local_parameters jsonb not null default '[]'::jsonb,
    notes text,
    recorded_by uuid references public.profiles(id),
    revision bigint not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  insert into public.profiles values ('${id.actor}');
  insert into public.process_templates values ('${id.template}');
  insert into public.process_steps (id, template_id, name, process_area, parameters_schema) values
    ('${id.completedStep}', '${id.template}', 'Metrology', 'Characterization',
      '{"version":1,"fields":[{"id":"temperature","key":"temperature_c","label":"Temperature","type":"number","required":true}]}'::jsonb),
    ('${id.currentStep}', '${id.template}', 'Poling', 'Fabrication', '{"version":1,"fields":[]}'::jsonb);
  insert into public.wafers values ('${id.wafer}', '${id.project}');
  insert into public.wafer_process_assignments values
    ('${id.assignment}', '${id.wafer}', '${id.template}', '${id.currentStep}', null);
  insert into public.step_executions values
    ('${id.completedExecution}', '${id.assignment}', '${id.wafer}', '${id.completedStep}', 'completed'),
    ('${id.currentExecution}', '${id.assignment}', '${id.wafer}', '${id.currentStep}', 'running');
  insert into public.process_step_attempts values
    ('${id.attempt}', '${id.assignment}', '${id.completedExecution}');
`);

await db.exec(migration);
await db.exec(`set app.actor_id = '${id.actor}'; set role authenticated;`);

const correction = await db.query(
  `select public.correct_wafer_process_history(
    $1, 'insert', $2, $2, 'after', $3, $4, $5, 0, $6,
    '{"temperature_c":180}'::jsonb, '{"temperature_c":"Instrument log"}'::jsonb
  ) as result`,
  [id.assignment, `attempt:${id.attempt}`, id.completedStep, "2026-07-19T16:00:00Z", "Recovered instrument visit", id.insertMutation]
);
assert.equal(correction.rows[0].result.kind, "insert");
assert.match(correction.rows[0].result.visit_id, /^correction:/);

const retry = await db.query(
  `select public.correct_wafer_process_history(
    $1, 'insert', $2, $2, 'after', $3, $4, $5, 0, $6,
    '{"temperature_c":180}'::jsonb, '{}'::jsonb
  ) as result`,
  [id.assignment, `attempt:${id.attempt}`, id.completedStep, "2026-07-19T16:00:00Z", "Recovered instrument visit", id.insertMutation]
);
assert.equal(retry.rows[0].result.already_corrected, true);

await assert.rejects(
  db.query(
    `select public.correct_wafer_process_history($1, 'insert', $2, $2, 'after', $3, now(), 'Stale anchor', 1, $4, '{"temperature_c":180}'::jsonb, '{}'::jsonb)`,
    [id.assignment, "execution:50000000-0000-4000-8000-999999999999", id.completedStep, id.staleMutation]
  ),
  /history anchor changed in another session/i
);

const removal = await db.query(
  `select public.correct_wafer_process_history(
    $1, 'remove', $2, null, null, null, null, $3, 1, $4, '{}'::jsonb, '{}'::jsonb
  ) as result`,
  [id.assignment, `attempt:${id.attempt}`, "Duplicate recorded visit", id.removeMutation]
);
assert.equal(removal.rows[0].result.history_revision, 2);

await assert.rejects(
  db.query(
    `select public.correct_wafer_process_history($1, 'remove', $2, null, null, null, null, 'Remove twice', 2, $3, '{}'::jsonb, '{}'::jsonb)`,
    [id.assignment, `attempt:${id.attempt}`, id.duplicateRemoveMutation]
  ),
  /already removed/i
);
await assert.rejects(
  db.query(
    `select public.correct_wafer_process_history($1, 'remove', $2, null, null, null, null, 'Remove live work', 2, $3, '{}'::jsonb, '{}'::jsonb)`,
    [id.assignment, `current:${id.currentExecution}`, id.currentRemoveMutation]
  ),
  /Undo the live current process state/i
);
await assert.rejects(
  db.query(
    `select public.correct_wafer_process_history($1, 'insert', $2, $2, 'before', $3, now(), 'Missing required field', 2, $4, '{}'::jsonb, '{}'::jsonb)`,
    [id.assignment, `current:${id.currentExecution}`, id.completedStep, id.requiredFieldMutation]
  ),
  /Temperature is required/i
);

await db.exec("reset role");
const evidence = await db.query(`
  select
    (select count(*)::integer from public.process_events where event_type = 'wafer_history_correction') as corrections,
    (select count(*)::integer from public.step_parameter_records) as parameter_records,
    (select global_values ->> 'temperature_c' from public.step_parameter_records limit 1) as temperature
`);
assert.deepEqual(evidence.rows, [{ corrections: 2, parameter_records: 1, temperature: "180" }]);

console.log(JSON.stringify({
  insertion: "append-only event plus exact parameter record",
  retry: "idempotent",
  staleAnchor: "rejected",
  duplicateRemoval: "rejected",
  liveRemoval: "rejected",
  requiredParameters: "validated",
  correctionEvents: evidence.rows[0].corrections
}, null, 2));
