import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/session";
import {
  getProcessWorkspaceDelta,
  getProcessWorkspaceSnapshot
} from "@/features/workspace/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ processId: string }> }
) {
  await requireAccount();
  const { processId } = await context.params;
  const after = new URL(request.url).searchParams.get("afterRevision");
  if (after === null) {
    return NextResponse.json(await getProcessWorkspaceSnapshot(processId), {
      headers: { "Cache-Control": "private, no-store" }
    });
  }
  const afterRevision = Number(after);
  if (!Number.isSafeInteger(afterRevision) || afterRevision < 0) {
    return NextResponse.json({ error: "afterRevision must be a non-negative integer." }, { status: 400 });
  }
  return NextResponse.json(await getProcessWorkspaceDelta(processId, afterRevision), {
    headers: { "Cache-Control": "private, no-store" }
  });
}
