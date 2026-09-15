import assert from "node:assert/strict";
import test from "node:test";
import { readEmailFragment } from "./email-fragment";

test("default Supabase signup email fragment can complete without a PKCE cookie", () => {
  assert.deepEqual(readEmailFragment("#access_token=test-access&refresh_token=test-refresh&type=signup", "/dashboard"), {
    session: { accessToken: "test-access", refreshToken: "test-refresh", type: "signup", next: "/dashboard" }
  });
});

test("expired default email link exposes the resend screen", () => {
  assert.deepEqual(readEmailFragment("#error=access_denied&error_code=otp_expired&error_description=Expired", "/dashboard"), { errorPath: "/?error_code=otp_expired" });
});

test("partial and absent fragments cannot create a session", () => {
  for (const hash of ["", "#access_token=test", "#refresh_token=test"]) {
    assert.deepEqual(readEmailFragment(hash, "/dashboard"), { errorPath: "/?error_code=confirmation_missing" });
  }
});

test("password recovery goes to reset even when the provider falls back to the site URL", () => {
  const result = readEmailFragment("#access_token=test&refresh_token=test&type=recovery", "/dashboard");
  assert.equal(result.session?.next, "/reset-password");
});

test("fragment navigation cannot escape to an external site", () => {
  const result = readEmailFragment("#access_token=test&refresh_token=test&type=signup", "/\\example.com");
  assert.equal(result.session?.next, "/dashboard");
});
