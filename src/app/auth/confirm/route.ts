import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_MAX_AGE_SECONDS,
  safeAuthRedirectPath
} from "@/lib/auth/password-recovery";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const allowedOtpTypes = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

function redirectTo(request: NextRequest, path: string, passwordRecovery = false) {
  const response = NextResponse.redirect(new URL(path, request.url));

  if (passwordRecovery) {
    response.cookies.set(PASSWORD_RECOVERY_COOKIE, "1", {
      httpOnly: true,
      maxAge: PASSWORD_RECOVERY_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:"
    });
  }

  return response;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/dashboard";
  const safeNext = safeAuthRedirectPath(next);
  const oauthError = searchParams.get("error") ?? searchParams.get("error_code");
  const oauthErrorDescription = searchParams.get("error_description");

  if (oauthError) {
    const message = oauthErrorDescription ?? oauthError;
    return redirectTo(request, `/?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createServerSupabaseClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirectTo(request, `/?error=${encodeURIComponent(error.message)}`);
    }

    return redirectTo(request, safeNext, safeNext === "/reset-password");
  }

  if (tokenHash && type && allowedOtpTypes.has(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType
    });

    if (error) {
      return redirectTo(request, `/?error=${encodeURIComponent(error.message)}`);
    }

    return redirectTo(request, safeNext, safeNext === "/reset-password");
  }

  return redirectTo(
    request,
    "/?error=The confirmation link is missing a verification code."
  );
}
