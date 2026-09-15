import assert from "node:assert/strict";
import test from "node:test";
import { confirmEmail, confirmationErrorMessage } from "./confirmation";

function authStub(error: { code?: string; message: string } | null = null) {
  const calls: unknown[] = [];
  return {
    calls,
    exchangeCodeForSession: async (code: string) => {
      calls.push({ code });
      return { error };
    },
    verifyOtp: async (params: { token_hash: string; type: string }) => {
      calls.push(params);
      return { error };
    }
  };
}

test("email token confirmation does not require the signup browser's PKCE verifier", async () => {
  const auth = authStub();
  auth.exchangeCodeForSession = async () => { throw new Error("No verifier in this browser"); };
  assert.equal(await confirmEmail(new URLSearchParams("token_hash=test-token&type=email&next=/dashboard"), auth), "/dashboard");
  assert.deepEqual(auth.calls, [{ token_hash: "test-token", type: "email" }]);
});

test("existing PKCE links still exchange their code", async () => {
  const auth = authStub();
  assert.equal(await confirmEmail(new URLSearchParams("code=existing-code"), auth), "/dashboard");
  assert.deepEqual(auth.calls, [{ code: "existing-code" }]);
});

test("expired tokens preserve the error code needed to render resend", async () => {
  const path = await confirmEmail(new URLSearchParams("token_hash=expired&type=email"), authStub({ code: "otp_expired", message: "Expired" }));
  assert.equal(path, "/?error_code=otp_expired");
  assert.match(confirmationErrorMessage("otp_expired")!, /request a new link/);
});

test("missing browser verifier offers sign-in and a fresh link", async () => {
  const path = await confirmEmail(new URLSearchParams("code=existing-code"), authStub({ code: "pkce_verifier_missing", message: "Missing verifier" }));
  assert.equal(path, "/?error_code=pkce_verifier_missing");
  assert.match(confirmationErrorMessage("pkce_verifier_missing")!, /email and password/);
});

test("provider callback errors preserve error_code and never consume a token", async () => {
  const auth = authStub();
  assert.equal(await confirmEmail(new URLSearchParams("error=access_denied&error_code=otp_expired&token_hash=unused&type=email"), auth), "/?error_code=otp_expired");
  assert.deepEqual(auth.calls, []);
});

test("missing or unsupported verification input cannot authenticate", async () => {
  for (const query of ["", "token_hash=test", "token_hash=test&type=admin"]) {
    const auth = authStub();
    assert.equal(await confirmEmail(new URLSearchParams(query), auth), "/?error_code=confirmation_missing");
    assert.deepEqual(auth.calls, []);
  }
});

test("network exceptions produce a retry message without leaking provider details", async () => {
  const auth = authStub();
  auth.verifyOtp = async () => { throw new Error("private upstream details"); };
  assert.equal(await confirmEmail(new URLSearchParams("token_hash=test&type=email"), auth), "/?error_code=confirmation_unavailable");
});

test("verification cannot redirect outside the application", async () => {
  for (const next of ["https://example.com", "//example.com", "/\\example.com", "/\n/example.com"]) {
    const params = new URLSearchParams({ token_hash: "test", type: "email", next });
    assert.equal(await confirmEmail(params, authStub()), "/dashboard");
  }
});

test("recovery token retains the password reset destination", async () => {
  assert.equal(await confirmEmail(new URLSearchParams("token_hash=test&type=recovery&next=/reset-password"), authStub()), "/reset-password");
});
