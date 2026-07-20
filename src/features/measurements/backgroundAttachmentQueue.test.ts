import assert from "node:assert/strict";
import test from "node:test";
import { getStableAttachmentObjectPath, mapWithConcurrency } from "./backgroundAttachmentQueue";

test("background attachment work never exceeds three concurrent uploads", async () => {
  let active = 0;
  let maximum = 0;
  await mapWithConcurrency(Array.from({ length: 12 }, (_, index) => index), 3, async (value) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value;
  });
  assert.equal(maximum, 3);
});

test("attachment retries derive the same stable object path", () => {
  const input = {
    projectId: "project",
    waferId: "wafer",
    dieLabel: "A1",
    category: "notes",
    noteId: "note-1",
    fileIndex: 0,
    fileName: "image.png"
  };
  assert.equal(getStableAttachmentObjectPath(input), getStableAttachmentObjectPath(input));
});
