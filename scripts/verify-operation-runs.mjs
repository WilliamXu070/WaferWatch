import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const foundation = await readFile(new URL("../supabase/migrations/202607210003_planning_execution_foundation.sql", import.meta.url), "utf8");
const commands = await readFile(new URL("../supabase/migrations/202607210005_operation_run_commands.sql", import.meta.url), "utf8");
const bridge = await readFile(new URL("../supabase/migrations/202607210006_compatibility_operation_bridge.sql", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/features/runs/actions.ts", import.meta.url), "utf8");

for (const table of [
  "operation_runs",
  "operation_run_members",
  "operation_run_links",
  "operation_run_parameter_records",
  "operation_run_notes",
  "operation_run_resources"
]) assert.match(foundation, new RegExp(`create table if not exists public\\.${table}\\b`));

for (const command of [
  "start_operation_run",
  "complete_operation_run",
  "submit_operation_run",
  "review_operation_run_members"
]) assert.match(commands, new RegExp(`create or replace function public\\.${command}\\b`));

assert.match(commands, /array_length\(assignment_ids, 1\) > 256/);
assert.match(commands, /order by assignment\.id[\s\S]*for update/);
assert.match(commands, /pg_advisory_xact_lock/g);
assert.match(commands, /operation_run_member_id, submission_group_id/);
assert.match(commands, /'redo', 'queued'/);
assert.match(commands, /link_kind\)[\s\S]*'split'/);
assert.match(bridge, /execute_process_flow_mutations_batch/);
assert.match(actions, /execute_process_flow_mutations_batch/);
assert.doesNotMatch(actions, /DASHBOARD_BATCH_EVIDENCE_KEY|withDashboardBatchEvidence|recordPlannedBatchMember|batchIdForStepExecution/);
assert.doesNotMatch(actions, /WORKER_COUNT|Promise\.all\(workers/);

console.log(JSON.stringify({
  repeats: "distinct operation run identity",
  batchLimit: 256,
  locking: "sorted assignment/member locks plus mutation advisory lock",
  review: "per-member approve, redo, and dicing split",
  compatibility: "one atomic Process Flow RPC"
}, null, 2));
