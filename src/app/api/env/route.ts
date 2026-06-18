export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let storageKey = "sb-127-auth-token";

  if (url) {
    try {
      const host = new URL(url).hostname;
      const prefix = host.split(".")[0] || host;
      storageKey = `sb-${prefix}-auth-token`;
    } catch {
      storageKey = "sb-127-auth-token";
    }
  }

  return Response.json({
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key ? `${key.slice(0, 8)}...` : null,
    storageKey
  });
}
