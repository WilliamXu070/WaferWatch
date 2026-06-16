import "server-only";

import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseAdminEnv, getSupabaseServerEnv } from "@/lib/env";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const env = getSupabaseServerEnv();

  return createServerClient<Database>(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Route Handlers, Server Actions,
          // and the proxy refresh path can.
        }
      }
    }
  });
}

let adminClient: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createSupabaseAdminClient() {
  if (!adminClient) {
    const env = getSupabaseAdminEnv();
    adminClient = createSupabaseClient<Database>(env.url, env.secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return adminClient;
}
