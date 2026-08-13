import assert from "node:assert/strict";
import test from "node:test";
import { getLegacyProcessSelectionRedirect } from "./legacy";

const PROCESS_ID = "9fb7de9e-31b8-4b5a-aea7-8ee64eedb699";

test("strips only processId from legacy product links", () => {
  assert.deepEqual(
    getLegacyProcessSelectionRedirect(new URL(
      `https://wafer-watch.vercel.app/wafer-status?processId=${PROCESS_ID}&waferId=wafer-1&dieLabel=A1&tab=history&view=compact`
    )),
    {
      processId: PROCESS_ID,
      destination: "/wafer-status?waferId=wafer-1&dieLabel=A1&tab=history&view=compact"
    }
  );
});

test("cleans malformed candidates without selecting them", () => {
  assert.deepEqual(
    getLegacyProcessSelectionRedirect(new URL("https://wafer-watch.vercel.app/analysis?processId=not-a-uuid&mode=compare")),
    { processId: null, destination: "/analysis?mode=compare" }
  );
});

test("bridges legacy process resource links to clean Process Flow", () => {
  assert.deepEqual(
    getLegacyProcessSelectionRedirect(new URL(`https://wafer-watch.vercel.app/processes/${PROCESS_ID}`)),
    { processId: PROCESS_ID, destination: "/process-flow" }
  );
  assert.deepEqual(
    getLegacyProcessSelectionRedirect(new URL("https://wafer-watch.vercel.app/processes/%E0%A4%A")),
    { processId: null, destination: "/process-flow" }
  );
});

test("ignores internal API and ordinary clean product URLs", () => {
  assert.equal(
    getLegacyProcessSelectionRedirect(new URL(`https://wafer-watch.vercel.app/api/processes/${PROCESS_ID}/workspace`)),
    null
  );
  assert.equal(
    getLegacyProcessSelectionRedirect(new URL("https://wafer-watch.vercel.app/process-flow")),
    null
  );
});
