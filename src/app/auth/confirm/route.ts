import { type NextRequest, NextResponse } from "next/server";
import { confirmEmail } from "@/lib/auth/confirmation";
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_MAX_AGE_SECONDS,
  safeAuthRedirectPath
} from "@/lib/auth/password-recovery";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  const params = request.nextUrl.searchParams;
  if (!["code", "token_hash", "error", "error_code"].some((key) => params.has(key))) {
    // URL fragments are not sent to the server. Browsers carry them through
    // this redirect so the completion page can establish the SSR session.
    const next = safeAuthRedirectPath(params.get("next"));
    const response = redirectTo(request, `/auth/finish?next=${encodeURIComponent(next)}`);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  const supabase = await createServerSupabaseClient();
  const path = await confirmEmail(request.nextUrl.searchParams, supabase.auth);
  const response = redirectTo(request, path, path === "/reset-password");
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
