import { createClient } from "@supabase/supabase-js";

// @supabase/ssr forces PKCE even if flowType is overridden. Use the public
// auth client only for sending emails; session cookies are established later
// by the validated callback. Never use the service-role key here.
export function createEmailAuthClient(url: string, publishableKey: string) {
  return createClient(url, publishableKey, {
    auth: {
      flowType: "implicit",
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}
