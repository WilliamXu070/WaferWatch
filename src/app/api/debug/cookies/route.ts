import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  return Response.json({
    cookie: req.headers.get("cookie")
  });
}
