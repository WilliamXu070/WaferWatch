"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { confirmationErrorPath } from "@/lib/auth/confirmation";

// Older Supabase verification URLs return failures in a fragment, which the
// server cannot read. Remove it and show the same actionable recovery screen.
export function AuthFragmentRecovery() {
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const code = params.get("error_code") ?? params.get("error");
    if (code) router.replace(confirmationErrorPath(code));
    else if (params.has("access_token") || params.has("refresh_token")) {
      router.replace(`/auth/finish${window.location.hash}`);
    }
  }, [router]);
  return null;
}
