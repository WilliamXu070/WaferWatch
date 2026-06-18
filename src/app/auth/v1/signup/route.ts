export async function POST() {
  return Response.json(
    {
      error: "Local auth mock does not support signup",
      error_description: "Use a real Supabase project URL for account creation and authentication.",
      error_code: "local_auth_blocked"
    },
    { status: 400 }
  );
}
