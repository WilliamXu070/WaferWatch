import "server-only";

export type SupabaseServerEnv = {
  url: string;
  publishableKey: string;
};

export type SupabaseAdminEnv = SupabaseServerEnv & {
  secretKey: string;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseServerEnv(): SupabaseServerEnv {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  };
}

export function getSupabaseAdminEnv(): SupabaseAdminEnv {
  return {
    ...getSupabaseServerEnv(),
    secretKey:
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      requireEnv("SUPABASE_SECRET_KEY")
  };
}
