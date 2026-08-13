import { NextResponse, type NextRequest } from "next/server";
import { getLegacyProcessSelectionRedirect } from "@/features/process-selection/legacy";
import {
  ACTIVE_PROCESS_COOKIE_NAME,
  getActiveProcessCookieOptions
} from "@/features/process-selection/selection";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const sessionResponse = await updateSession(request);
  const legacySelection = getLegacyProcessSelectionRedirect(request.nextUrl);
  if (!legacySelection) return sessionResponse;

  const destination = new URL(legacySelection.destination, request.url);
  const response = NextResponse.redirect(destination, 307);

  for (const cookie of sessionResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }

  if (legacySelection.processId) {
    response.cookies.set(
      ACTIVE_PROCESS_COOKIE_NAME,
      legacySelection.processId,
      getActiveProcessCookieOptions(destination.protocol === "https:")
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
