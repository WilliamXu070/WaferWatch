import assert from "node:assert/strict";
import test from "node:test";
import { getTimelineItemLabelMode } from "./CalendarTimelineItemRenderer";

test("keeps a readable label mode at every event width", () => {
  assert.equal(getTimelineItemLabelMode(20), "marker");
  assert.equal(getTimelineItemLabelMode(44), "marker");
  assert.equal(getTimelineItemLabelMode(45), "compact");
  assert.equal(getTimelineItemLabelMode(132), "compact");
  assert.equal(getTimelineItemLabelMode(133), "full");
});
