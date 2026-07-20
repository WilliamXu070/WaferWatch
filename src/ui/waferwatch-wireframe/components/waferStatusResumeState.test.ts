import assert from "node:assert/strict";
import test from "node:test";
import {
  getWaferStatusResumeStorageKey,
  readWaferStatusResumeState,
  writeWaferStatusResumeState
} from "./waferStatusResumeState";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values
  };
}

test("keeps the last selected die and tab isolated to its process", () => {
  const storage = createStorage();
  writeWaferStatusResumeState(storage, "process-a", {
    version: 1,
    selected: { waferId: "wafer-a", dieLabel: "A1" },
    detail: true,
    tab: "history"
  });

  assert.deepEqual(readWaferStatusResumeState(storage, "process-a"), {
    version: 1,
    selected: { waferId: "wafer-a", dieLabel: "A1" },
    detail: true,
    tab: "history"
  });
  assert.equal(readWaferStatusResumeState(storage, "process-b"), null);
});

test("ignores malformed or outdated saved Status state", () => {
  const storage = createStorage();
  storage.values.set(getWaferStatusResumeStorageKey("process-a"), JSON.stringify({
    version: 1,
    selected: { waferId: "wafer-a", dieLabel: "A1" },
    detail: true,
    tab: "unsupported-tab"
  }));

  assert.equal(readWaferStatusResumeState(storage, "process-a"), null);
});
