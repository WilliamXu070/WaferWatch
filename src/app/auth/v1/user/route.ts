import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return Response.json({ error: "Missing token" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");
  const [, payloadB64] = token.split(".");

  let userId = "00000000-0000-0000-0000-000000000001";
  let email = "alpha@wafer.local";

  if (payloadB64) {
    try {
      const payloadJson = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      const payload = JSON.parse(payloadJson);

      if (typeof payload.sub === "string" && payload.sub.trim()) {
        userId = payload.sub;
      }

      if (typeof payload.email === "string" && payload.email.trim()) {
        email = payload.email;
      }
    } catch {
      // ignore malformed token payload and keep defaults
    }
  }

  return Response.json({
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email
    }
  });
}
