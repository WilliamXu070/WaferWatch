import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_PROCESS_COOKIE_NAME,
  getActiveProcessCookieOptions,
  isActiveProcessDestination,
  isProcessUuid,
  parseActiveProcessSelection,
  resolveActiveProcessCandidate
} from "./selection";

const SELECTED_ID = "9fb7de9e-31b8-4b5a-aea7-8ee64eedb699";
const FALLBACK_ID = "5d7f4838-7877-4f24-879a-d6fce52454f7";

test("defines a non-persistent HTTP-only active-process session cookie", () => {
  assert.equal(ACTIVE_PROCESS_COOKIE_NAME, "waferwatch_active_process_v1");
  assert.deepEqual(getActiveProcessCookieOptions(true), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true
  });
  assert.equal("maxAge" in getActiveProcessCookieOptions(true), false);
  assert.equal("expires" in getActiveProcessCookieOptions(true), false);
  assert.equal(getActiveProcessCookieOptions(false).secure, false);
});

test("accepts UUID process candidates and only authenticated product destinations", () => {
  assert.equal(isProcessUuid(SELECTED_ID), true);
  assert.equal(isProcessUuid("process-1"), false);
  assert.equal(isActiveProcessDestination("/analysis"), true);
  assert.equal(isActiveProcessDestination("/api/processes/123/workspace"), false);
  assert.equal(isActiveProcessDestination("https://example.com"), false);
  assert.deepEqual(parseActiveProcessSelection({
    processId: SELECTED_ID,
    destination: "/process-flow"
  }), {
    processId: SELECTED_ID,
    destination: "/process-flow"
  });
  assert.equal(parseActiveProcessSelection(null), null);
  assert.equal(parseActiveProcessSelection({ processId: SELECTED_ID, destination: "/api/processes" }), null);
});

test("uses an accessible active cookie candidate, including a draft", async () => {
  const draft = { id: SELECTED_ID, lifecycle: "draft" };
  let fallbackCalled = false;
  const resolved = await resolveActiveProcessCandidate(
    SELECTED_ID,
    async (processId) => processId === SELECTED_ID ? draft : null,
    async () => {
      fallbackCalled = true;
      return { id: FALLBACK_ID, lifecycle: "published" };
    }
  );

  assert.deepEqual(resolved, draft);
  assert.equal(fallbackCalled, false);
});

test("missing, malformed, inactive, deleted, or unauthorized candidates fall back safely", async () => {
  for (const candidate of [null, "not-a-uuid", SELECTED_ID]) {
    let candidateLookups = 0;
    const resolved = await resolveActiveProcessCandidate(
      candidate,
      async () => {
        candidateLookups += 1;
        return null;
      },
      async () => ({ id: FALLBACK_ID })
    );

    assert.deepEqual(resolved, { id: FALLBACK_ID });
    assert.equal(candidateLookups, candidate === SELECTED_ID ? 1 : 0);
  }
});

test("returns null when neither the cookie candidate nor fallback is available", async () => {
  assert.equal(
    await resolveActiveProcessCandidate(SELECTED_ID, async () => null, async () => null),
    null
  );
});
