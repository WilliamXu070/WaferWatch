"use server";

import { AppError } from "@/lib/errors";
import { requireAccount } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  parseActiveProcessSelection
} from "./selection";
import { setActiveProcessCookie } from "./server";

export async function selectActiveProcess(input: unknown) {
  const selection = parseActiveProcessSelection(input);
  if (!selection) throw new AppError("Select a valid process and destination.", 400);

  await requireAccount();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("process_templates")
    .select("id, name, version, owner_project_id")
    .eq("id", selection.processId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AppError("That process is unavailable.", 404);

  await setActiveProcessCookie(data.id);
  return {
    process: {
      id: data.id,
      name: data.name,
      version: data.version,
      ownerProjectId: data.owner_project_id
    },
    destination: selection.destination
  };
}
