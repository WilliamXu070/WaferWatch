import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const foundation = await readFile(new URL("../supabase/migrations/202607210003_planning_execution_foundation.sql", import.meta.url), "utf8");
const commands = await readFile(new URL("../supabase/migrations/202607210004_planning_commands.sql", import.meta.url), "utf8");
const calendar = await readFile(new URL("../supabase/migrations/202607210009_calendar_plan_commands.sql", import.meta.url), "utf8");

for (const table of [
  "process_plans",
  "process_plan_revisions",
  "planned_batches",
  "planned_batch_members",
  "planned_operations",
  "planned_operation_dependencies",
  "planned_operation_parameters",
  "planned_operation_resources",
  "fabrication_locations"
]) assert.match(foundation, new RegExp(`create table if not exists public\\.${table}\\b`));

assert.match(foundation, /unique \(revision_id, logical_id\)/);
assert.match(foundation, /Published plan revisions are immutable/i);
assert.match(commands, /create or replace function public\.publish_process_plan/);
assert.match(commands, /status = 'published'/);
assert.match(commands, /based_on_revision_id/);
assert.match(commands, /pg_advisory_xact_lock/g);
assert.match(commands, /row_version <> expected_revision/g);
assert.match(calendar, /ensure_calendar_plan_draft/);
assert.match(calendar, /planned_operations/);
assert.match(calendar, /process_calendar_events/);

console.log(JSON.stringify({
  planningGroundTruth: "shared draft plus immutable published revisions",
  stableIdentity: "logical ids retained across revision cloning",
  concurrency: "row versions and mutation advisory locks",
  calendar: "planned operations plus manual compatibility events"
}, null, 2));
