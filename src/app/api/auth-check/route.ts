import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const result = await supabase.auth.getClaims();

  return Response.json({
    hasClaims: Boolean(result.data?.claims),
    claims: result.data?.claims ?? null,
    error: result.error
      ? {
          message: result.error.message,
          status: result.error.status,
          code: result.error.code
        }
      : null
  });
}
