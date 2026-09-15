import type { EmailOtpType } from "@supabase/supabase-js";
import { safeAuthRedirectPath } from "./password-recovery";

type AuthFailure = { code?: string; message: string };
type ConfirmationAuth = {
  exchangeCodeForSession: (code: string) => Promise<{ error: AuthFailure | null }>;
  verifyOtp: (params: { token_hash: string; type: EmailOtpType }) => Promise<{ error: AuthFailure | null }>;
};
const allowedOtpTypes = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export function confirmationErrorPath(code = "confirmation_failed") {
  return `/?error_code=${encodeURIComponent(code)}`;
}

export function confirmationErrorMessage(code: string | undefined) {
  if (!code) return null;
  if (code === "otp_expired") {
    return "This confirmation link has expired or was already used. Try signing in, or request a new link below.";
  }
  if (["bad_code_verifier", "flow_state_not_found", "flow_state_expired", "pkce_verifier_missing"].includes(code)) {
    return "This link could not finish signing you in in this browser. Try signing in with your email and password, or request a new confirmation link below.";
  }
  if (code === "confirmation_unavailable") {
    return "Email verification is temporarily unavailable. Try the link again shortly.";
  }
  return "We could not verify this confirmation link. Try signing in, or request a new link below.";
}

export async function confirmEmail(params: URLSearchParams, auth: ConfirmationAuth) {
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const next = safeAuthRedirectPath(params.get("next"));
  const failureCode = params.get("error_code") ?? params.get("error");
  if (failureCode) return confirmationErrorPath(failureCode);

  try {
    // Direct token hashes work even when email opens on another browser/device.
    if (tokenHash && type && allowedOtpTypes.has(type)) {
      const { error } = await auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
      return error ? confirmationErrorPath(error.code) : next;
    }
    // Keep previously issued PKCE links working in the originating browser.
    if (code) {
      const { error } = await auth.exchangeCodeForSession(code);
      return error ? confirmationErrorPath(error.code) : next;
    }
    return confirmationErrorPath("confirmation_missing");
  } catch {
    return confirmationErrorPath("confirmation_unavailable");
  }
}
