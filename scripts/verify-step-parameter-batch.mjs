import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  researcher: "10000000-0000-4000-8000-000000000002",
  project: "10000000-0000-4000-8000-000000000003",
  template: "10000000-0000-4000-8000-000000000004",
  step: "10000000-0000-4000-8000-000000000005"
};

await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create type public.user_role as enum ('admin', 'process_engineer', 'researcher', 'viewer');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
  create function public.can_edit_project(target_project_id uuid) returns boolean language sql stable as
    $$ select current_setting('app.can_edit', true) = 'true' $$;

  create table public.profiles (
    id uuid primary key,
    role public.user_role not null,
    is_active boolean not null
  );
  create table public.process_steps (
    id uuid primary key,
    template_id uuid not null,
    parameters_schema jsonb not null default '{}'::jsonb,
    revision integer not null default 1
  );
  create function public.bump_revision() returns trigger language plpgsql as $$
  begin new.revision = old.revision + 1; return new; end $$;
  create trigger process_steps_revision before update on public.process_steps
    for each row execute function public.bump_revision();
  create table public.wafer_process_assignments (
    id uuid primary key,
    wafer_id uuid not null,
    template_id uuid not null
  );
  create table public.process_events (
    id uuid primary key,
    project_id uuid not null,
    wafer_id uuid not null,
    step_execution_id uuid,
    client_mutation_id uuid not null unique,
    metadata jsonb not null
  );
  create table public.step_parameter_records (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null,
    wafer_id uuid not null,
    assignment_id uuid not null,
    process_step_id uuid not null,
    step_execution_id uuid,
    process_event_id uuid not null,
    movement_mutation_id uuid not null unique,
    schema_snapshot jsonb not null,
    global_values jsonb not null,
    local_parameters jsonb not null,
    notes text,
    recorded_by uuid,
    revision integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create function public.bump_record_revision() returns trigger language plpgsql as $$
  begin new.revision = old.revision + 1; new.updated_at = now(); return new; end $$;
  create trigger parameter_records_revision before update on public.step_parameter_records
    for each row execute function public.bump_record_revision();
`);

const migration = await readFile(
  new URL("../supabase/migrations/202607200001_batch_step_parameter_records.sql", import.meta.url),
  "utf8"
);
await db.exec(migration);
const ambiguityFixMigration = await readFile(
  new URL("../supabase/migrations/202607210001_fix_parameter_notes_ambiguity.sql", import.meta.url),
  "utf8"
);
await db.exec(ambiguityFixMigration);
await db.query(
  "insert into public.profiles (id, role, is_active) values ($1, 'admin', true), ($2, 'researcher', true)",
  [ids.admin, ids.researcher]
);
await db.query(
  `insert into public.process_steps (id, template_id, parameters_schema) values ($1, $2, '{"version":1,"fields":[]}')`,
  [ids.step, ids.template]
);

const entries = [];
for (let index = 1; index <= 8; index += 1) {
  const assignmentId = `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const waferId = `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const eventId = `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const mutationId = `50000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  await db.query(
    "insert into public.wafer_process_assignments (id, wafer_id, template_id) values ($1, $2, $3)",
    [assignmentId, waferId, ids.template]
  );
  await db.query(
    `insert into public.process_events (id, project_id, wafer_id, client_mutation_id, metadata)
     values ($1, $2, $3, $4, jsonb_build_object('assignment_id', $5::text, 'target_step_id', $6::text))`,
    [eventId, ids.project, waferId, mutationId, assignmentId, ids.step]
  );
  entries.push({ assignment_id: assignmentId, step_id: ids.step, movement_mutation_id: mutationId });
}

await db.exec(`select set_config('app.user_id', '${ids.admin}', false); select set_config('app.can_edit', 'true', false);`);
const saveInput = [
  JSON.stringify(entries),
  JSON.stringify({ pressure: 12 }),
  JSON.stringify([{ id: "field-1", key: "temperature", label: "Temperature", type: "number", unit: "C", value: 425, notes: "", scope: "global" }]),
  "Shared note"
];
const first = await db.query(
  "select * from public.save_step_parameter_records_batch($1::jsonb, $2::jsonb, $3::jsonb, $4)",
  saveInput
);
assert.equal(first.rows.length, 8);
assert.ok(first.rows.every((row) => row.movement_mutation_id));
assert.ok(first.rows.every((row) => row.notes === "Shared note"));

const firstRevision = await db.query("select revision from public.process_steps where id = $1", [ids.step]);
assert.equal(firstRevision.rows[0].revision, 2);
const repeated = await db.query(
  "select * from public.save_step_parameter_records_batch($1::jsonb, $2::jsonb, $3::jsonb, $4)",
  saveInput
);
assert.equal(repeated.rows.length, 8);
const recordRevisions = await db.query("select distinct revision from public.step_parameter_records");
assert.deepEqual(recordRevisions.rows.map((row) => row.revision), [1]);

const invalidEntries = [...entries, {
  ...entries[0],
  assignment_id: "60000000-0000-4000-8000-000000000002",
  movement_mutation_id: "60000000-0000-4000-8000-000000000001"
}];
await assert.rejects(
  db.query(
    "select * from public.save_step_parameter_records_batch($1::jsonb, $2::jsonb, $3::jsonb, $4)",
    [JSON.stringify(invalidEntries), saveInput[1], saveInput[2], saveInput[3]]
  ),
  /missing, mismatched, or not editable/
);
const countAfterFailure = await db.query("select count(*)::integer as count from public.step_parameter_records");
assert.equal(countAfterFailure.rows[0].count, 8);

await db.exec(`select set_config('app.user_id', '${ids.researcher}', false); select set_config('app.can_edit', 'false', false);`);
await assert.rejects(
  db.query(
    "select * from public.save_step_parameter_records_batch($1::jsonb, $2::jsonb, $3::jsonb, $4)",
    saveInput
  ),
  /missing, mismatched, or not editable/
);

console.log(JSON.stringify({
  records: first.rows.length,
  notes: "stored under production ambiguity rules",
  retry: "idempotent",
  invalidBatch: "rolled back",
  reusableSchemaRevision: firstRevision.rows[0].revision,
  unauthorizedWrite: "rejected"
}, null, 2));
