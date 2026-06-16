import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertProjectAccess, requireAccount } from "@/lib/auth/session";
import { AppError, toErrorMessage } from "@/lib/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const importSchema = z.object({
  projectId: z.string().uuid(),
  wafers: z
    .array(
      z.object({
        waferCode: z.string().trim().min(1).max(120),
        lotId: z.string().uuid().nullable().optional(),
        materialStack: z.string().trim().max(500).nullable().optional(),
        diameterMm: z.number().positive().nullable().optional(),
        notes: z.string().trim().max(2000).nullable().optional()
      })
    )
    .min(1)
    .max(500)
});

export async function POST(request: NextRequest) {
  try {
    const account = await requireAccount();
    const parsed = importSchema.parse(await request.json());
    await assertProjectAccess(parsed.projectId, "write");

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("wafers")
      .upsert(
        parsed.wafers.map((wafer) => ({
          project_id: parsed.projectId,
          wafer_code: wafer.waferCode,
          lot_id: wafer.lotId ?? null,
          material_stack: wafer.materialStack ?? null,
          diameter_mm: wafer.diameterMm ?? null,
          notes: wafer.notes ?? null,
          metadata: {
            imported_by: account.userId,
            imported_at: new Date().toISOString()
          }
        })),
        {
          onConflict: "project_id,wafer_code"
        }
      )
      .select("*");

    if (error) {
      throw new AppError(error.message, 400);
    }

    return NextResponse.json({
      imported: data?.length ?? 0,
      wafers: data ?? []
    });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json({ error: toErrorMessage(error) }, { status });
  }
}
