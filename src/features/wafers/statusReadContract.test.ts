import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Wafer Status reads its bounded definition, state, and history without loading the workspace document", async () => {
  const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
  const statusModel = source.slice(source.indexOf("export async function getWaferStatusModel"));

  assert.doesNotMatch(statusModel, /get_process_workspace_snapshot/);
  assert.match(statusModel, /from\("process_steps"\)/);
  assert.match(statusModel, /from\("vw_process_current_state"\)/);
  assert.match(statusModel, /from\("vw_operation_run_history"\)/);
  assert.match(statusModel, /\.limit\(MAX_STATUS_HISTORY_ROWS\)/);
});
