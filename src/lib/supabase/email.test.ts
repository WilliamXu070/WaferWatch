import assert from "node:assert/strict";
import test from "node:test";
import { createEmailAuthClient } from "./email";

test("signup and recovery email requests omit browser-bound PKCE challenges", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ id: "test-user", email: "test@example.com", identities: [] }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  });
  const client = createEmailAuthClient("https://example.supabase.co", "test-publishable-key");
  const signup = await client.auth.signUp({ email: "test@example.com", password: "test-password-123", options: { emailRedirectTo: "https://example.com/auth/confirm" } });
  assert.equal(signup.error, null);
  assert.equal(signup.data.session, null);
  await client.auth.resetPasswordForEmail("test@example.com");
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    assert.ok(!body.code_challenge, "email confirmation must not depend on another browser's verifier");
    assert.ok(!body.code_challenge_method);
  }
});
