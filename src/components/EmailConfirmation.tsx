"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { completeEmailSession } from "@/features/accounts/actions";
import { readEmailFragment } from "@/lib/auth/email-fragment";
import { authFormStyles } from "@/styles/tw";

export function EmailConfirmation({ next }: { next: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const result = readEmailFragment(window.location.hash, next);
    // Tokens belong only in the verification request, never the address bar
    // after completion, analytics, logs, or a subsequent navigation.
    window.history.replaceState(null, "", window.location.pathname);
    if (result.errorPath) {
      router.replace(result.errorPath);
      return;
    }
    void completeEmailSession(result.session!).then((path) => {
      router.replace(path);
      router.refresh();
    }).catch(() => setFailed(true));
  }, [next, router]);

  return (
    <div className={authFormStyles.panel}>
      <p role="status">{failed ? "We could not finish verification. Try signing in, or request a new confirmation email." : "Finishing email verification…"}</p>
      <Link href="/?error_code=confirmation_failed" className={authFormStyles.textButton}>Back to sign in</Link>
    </div>
  );
}
