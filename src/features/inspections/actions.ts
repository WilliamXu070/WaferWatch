"use server";

import { revalidatePath } from "next/cache";
import { fail, ok } from "@/lib/action-result";
import { assertProjectAccess, requireAccount } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  dieInspectionCreateSchema,
  dieInspectionDeleteSchema,
  dieInspectionListSchema,
  dieInspectionPreviewSchema,
  dieInspectionCellSummarySchema
} from "@/features/inspections/schemas";

export type DieInspectionRecord = {
  id: string;
  projectId: string;
  waferId: string;
  dieCode: string;
  row: number;
  column: number;
  xRatio: number;
  yRatio: number;
  imageBucket: string;
  imagePath: string;
  imageMimeType: string;
  imageSizeBytes: number;
  imageFileName: string;
  imageUrl: string | null;
  createdAt: string;
};

function mapInspectionRow(row: {
  id: string;
  project_id: string;
  wafer_id: string;
  die_code: string;
  pattern_row: number;
  pattern_column: number;
  x_ratio: number;
  y_ratio: number;
  image_bucket: string;
  image_path: string;
  image_mime_type: string;
  image_size_bytes: number;
  image_file_name: string;
  created_at: string;
}, imageUrl: string | null): DieInspectionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    waferId: row.wafer_id,
    dieCode: row.die_code,
    row: row.pattern_row,
    column: row.pattern_column,
    xRatio: Number(row.x_ratio),
    yRatio: Number(row.y_ratio),
    imageBucket: row.image_bucket,
    imagePath: row.image_path,
    imageMimeType: row.image_mime_type,
    imageSizeBytes: row.image_size_bytes,
    imageFileName: row.image_file_name,
    imageUrl,
    createdAt: row.created_at
  };
}

async function assertWaferWriteAccess(waferId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: wafer, error } = await supabase
    .from("wafers")
    .select("id, project_id")
    .eq("id", waferId)
    .single();

  if (error) {
    throw error;
  }

  await assertProjectAccess(wafer.project_id, "write");
  return wafer;
}

export async function listDieInspections(input: unknown) {
  try {
    const parsed = dieInspectionListSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data: wafer, error: waferError } = await supabase
      .from("wafers")
      .select("id, project_id")
      .eq("id", parsed.waferId)
      .single();

    if (waferError) {
      return fail(waferError.message);
    }

    await assertProjectAccess(wafer.project_id, "read");

    const { data, error } = await supabase
      .from("die_inspections")
      .select("*")
      .eq("wafer_id", parsed.waferId)
      .eq("die_code", parsed.dieCode)
      .eq("pattern_row", parsed.row)
      .eq("pattern_column", parsed.column)
      .order("created_at", { ascending: true });

    if (error) {
      return fail(error.message);
    }

    const admin = createSupabaseAdminClient();
    const inspections = await Promise.all(
      (data ?? []).map(async (row) => {
        const signed = await admin.storage
          .from(row.image_bucket)
          .createSignedUrl(row.image_path, 60 * 60);

        return mapInspectionRow(row, signed.data?.signedUrl ?? null);
      })
    );

    return ok(inspections);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function listDieInspectionsForDie(input: unknown) {
  try {
    const parsed = dieInspectionCellSummarySchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data: wafer, error: waferError } = await supabase
      .from("wafers")
      .select("id, project_id")
      .eq("id", parsed.waferId)
      .single();

    if (waferError) {
      return fail(waferError.message);
    }

    await assertProjectAccess(wafer.project_id, "read");

    const { data, error } = await supabase
      .from("die_inspections")
      .select("*")
      .eq("wafer_id", parsed.waferId)
      .eq("die_code", parsed.dieCode)
      .order("pattern_row", { ascending: true })
      .order("pattern_column", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return fail(error.message);
    }

    const admin = createSupabaseAdminClient();
    const inspections = await Promise.all(
      (data ?? []).map(async (row) => {
        const signed = await admin.storage
          .from(row.image_bucket)
          .createSignedUrl(row.image_path, 60 * 60);

        return mapInspectionRow(row, signed.data?.signedUrl ?? null);
      })
    );

    return ok(inspections);
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function getDieInspectionPreviewUrl(input: unknown) {
  try {
    const parsed = dieInspectionPreviewSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data: inspection, error: inspectionError } = await supabase
      .from("die_inspections")
      .select("id, project_id, image_bucket, image_path")
      .eq("id", parsed.inspectionId)
      .single();

    if (inspectionError) {
      return fail(inspectionError.message);
    }

    await assertProjectAccess(inspection.project_id, "read");

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from(inspection.image_bucket)
      .createSignedUrl(inspection.image_path, 60 * 60);

    if (error) {
      return fail(error.message);
    }

    return ok({ imageUrl: data.signedUrl });
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function createDieInspection(input: unknown) {
  try {
    const account = await requireAccount();
    const parsed = dieInspectionCreateSchema.parse(input);
    const wafer = await assertWaferWriteAccess(parsed.waferId);

    if (wafer.project_id !== parsed.projectId) {
      return fail("Inspection project does not match wafer project.");
    }

    if (!parsed.imagePath.startsWith(`${parsed.projectId}/`)) {
      return fail("Inspection image path must start with the project id.");
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("die_inspections")
      .insert({
        id: parsed.id,
        project_id: parsed.projectId,
        wafer_id: parsed.waferId,
        die_code: parsed.dieCode,
        pattern_row: parsed.row,
        pattern_column: parsed.column,
        x_ratio: parsed.xRatio,
        y_ratio: parsed.yRatio,
        image_bucket: parsed.imageBucket,
        image_path: parsed.imagePath,
        image_mime_type: parsed.imageMimeType,
        image_size_bytes: parsed.imageSizeBytes,
        image_file_name: parsed.imageFileName,
        created_by: account.userId
      })
      .select("*")
      .single();

    if (error) {
      return fail(error.message);
    }

    const admin = createSupabaseAdminClient();
    const signed = await admin.storage
      .from(data.image_bucket)
      .createSignedUrl(data.image_path, 60 * 60);

    revalidatePath("/", "layout");
    return ok(mapInspectionRow(data, signed.data?.signedUrl ?? null));
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function listDieInspectionCells(input: unknown) {
  try {
    const parsed = dieInspectionCellSummarySchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data: wafer, error: waferError } = await supabase
      .from("wafers")
      .select("id, project_id")
      .eq("id", parsed.waferId)
      .single();

    if (waferError) {
      return fail(waferError.message);
    }

    await assertProjectAccess(wafer.project_id, "read");

    const { data, error } = await supabase
      .from("die_inspections")
      .select("pattern_row, pattern_column")
      .eq("wafer_id", parsed.waferId)
      .eq("die_code", parsed.dieCode);

    if (error) {
      return fail(error.message);
    }

    const uniqueCells = new Map<string, { row: number; column: number }>();
    for (const row of data ?? []) {
      uniqueCells.set(`${row.pattern_row}:${row.pattern_column}`, {
        row: row.pattern_row,
        column: row.pattern_column
      });
    }

    return ok(Array.from(uniqueCells.values()));
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}

export async function deleteDieInspection(input: unknown) {
  try {
    const parsed = dieInspectionDeleteSchema.parse(input);
    const supabase = await createServerSupabaseClient();
    const { data: inspection, error: inspectionError } = await supabase
      .from("die_inspections")
      .select("*")
      .eq("id", parsed.inspectionId)
      .single();

    if (inspectionError) {
      return fail(inspectionError.message);
    }

    await assertProjectAccess(inspection.project_id, "write");

    const admin = createSupabaseAdminClient();
    await admin.storage.from(inspection.image_bucket).remove([inspection.image_path]);

    const { error } = await supabase
      .from("die_inspections")
      .delete()
      .eq("id", parsed.inspectionId);

    if (error) {
      return fail(error.message);
    }

    revalidatePath("/", "layout");
    return ok({ id: parsed.inspectionId });
  } catch (error) {
    return fail(toErrorMessage(error));
  }
}
