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
const signedUploadBatchSchema = z.object({
  uploads: z.array(signedUploadSchema).min(1).max(256)
}).superRefine(({ uploads }, ctx) => {
  const projectIds = new Set(uploads.map((upload) => upload.projectId));
  if (projectIds.size !== 1) {
    ctx.addIssue({ code: "custom", message: "A signed upload batch must belong to one project." });
  }
});

async function mapWithConcurrency<T, R>(values: readonly T[], limit: number, worker: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index]);
    }
  }));
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const batchResult = signedUploadBatchSchema.safeParse(body);
    const uploads = batchResult.success
      ? batchResult.data.uploads
      : [signedUploadSchema.parse(body)];

    if (uploads.some((upload) => !upload.objectPath.startsWith(`${upload.projectId}/`))) {
      throw new AppError("Storage object paths must start with the project id.", 400);
    }

    const startedAt = performance.now();
    await assertProjectAccess(uploads[0].projectId, "write");
    const accessDurationMs = performance.now() - startedAt;

    const admin = createSupabaseAdminClient();
    const signingStartedAt = performance.now();
    const signed = await mapWithConcurrency(uploads, 16, async (upload) => {
      const { data, error } = await admin.storage
        .from(upload.bucketName)
        .createSignedUploadUrl(upload.objectPath);
      if (error) throw new AppError(error.message, 400);
      return { objectPath: upload.objectPath, ...data };
    });
    console.info("[ProcessFlowPerf]", JSON.stringify({
      action: "signed_upload",
      count: uploads.length,
      access_ms: Math.round(accessDurationMs),
      signing_ms: Math.round(performance.now() - signingStartedAt),
      total_ms: Math.round(performance.now() - startedAt)
    }));

    return NextResponse.json(batchResult.success ? { uploads: signed } : signed[0]);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return NextResponse.json({ error: toErrorMessage(error) }, { status });
  }
}
