"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
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
    .select("id")
    .eq("id", selection.processId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AppError("That process is unavailable.", 404);

  await setActiveProcessCookie(data.id);
  refresh();
  redirect(selection.destination);
}
