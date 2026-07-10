"use server";

import { fail, ok } from "@/lib/action-result";
import { requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TeamMessage } from "@/types/database";
import { teamMessageSendSchema } from "./schemas";

export async function sendTeamMessage(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = teamMessageSendSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("team_messages")
      .insert({
        author_id: account.userId,
        author_name: account.profile.display_name?.trim() || account.email || "Process user",
        body: parsed.body
      })
      .select("id, author_id, author_name, body, created_at")
      .single();

    if (error) {
      return fail(error.message);
    }

    return ok(data satisfies TeamMessage);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
