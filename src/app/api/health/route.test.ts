import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { GET } from "./route";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  mock.restoreAll();

  if (originalUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }

  if (originalPublishableKey === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalPublishableKey;
  }
});

describe("GET /api/health", () => {
  it("returns 503 when PostgREST cannot build its schema cache", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
    mock.method(globalThis, "fetch", async () =>
      Response.json({ code: "PGRST002" }, { status: 503 })
    );

    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.ok, false);
    assert.equal(body.supabase.errorCode, "PGRST002");
  });

  it("returns 200 only after the live PostgREST probe succeeds", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
    mock.method(globalThis, "fetch", async () => new Response("[]", { status: 200 }));

    const response = await GET();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.supabase.state, "healthy");
  });
});
