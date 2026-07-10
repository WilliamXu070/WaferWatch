import assert from "node:assert/strict";
import test from "node:test";
import type { TeamMessage } from "@/types/database";
import { mergeTeamMessages } from "./merge";

function message(id: string, createdAt: string, body = id): TeamMessage {
  return {
    id,
    author_id: "11111111-1111-4111-8111-111111111111",
    author_name: "William",
    body,
    created_at: createdAt
  };
}

test("merges optimistic and realtime copies of one message exactly once", () => {
  const sent = message("message-1", "2026-07-10T14:00:00.000Z");
  assert.deepEqual(mergeTeamMessages([sent], [sent]), [sent]);
});

test("keeps messages chronological when initial fetch and realtime delivery race", () => {
  const earlier = message("message-1", "2026-07-10T14:00:00.000Z");
  const later = message("message-2", "2026-07-10T14:00:01.000Z");
  assert.deepEqual(mergeTeamMessages([later], [earlier]), [earlier, later]);
});
