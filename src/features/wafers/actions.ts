"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  lotCreateSchema,
  waferCreateSchema,
  waferDieDescriptionSchema,
  waferStatusSchema
} from "@/features/wafers/schemas";
import type { Json } from "@/types/database";

function toMetadataObject(metadata: Json) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function toStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

export async function createWaferLot(input: unknown) {
  try {
    const parsed = lotCreateSchema.parse(input);
    await assertProjectAccess(parsed.projectId, "write");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("wafer_lots")
      .insert({
        project_id: parsed.projectId,
        lot_code: parsed.lotCode,
        substrate_material: parsed.substrateMaterial ?? null,
        wafer_size_mm: parsed.waferSizeMm ?? null,
        target_completion_at: parsed.targetCompletionAt ?? null
      })
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function createWafer(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = waferCreateSchema.parse(input);
    await assertProjectAccess(parsed.projectId, "write");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("wafers")
      .insert({
        project_id: parsed.projectId,
        lot_id: parsed.lotId ?? null,
        wafer_code: parsed.waferCode,
        material_stack: parsed.materialStack ?? null,
        diameter_mm: parsed.diameterMm ?? null,
        notes: parsed.notes ?? null,
        metadata: {
          created_by: account.userId
        }
      })
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    await supabase.from("process_events").insert({
      project_id: parsed.projectId,
      wafer_id: data.id,
      actor_id: account.userId,
      event_type: "wafer_created",
      metadata: {}
    });

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function updateWaferStatus(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = waferStatusSchema.parse(input);

    const supabase = await createServerSupabaseClient();
    const { data: wafer, error: waferError } = await supabase
      .from("wafers")
      .select("*")
      .eq("id", parsed.waferId)
      .single();

    if (waferError) {
      return fail(waferError.message);
    }

    await assertProjectAccess(wafer.project_id, "write");

    const { data, error } = await supabase
      .from("wafers")
      .update({
        status: parsed.status,
        notes: parsed.notes ?? wafer.notes
      })
      .eq("id", parsed.waferId)
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    await supabase.from("process_events").insert({
      project_id: wafer.project_id,
      wafer_id: parsed.waferId,
      actor_id: account.userId,
      event_type: "wafer_status_updated",
      notes: parsed.notes ?? null,
      metadata: {
        status: parsed.status
      }
    });

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function updateWaferDieDescription(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = waferDieDescriptionSchema.parse(input);

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

    const metadata = toMetadataObject(wafer.metadata as Json);
    const dieDescriptions = toStringRecord(metadata.die_descriptions);
    const nextDescription = parsed.description;
    const nextDieDescriptions = {
      ...dieDescriptions,
      [parsed.dieCode]: nextDescription
    };

    if (!nextDescription.trim()) {
      delete nextDieDescriptions[parsed.dieCode];
    }

    const nextMetadata = {
      ...metadata,
      die_descriptions: nextDieDescriptions,
      die_description_updated_by: account.userId,
      die_description_updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("wafers")
      .update({ metadata: nextMetadata })
      .eq("id", parsed.waferId)
      .select("id, metadata")
      .single();

    if (error) {
      return fail(error.message);
    }

    revalidatePath("/", "layout");
    return ok(data);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
