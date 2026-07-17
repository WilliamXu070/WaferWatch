import assert from "node:assert/strict";
import test from "node:test";
import { dieDetailTabs, getHistoryWorkspaceCapability } from "./waferDieDetailData";

test("keeps Die Status to Overview and Process History", () => {
  assert.deepEqual(dieDetailTabs, [
    { id: "overview", label: "Overview" },
    { id: "history", label: "Process History" }
  ]);
});

test("uses explicit workspace capability before the legacy step-name fallback", () => {
  assert.equal(getHistoryWorkspaceCapability({
    stepName: "Custom stage",
    processArea: "Fabrication",
    parametersSchema: { historyWorkspace: "inspection" }
  }), "inspection");
  assert.equal(getHistoryWorkspaceCapability({
    stepName: "Fixture Poling",
    processArea: "Fabrication"
  }), "poling");
  assert.equal(getHistoryWorkspaceCapability({
    stepName: "Test & Inspection",
    processArea: "Characterization"
  }), "inspection");
  assert.equal(getHistoryWorkspaceCapability({
    stepName: "Etch",
    processArea: "Fabrication"
  }), "generic");
});
