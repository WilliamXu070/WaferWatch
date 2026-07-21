import { NextResponse } from "next/server";
import { checkSupabaseHealth } from "@/lib/supabase/status";

export async function GET() {
  const supabase = await checkSupabaseHealth();

  return NextResponse.json(
    {
      ok: supabase.ok,
      service: "waferwatch",
      supabase
    },
    {
      status: supabase.ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
