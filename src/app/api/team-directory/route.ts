import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/session";
import { getActiveProfileTeamMembers } from "@/features/wireframe/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAccount();
  return NextResponse.json(await getActiveProfileTeamMembers(), {
    headers: { "Cache-Control": "private, no-store" }
  });
}
