"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  textSurfaceIdentitySchema,
  textSurfaceJsonArrayMutationSchema,
  textSurfaceUpsertSchema
} from "@/features/text-surfaces/schemas";
import type { Json } from "@/types/database";

export type TextSurfaceRecord = {
  id: string;
  projectId: string;
  scopeType: string;
  scopeKey: string;
  fieldKey: string;
  value: string;
  version: number;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapTextSurface(row: {
  id: string;
  project_id: string;
  scope_type: string;
  scope_key: string;
  field_key: string;
  value: string;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}): TextSurfaceRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    scopeType: row.scope_type,
    scopeKey: row.scope_key,
    fieldKey: row.field_key,
    value: row.value,
    version: row.version,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getTextSurface(input: unknown) {
  try {
    const parsed = textSurfaceIdentitySchema.parse(input);
    await assertProjectAccess(parsed.projectId, "read");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("text_surfaces")
      .select("*")
      .eq("project_id", parsed.projectId)
      .eq("scope_type", parsed.scopeType)
      .eq("scope_key", parsed.scopeKey)
      .eq("field_key", parsed.fieldKey)
      .maybeSingle();

    if (error) {
      return fail(error.message);
    }

    return ok(data ? mapTextSurface(data) : null);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function upsertTextSurface(input: unknown) {
  try {
    await requireAccount();
    const parsed = textSurfaceUpsertSchema.parse(input);
    await assertProjectAccess(parsed.projectId, "write");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .rpc("upsert_text_surface_versioned", {
        target_project_id: parsed.projectId,
        target_scope_type: parsed.scopeType,
        target_scope_key: parsed.scopeKey,
        target_field_key: parsed.fieldKey,
        next_value: parsed.value,
        expected_version: parsed.expectedVersion ?? null
      });

    if (error) {
      return fail(error.message);
    }

    revalidatePath("/", "layout");
    return ok(mapTextSurface(data));
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function mutateTextSurfaceJsonArray(input: unknown) {
  try {
    await requireAccount();
    const parsed = textSurfaceJsonArrayMutationSchema.parse(input);
    await assertProjectAccess(parsed.projectId, "write");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("mutate_text_surface_json_array", {
      target_project_id: parsed.projectId,
      target_scope_type: parsed.scopeType,
      target_scope_key: parsed.scopeKey,
      target_field_key: parsed.fieldKey,
      operation: parsed.operation,
      item_id: parsed.itemId,
      item: parsed.item ? parsed.item as Json : null
    });

    if (error) {
      return fail(error.message);
    }

    revalidatePath("/", "layout");
    return ok(mapTextSurface(data));
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
