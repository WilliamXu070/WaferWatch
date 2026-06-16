import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertProjectAccess } from "@/lib/auth/session";
import { AppError, toErrorMessage } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const signedUploadSchema = z.object({
  projectId: z.string().uuid(),
  bucketName: z.enum(["wafer-characterization", "wafer-process-files", "wafer-maps"]),
  objectPath: z.string().trim().min(1).max(1000)
});

export async function POST(request: NextRequest) {
  try {
    const parsed = signedUploadSchema.parse(await request.json());

    if (!parsed.objectPath.startsWith(`${parsed.projectId}/`)) {
      throw new AppError("Storage object paths must start with the project id.", 400);
    }

    await assertProjectAccess(parsed.projectId, "write");

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from(parsed.bucketName)
      .createSignedUploadUrl(parsed.objectPath);

    if (error) {
      throw new AppError(error.message, 400);
    }

    return NextResponse.json(data);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json({ error: toErrorMessage(error) }, { status });
  }
}
