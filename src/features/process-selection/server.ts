import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { AccountContext } from "@/lib/auth/session";
import { getCurrentAccount } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ACTIVE_PROCESS_COOKIE_NAME,
  getActiveProcessCookieOptions,
  resolveActiveProcessCandidate
} from "./selection";

export type ActiveProcessSelection = {
  id: string;
  name: string;
  version: string;
  owner_project_id: string | null;
};

async function requestUsesHttps() {
  const requestHeaders = await headers();
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProtocol) return forwardedProtocol === "https";

  const origin = requestHeaders.get("origin") ?? requestHeaders.get("referer");
  if (origin) {
    try {
      return new URL(origin).protocol === "https:";
    } catch {
      // Fall through to the deployment environment when the header is malformed.
    }
  }

  return process.env.VERCEL === "1";
}

const resolveActiveProcessForRequest = cache(async (
  accountUserId: string
): Promise<ActiveProcessSelection | null> => {
  const account = await getCurrentAccount();
  if (!account || account.userId !== accountUserId) return null;

  const cookieStore = await cookies();
  const candidate = cookieStore.get(ACTIVE_PROCESS_COOKIE_NAME)?.value ?? null;
  const supabase = await createServerSupabaseClient();

  return resolveActiveProcessCandidate(
    candidate,
    async (processId) => {
      const selectedResult = await supabase
        .from("process_templates")
        .select("id, name, version, owner_project_id")
        .eq("id", processId)
        .eq("is_active", true)
        .maybeSingle();

      if (selectedResult.error) throw selectedResult.error;
      return selectedResult.data;
    },
    async () => {
      const fallbackResult = await supabase
        .from("process_templates")
        .select("id, name, version, owner_project_id")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .order("name", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallbackResult.error) throw fallbackResult.error;
      return fallbackResult.data;
    }
  );
});

export async function resolveActiveProcess(
  knownAccount?: AccountContext | null
): Promise<ActiveProcessSelection | null> {
  const account = knownAccount === undefined ? await getCurrentAccount() : knownAccount;
  return account ? resolveActiveProcessForRequest(account.userId) : null;
}

export async function setActiveProcessCookie(processId: string) {
  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_PROCESS_COOKIE_NAME,
    processId,
    getActiveProcessCookieOptions(await requestUsesHttps())
  );
}

export async function clearActiveProcessCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_PROCESS_COOKIE_NAME);
}

export async function clearActiveProcessCookieIfSelected(processId: string) {
  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_PROCESS_COOKIE_NAME)?.value === processId) {
    cookieStore.delete(ACTIVE_PROCESS_COOKIE_NAME);
  }
}
