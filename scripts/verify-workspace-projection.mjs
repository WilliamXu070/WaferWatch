import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/202607210007_workspace_read_models.sql", import.meta.url), "utf8");
const bridge = await readFile(new URL("../src/features/collaboration/RealtimeWorkflowBridge.tsx", import.meta.url), "utf8");
const processFlow = await readFile(new URL("../src/features/process-flows/queries.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/features/dashboard/queries.ts", import.meta.url), "utf8");
const wafers = await readFile(new URL("../src/features/wafers/queries.ts", import.meta.url), "utf8");

for (const view of [
  "vw_process_current_state",
  "vw_operation_run_history",
  "vw_batch_run_state",
  "vw_plan_current_state",
  "vw_plan_actual_state"
]) assert.match(sql, new RegExp(`create or replace view public\\.${view}\\b`));

assert.match(sql, /create or replace function public\.get_process_workspace_snapshot/);
assert.match(sql, /create or replace function public\.get_process_workspace_delta/);
assert.match(sql, /limit 101/);
assert.match(sql, /limit 100/);
assert.match(sql, /ends_at >= now\(\) - interval '8 days'/);
assert.match(bridge, /applyCommittedRevisions/);
assert.match(bridge, /delta\.hasGap/);
assert.match(processFlow, /vw_process_current_state/);
assert.match(dashboard, /vw_process_current_state/);
assert.match(dashboard, /vw_batch_run_state/);
assert.match(dashboard, /vw_plan_actual_state/);
assert.match(wafers, /vw_operation_run_history/);
assert.doesNotMatch(dashboard, /vw_process_batch_history|buildPlannedBatches|step_executions/);
assert.doesNotMatch(wafers, /from\("step_executions"\)|listOptionalCheckpointRows|pickCurrentStepExecution/);

console.log(JSON.stringify({
  snapshot: "bounded current state, plan, active batches, and calendar",
  delta: "100 ordered revisions maximum",
  convergence: "duplicate suppression and gap snapshot fallback",
  routeCutover: "Process Flow, Dashboard, and Wafer Status use canonical projections"
}, null, 2));
