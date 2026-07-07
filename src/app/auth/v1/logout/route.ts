import { NextResponse } from "next/server";

function pickAuthStorageKey() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  try {
    const host = new URL(supabaseUrl).hostname;
    const prefix = host.split(".")[0] || host;
    return `sb-${prefix}-auth-token`;
  } catch {
    return "sb-127-auth-token";
  }
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(pickAuthStorageKey(), "", {
    maxAge: 0
  });

  return response;
}
