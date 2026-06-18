import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json(
      {
        error: "SUPABASE_CONFIG_MISSING",
        error_description: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required."
      },
      { status: 500 }
    );
  }

  const body = await request.text();
  const upstreamUrl = new URL(`${supabaseUrl}/auth/v1/token${request.nextUrl.search}`);

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`
      },
      body: body || "{}"
    });

    const responseBody = await upstream.text();
    const responseHeaders = new Headers();

    upstream.headers.forEach((value, key) => {
      const normalized = key.toLowerCase();
      if (normalized === "content-length" || normalized === "content-encoding" || normalized === "transfer-encoding") {
        return;
      }
      responseHeaders.set(key, value);
    });

    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch {
    return NextResponse.json(
      {
        error: "Supabase token exchange failed",
        error_description: "Unable to reach Supabase auth endpoint."
      },
      { status: 502 }
    );
  }
}
