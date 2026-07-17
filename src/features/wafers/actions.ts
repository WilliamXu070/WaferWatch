"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  waferDiePolingParameterBatchSchema
} from "@/features/wafers/schemas";
import type { Json } from "@/types/database";

export async function updateWaferDiePolingParameters(input: unknown) {
  try {
    await requireAccount();
    const parsed = waferDiePolingParameterBatchSchema.parse(input);

    const supabase = await createServerSupabaseClient();
    const { data: wafer, error: waferError } = await supabase
      .from("wafers")
      .select("id, project_id, metadata")
      .eq("id", parsed.waferId)
      .single();

    if (waferError) {
      return fail(waferError.message);
    }

    await assertProjectAccess(wafer.project_id, "write");

    const { data, error } = await supabase.rpc("patch_wafer_die_poling_parameters", {
      target_wafer_id: parsed.waferId,
      target_die_code: parsed.dieCode,
      updates: parsed.updates as Json
    });

    if (error) {
      return fail(error.message);
    }

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
