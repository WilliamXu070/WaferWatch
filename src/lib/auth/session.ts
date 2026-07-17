import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { Profile, UserRole } from "@/types/database";

export type AccountContext = {
  userId: string;
  email: string | null;
  profile: Profile;
};

const getCurrentAccountForRequest = cache(async (): Promise<AccountContext | null> => {
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));

  if (!hasAuthCookie) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return null;
  }

  const userId = claimsData.claims.sub;
  const email =
    typeof claimsData.claims.email === "string" ? claimsData.claims.email : null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (profileError || !profile || !profile.is_active) {
    return null;
  }

  return {
    userId,
    email,
    profile
  };
});

/**
 * Resolves the signed-in account once per server request. Layouts and pages
 * often need both the account and its permissions; sharing this lookup avoids
 * repeating the auth-token verification and profile read on the first screen.
 */
export function getCurrentAccount(): Promise<AccountContext | null> {
  return getCurrentAccountForRequest();
}

export async function requireAccount() {
  const account = await getCurrentAccount();

  if (!account) {
    throw new AppError("Authentication is required.", 401);
  }

  return account;
}

export async function requireAccountOrRedirect() {
  const account = await getCurrentAccount();

  if (!account) {
    redirect("/");
  }

  return account;
}

export async function requireRole(roles: UserRole[]) {
  const account = await requireAccount();

  if (!roles.includes(account.profile.role)) {
    throw new AppError("You do not have permission to perform this action.", 403);
  }

  return account;
}

export async function requireProcessManager() {
  return requireRole(["admin", "process_engineer"]);
}

export function canManageProcessLibrary(role: UserRole) {
  return role === "admin" || role === "process_engineer";
}

export async function canEditProject(
  projectId: string,
  knownAccount?: AccountContext | null
) {
  const account = knownAccount ?? await getCurrentAccount();

  if (!account) {
    return false;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("can_edit_project", {
    target_project_id: projectId
  });

  return !error && Boolean(data);
}

export async function assertProjectAccess(projectId: string, mode: "read" | "write" = "read") {
  const account = await requireAccount();
  const supabase = await createServerSupabaseClient();
  const fn = mode === "write" ? "can_edit_project" : "can_access_project";
  const { data, error } = await supabase.rpc(fn, {
    target_project_id: projectId
  });

  if (error || !data) {
    throw new AppError("Project access denied.", 403);
  }

  return account;
}
