import { NextResponse } from "next/server";
import { getSupabaseStatus } from "@/lib/supabase/status";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "waferwatch",
    supabase: getSupabaseStatus()
  });
}
