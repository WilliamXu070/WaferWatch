import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const ids = {
  user: "00000000-0000-4000-8000-000000000001",
  project: "00000000-0000-4000-8000-000000000002",
  template: "00000000-0000-4000-8000-000000000003",
  source: "00000000-0000-4000-8000-000000000004",
  targetA: "00000000-0000-4000-8000-000000000005",
  targetB: "00000000-0000-4000-8000-000000000006",
  wafer: "00000000-0000-4000-8000-000000000007",
  assignment: "00000000-0000-4000-8000-000000000008",
  execution: "00000000-0000-4000-8000-000000000009",
  calendar: "00000000-0000-4000-8000-000000000010",
  mutation: "00000000-0000-4000-8000-000000000011"
};

await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create schema realtime;
  create function auth.uid() returns uuid language sql stable as $$ select '${ids.user}'::uuid $$;
  create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
  create function public.can_edit_project(uuid) returns boolean language sql stable as $$ select true $$;
  create function public.can_access_project(uuid) returns boolean language sql stable as $$ select true $$;
  create function public.can_manage_process_library() returns boolean language sql stable as $$ select true $$;

  create table realtime.messages (
    id uuid primary key default gen_random_uuid(),
    topic text not null,
    extension text not null default 'broadcast',
    event text not null,
    payload jsonb not null,
    private boolean not null default true,
    inserted_at timestamptz not null default now()
  );
  create function realtime.topic() returns text language sql stable
    as $$ select current_setting('realtime.topic', true) $$;
  create function realtime.send(jsonb, text, text, boolean default true)
  returns void
  language sql
  as $$
    insert into realtime.messages (payload, event, topic, private)
    values ($1, $2, $3, $4)
  $$;

  create table public.profiles (
    id uuid primary key,
    display_name text,
    email text,
    is_active boolean not null default true,
    role text not null default 'operator'
  );
  insert into public.profiles (id, display_name) values ('${ids.user}', 'Test User');

  create table public.process_templates (
    id uuid primary key,
    owner_project_id uuid,
    name text,
    is_active boolean not null default true,
    updated_at timestamptz default now()
  );
  create table public.process_people (
    id uuid primary key,
    profile_id uuid references public.profiles(id)
  );
  create table public.process_steps (
    id uuid primary key,
    template_id uuid references public.process_templates(id),
    step_order integer,
    name text,
    canvas_x integer,
    canvas_y integer,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  create table public.wafers (
    id uuid primary key,
    project_id uuid not null,
    metadata jsonb not null default '{}'::jsonb,
    updated_at timestamptz default now()
  );
  create table public.wafer_process_assignments (
    id uuid primary key,
    wafer_id uuid references public.wafers(id),
    template_id uuid references public.process_templates(id),
    status text,
    assigned_at timestamptz default now(),
    started_at timestamptz,
    completed_at timestamptz,
    deleted_at timestamptz
  );
  create table public.step_executions (
    id uuid primary key,
    assignment_id uuid references public.wafer_process_assignments(id),
    wafer_id uuid references public.wafers(id),
    process_step_id uuid references public.process_steps(id),
    status text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  create table public.process_calendar_events (
    id uuid primary key,
    process_template_id uuid references public.process_templates(id),
    location text,
    starts_at timestamptz,
    ends_at timestamptz,
    updated_at timestamptz default now()
  );
  create table public.process_calendar_event_people (
    event_id uuid,
    person_id uuid,
    primary key (event_id, person_id)
  );
  create table public.process_step_transitions (
    id uuid primary key,
    template_id uuid,
    from_step_id uuid,
    to_step_id uuid
  );
  create table public.process_events (
    id uuid primary key default gen_random_uuid(),
    project_id uuid,
    wafer_id uuid,
    step_execution_id uuid,
    actor_id uuid,
    event_type text,
    event_at timestamptz default now(),
    notes text,
    metadata jsonb default '{}'::jsonb
  );
  create table public.text_surfaces (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null,
    scope_type text not null,
    scope_key text not null,
    field_key text not null,
    value text not null default '',
    version integer not null default 1,
    updated_by uuid,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (project_id, scope_type, scope_key, field_key)
  );
  create table public.die_inspections (
    id uuid primary key,
    project_id uuid not null,
    wafer_id uuid not null references public.wafers(id)
  );
  create table public.team_messages (
    id uuid primary key default gen_random_uuid(),
    author_id uuid not null references public.profiles(id),
    author_name text not null,
    body text not null,
    created_at timestamptz not null default now()
  );
  create publication supabase_realtime;
`);

const collaborationMigration = await readFile(
  new URL("../supabase/migrations/202607130001_collaboration_foundation.sql", import.meta.url),
  "utf8"
);
const broadcastMigration = await readFile(
  new URL("../supabase/migrations/202607150008_scoped_workflow_broadcast.sql", import.meta.url),
  "utf8"
);
const idempotencyMigration = await readFile(
  new URL("../supabase/migrations/202607150009_process_event_idempotency_constraint.sql", import.meta.url),
  "utf8"
);
assert.doesNotMatch(
  broadcastMigration,
  /alter\s+table\s+realtime\.messages\s+enable\s+row\s+level\s+security/i,
  "Hosted Supabase owns realtime.messages; migrations must rely on its default RLS state."
);
await db.exec(collaborationMigration);
await db.exec(broadcastMigration);
await db.exec(idempotencyMigration);

await db.query(
  `insert into public.process_templates (id, name) values ($1, 'Test flow')`,
  [ids.template]
);
for (const [id, name, x] of [
  [ids.source, "Source", 10],
  [ids.targetA, "Target A", 20],
  [ids.targetB, "Target B", 30]
]) {
  await db.query(
    `insert into public.process_steps (id, template_id, step_order, name, canvas_x, canvas_y)
     values ($1, $2, $3, $4, $5, 10)`,
    [id, ids.template, x, name, x]
  );
}
await db.query(`insert into public.wafers (id, project_id) values ($1, $2)`, [ids.wafer, ids.project]);
await db.query(
  `insert into public.wafer_process_assignments (id, wafer_id, template_id, status, current_step_id)
   values ($1, $2, $3, 'in_progress', $4)`,
  [ids.assignment, ids.wafer, ids.template, ids.source]
);
await db.query(
  `insert into public.step_executions (id, assignment_id, wafer_id, process_step_id, status)
   values ($1, $2, $3, $4, 'queued')`,
  [ids.execution, ids.assignment, ids.wafer, ids.source]
);

const noteA = { id: "note-a", body: "first" };
const noteB = { id: "note-b", body: "second" };
await Promise.all([
  db.query(
    `select * from public.mutate_text_surface_json_array($1, 'wireframe:wafer_die', 'scope', 'notes', 'add', $2, $3::jsonb)`,
    [ids.project, noteA.id, JSON.stringify(noteA)]
  ),
  db.query(
    `select * from public.mutate_text_surface_json_array($1, 'wireframe:wafer_die', 'scope', 'notes', 'add', $2, $3::jsonb)`,
    [ids.project, noteB.id, JSON.stringify(noteB)]
  )
]);
await db.query(
  `select * from public.mutate_text_surface_json_array($1, 'wireframe:wafer_die', 'scope', 'notes', 'add', $2, $3::jsonb)`,
  [ids.project, noteA.id, JSON.stringify(noteA)]
);
const noteRows = await db.query(
  `select value::jsonb as value from public.text_surfaces where project_id = $1 and scope_key = 'scope'`,
  [ids.project]
);
assert.deepEqual(noteRows.rows[0].value.map((note) => note.id).sort(), ["note-a", "note-b"]);

await Promise.all([
  db.query(
    `select id from public.patch_wafer_die_poling_parameters($1, 'A1-V1', $2::jsonb)`,
    [ids.wafer, JSON.stringify([{ row: 1, column: 1, field: "voltage", value: "100", expectedValue: "" }])]
  ),
  db.query(
    `select id from public.patch_wafer_die_poling_parameters($1, 'A1-V1', $2::jsonb)`,
    [ids.wafer, JSON.stringify([{ row: 1, column: 2, field: "width", value: "20", expectedValue: "" }])]
  )
]);
const parameterRows = await db.query(`select metadata from public.wafers where id = $1`, [ids.wafer]);
assert.equal(parameterRows.rows[0].metadata.die_poling_parameters["A1-V1"].R1.C1.voltage, "100");
assert.equal(parameterRows.rows[0].metadata.die_poling_parameters["A1-V1"].R1.C2.width, "20");
await assert.rejects(
  db.query(
    `select id from public.patch_wafer_die_poling_parameters($1, 'A1-V1', $2::jsonb)`,
    [ids.wafer, JSON.stringify([{ row: 1, column: 1, field: "voltage", value: "90", expectedValue: "" }])]
  ),
  /changed from/
);

const moveClaims = await Promise.allSettled([
  db.query(`select id from public.claim_wafer_assignment_move($1, $2, $3)`, [ids.assignment, ids.source, ids.targetA]),
  db.query(`select id from public.claim_wafer_assignment_move($1, $2, $3)`, [ids.assignment, ids.source, ids.targetB])
]);
assert.equal(moveClaims.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(moveClaims.filter((result) => result.status === "rejected").length, 1);

await db.query(
  `insert into public.process_calendar_events (id, process_template_id, location, starts_at, ends_at)
   values ($1, $2, 'Toronto', now(), now() + interval '1 hour')`,
  [ids.calendar, ids.template]
);
const calendarFirst = await db.query(
  `update public.process_calendar_events set location = 'Waterloo' where id = $1 and revision = 1 returning revision`,
  [ids.calendar]
);
const calendarStale = await db.query(
  `update public.process_calendar_events set location = 'McMaster' where id = $1 and revision = 1 returning revision`,
  [ids.calendar]
);
assert.equal(calendarFirst.rows.length, 1);
assert.equal(calendarStale.rows.length, 0);

await db.query(
  `select * from public.update_process_step_positions_versioned($1::jsonb)`,
  [JSON.stringify([{ stepId: ids.source, canvasX: 11, canvasY: 12, expectedCanvasX: 10, expectedCanvasY: 10 }])]
);
await assert.rejects(
  db.query(
    `select * from public.update_process_step_positions_versioned($1::jsonb)`,
    [JSON.stringify([
      { stepId: ids.targetA, canvasX: 21, canvasY: 22, expectedCanvasX: 20, expectedCanvasY: 10 },
      { stepId: ids.source, canvasX: 50, canvasY: 50, expectedCanvasX: 10, expectedCanvasY: 10 }
    ])]
  ),
  /moved by another collaborator/
);
const unchangedTarget = await db.query(`select canvas_x, canvas_y from public.process_steps where id = $1`, [ids.targetA]);
assert.deepEqual(unchangedTarget.rows[0], { canvas_x: 20, canvas_y: 10 });

await db.query(
  `insert into public.process_events (project_id, event_type, client_mutation_id) values ($1, 'move', $2)`,
  [ids.project, ids.mutation]
);
await assert.rejects(
  db.query(
    `insert into public.process_events (project_id, event_type, client_mutation_id) values ($1, 'move', $2)`,
    [ids.project, ids.mutation]
  ),
  /unique|duplicate/i
);

const publicationRows = await db.query(
  `select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename`
);
for (const table of ["process_calendar_events", "process_steps", "text_surfaces", "wafers", "die_inspections"]) {
  assert(!publicationRows.rows.some((row) => row.tablename === table), `${table} is still published`);
}

const broadcastRows = await db.query(
  `select topic, event, payload from realtime.messages order by inserted_at, id`
);
assert(
  broadcastRows.rows.some((row) =>
    row.topic === `workflow:process:${ids.template}` &&
    row.event === "workflow_changed" &&
    row.payload.table === "process_steps"
  ),
  "process step change did not emit a process-scoped broadcast"
);

await db.query(
  `insert into public.team_messages (author_id, author_name, body) values ($1, 'Test User', 'Broadcast test')`,
  [ids.user]
);
const teamBroadcast = await db.query(
  `select payload from realtime.messages where topic = 'team:messages' and event = 'team_message_inserted' order by inserted_at desc limit 1`
);
assert.equal(teamBroadcast.rows[0].payload.record.body, "Broadcast test");

const topicAccess = await db.query(
  `select
     public.can_receive_waferwatch_broadcast($1) as process_allowed,
     public.can_receive_waferwatch_broadcast('workflow:process:not-a-uuid') as malformed_denied`,
  [`workflow:process:${ids.template}`]
);
assert.equal(topicAccess.rows[0].process_allowed, true);
assert.equal(topicAccess.rows[0].malformed_denied, false);

console.log(JSON.stringify({
  notes: "two concurrent adds preserved; retry idempotent",
  parameters: "different cells merged; stale same-cell write rejected",
  waferMove: "one of two concurrent source claims accepted",
  calendar: "stale revision update rejected",
  processFlow: "stale batch rejected atomically",
  history: "duplicate client mutation rejected",
  realtime: "private process-scoped Broadcast payloads verified",
  realtimeTables: publicationRows.rows.length
}, null, 2));

await db.close();
