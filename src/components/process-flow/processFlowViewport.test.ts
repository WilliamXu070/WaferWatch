import assert from "node:assert/strict";
import test from "node:test";
import {
  captureProcessFlowViewport,
  getProcessFlowViewportScrollPosition,
  getProcessFlowViewportStorageKey,
  parseProcessFlowViewport,
  readProcessFlowViewport,
  serializeProcessFlowViewport,
  writeProcessFlowViewport,
  type ProcessFlowViewportSnapshot
} from "./processFlowViewport";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value)
  };
}

const snapshot: ProcessFlowViewportSnapshot = {
  version: 1,
  scale: 1.25,
  centerX: 1200,
  centerY: 800
};

test("serializes and parses the versioned viewport contract", () => {
  assert.deepEqual(parseProcessFlowViewport(serializeProcessFlowViewport(snapshot)), snapshot);
});

test("rejects malformed, incomplete, and unsupported snapshots", () => {
  assert.equal(parseProcessFlowViewport("not-json"), null);
  assert.equal(parseProcessFlowViewport('{"version":2,"scale":1,"centerX":0,"centerY":0}'), null);
  assert.equal(parseProcessFlowViewport('{"version":1,"scale":1,"centerX":-1,"centerY":0}'), null);
  assert.equal(parseProcessFlowViewport(null), null);
});

test("clamps restored scale to the supported zoom range", () => {
  assert.equal(parseProcessFlowViewport('{"version":1,"scale":20,"centerX":0,"centerY":0}')?.scale, 2.6);
  assert.equal(parseProcessFlowViewport('{"version":1,"scale":0.01,"centerX":0,"centerY":0}')?.scale, 0.35);
});

test("stores independent viewport state for every process", () => {
  const storage = createMemoryStorage();
  writeProcessFlowViewport(storage, "process-a", snapshot);
  writeProcessFlowViewport(storage, "process-b", { ...snapshot, centerX: 2200 });

  assert.notEqual(getProcessFlowViewportStorageKey("process-a"), getProcessFlowViewportStorageKey("process-b"));
  assert.equal(readProcessFlowViewport(storage, "process-a")?.centerX, 1200);
  assert.equal(readProcessFlowViewport(storage, "process-b")?.centerX, 2200);
});

test("captures scene-space center and restores it across viewport sizes", () => {
  const captured = captureProcessFlowViewport({
    scale: 1.25,
    scrollLeft: 1000,
    scrollTop: 750,
    clientWidth: 1000,
    clientHeight: 500
  });
  assert.deepEqual(captured, { version: 1, scale: 1.25, centerX: 1200, centerY: 800 });

  assert.deepEqual(getProcessFlowViewportScrollPosition({
    snapshot: captured,
    clientWidth: 500,
    clientHeight: 300,
    sceneWidth: 4400,
    sceneHeight: 3200
  }), { scrollLeft: 1250, scrollTop: 850 });
});

test("clamps restoration to the scaled scene bounds", () => {
  assert.deepEqual(getProcessFlowViewportScrollPosition({
    snapshot: { version: 1, scale: 1, centerX: 10000, centerY: 10000 },
    clientWidth: 1000,
    clientHeight: 600,
    sceneWidth: 4400,
    sceneHeight: 3200
  }), { scrollLeft: 3400, scrollTop: 2600 });
});

test("returns null when browser storage is unavailable", () => {
  const throwingStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); }
  };
  assert.equal(readProcessFlowViewport(throwingStorage, "blocked-process"), null);
  assert.equal(writeProcessFlowViewport(throwingStorage, "blocked-process", snapshot), false);
});
