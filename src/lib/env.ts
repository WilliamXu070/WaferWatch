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

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable. Expected one of: ${names.join(", ")}`);
}

export function getSupabaseServerEnv(): SupabaseServerEnv {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: firstEnv([
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    ])
  };
}

export function getSupabaseAdminEnv(): SupabaseAdminEnv {
  return {
    ...getSupabaseServerEnv(),
    secretKey:
      firstEnv([
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEY"
      ])
  };
}
