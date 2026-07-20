import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = {
  template: "10000000-0000-4000-8000-000000000001",
  step: "10000000-0000-4000-8000-000000000002",
  batch: "10000000-0000-4000-8000-000000000003",
  attemptOne: "10000000-0000-4000-8000-000000000004",
  attemptTwo: "10000000-0000-4000-8000-000000000005",
  legacyAttempt: "10000000-0000-4000-8000-000000000006",
  decisionOne: "10000000-0000-4000-8000-000000000007",
  decisionTwo: "10000000-0000-4000-8000-000000000008"
};

await db.exec(`
  create role anon;
  create role authenticated;

  create table public.process_step_attempts (
    id uuid primary key,
    assignment_id uuid not null,
    wafer_id uuid not null,
    template_id uuid not null,
    process_step_id uuid not null,
    step_execution_id uuid not null,
    attempt_number integer not null,
    submitted_by uuid,
    submitted_at timestamptz not null default now(),
    started_at_snapshot timestamptz,
    submission_notes text,
    evidence_snapshot jsonb not null default '{}'::jsonb,
    wafer_code_snapshot text not null,
    template_name_snapshot text not null,
    template_version_snapshot text not null,
    process_step_name_snapshot text not null,
    process_step_order_snapshot integer not null,
    reviewer_id_snapshot uuid,
    reviewer_name_snapshot text not null,
    submitted_by_name_snapshot text not null,
    prior_step_status text not null,
    client_mutation_id uuid not null unique,
    created_at timestamptz not null default now()
  );

  create table public.checkpoint_decisions (
    id uuid primary key,
    attempt_id uuid not null unique,
    decision text not null
  );

  create table public.checkpoint_submission_withdrawals (
    id uuid primary key,
    attempt_id uuid not null unique
  );

  alter table public.process_step_attempts enable row level security;
  alter table public.checkpoint_decisions enable row level security;
  alter table public.checkpoint_submission_withdrawals enable row level security;
  create policy attempts_read on public.process_step_attempts for select to authenticated using (true);
  create policy decisions_read on public.checkpoint_decisions for select to authenticated using (true);
  create policy withdrawals_read on public.checkpoint_submission_withdrawals for select to authenticated using (true);
  grant usage on schema public to authenticated;
  grant select on public.process_step_attempts, public.checkpoint_decisions,
    public.checkpoint_submission_withdrawals to authenticated;
`);

const migration = await readFile(
  new URL("../supabase/migrations/202607200000_dashboard_batch_process_history.sql", import.meta.url),
  "utf8"
);
await db.exec(migration);

const batchEvidence = JSON.stringify({ _waferwatch_batch_id: id.batch });
const attempts = [
  [id.attemptOne, "ALPHA-A1", batchEvidence, "2026-07-20T14:00:00Z"],
  [id.attemptTwo, "ALPHA-A2", batchEvidence, "2026-07-20T14:00:01Z"],
  [id.legacyAttempt, "LEGACY-A1", "{}", "2026-07-19T14:00:00Z"]
];

for (const [attemptId, waferCode, evidence, submittedAt] of attempts) {
  await db.query(
    `insert into public.process_step_attempts (
      id, assignment_id, wafer_id, template_id, process_step_id, step_execution_id,
      attempt_number, submitted_at, submission_notes, evidence_snapshot,
      wafer_code_snapshot, template_name_snapshot, template_version_snapshot,
      process_step_name_snapshot, process_step_order_snapshot, reviewer_name_snapshot,
      submitted_by_name_snapshot, prior_step_status, client_mutation_id
    ) values (
      $1, gen_random_uuid(), gen_random_uuid(), $2, $3, gen_random_uuid(),
      1, $4, 'Shared batch note', $5::jsonb,
      $6, 'Saeed', '1.0', 'Pre-Bake', 110, 'Reviewer',
      'Operator', 'running', gen_random_uuid()
    )`,
    [attemptId, id.template, id.step, submittedAt, evidence, waferCode]
  );
}

await db.query(
  `insert into public.checkpoint_decisions (id, attempt_id, decision)
   values ($1, $2, 'approved'), ($3, $4, 'redo')`,
  [id.decisionOne, id.attemptOne, id.decisionTwo, id.attemptTwo]
);

await db.exec("set role authenticated");
const history = await db.query(
  `select id, batch_id, process_name, submitted_at, operator_name, note, status,
          sample_count::integer as sample_count, samples
   from public.vw_process_batch_history
   where template_id = $1
   order by submitted_at desc`,
  [id.template]
);
await db.exec("reset role");

assert.equal(history.rows.length, 2);
assert.equal(history.rows[0].batch_id, id.batch);
assert.equal(history.rows[0].sample_count, 2);
assert.equal(history.rows[0].status, "mixed");
assert.deepEqual(history.rows[0].samples.map((sample) => sample.label), ["ALPHA-A1", "ALPHA-A2"]);
assert.equal(history.rows[1].batch_id, null);
assert.equal(history.rows[1].sample_count, 1);
assert.equal(history.rows[1].status, "awaiting_review");

const indexes = await db.query(
  `select indexname from pg_indexes
   where schemaname = 'public'
     and indexname in ('process_step_attempts_template_submitted_idx', 'process_step_attempts_batch_idx')
   order by indexname`
);
assert.equal(indexes.rows.length, 2);

console.log(JSON.stringify({
  ok: true,
  groupedBatchSamples: history.rows[0].sample_count,
  legacySingletonSamples: history.rows[1].sample_count,
  groupedStatus: history.rows[0].status,
  indexes: indexes.rows.map((row) => row.indexname)
}, null, 2));
