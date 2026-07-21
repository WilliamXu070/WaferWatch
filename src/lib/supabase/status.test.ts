import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { checkSupabaseHealth } from "./status";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
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

describe("checkSupabaseHealth", () => {
  it("reports a healthy live PostgREST response", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    const result = await checkSupabaseHealth({
      fetchImpl: async () => new Response("[]", { status: 200 })
    });

    assert.equal(result.ok, true);
    assert.equal(result.state, "healthy");
    assert.equal(result.httpStatus, 200);
    assert.equal(result.errorCode, null);
  });

  it("surfaces the production PGRST002 schema-cache outage", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    const result = await checkSupabaseHealth({
      fetchImpl: async () =>
        Response.json(
          {
            code: "PGRST002",
            message: "Could not query the database for the schema cache. Retrying."
          },
          { status: 503 }
        )
    });

    assert.equal(result.ok, false);
    assert.equal(result.state, "unavailable");
    assert.equal(result.httpStatus, 503);
    assert.equal(result.errorCode, "PGRST002");
  });

  it("reports missing runtime configuration without issuing a request", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    let requested = false;

    const result = await checkSupabaseHealth({
      fetchImpl: async () => {
        requested = true;
        return new Response("[]", { status: 200 });
      }
    });

    assert.equal(requested, false);
    assert.equal(result.ok, false);
    assert.equal(result.state, "misconfigured");
    assert.equal(result.errorCode, "MISSING_CONFIGURATION");
  });
});
