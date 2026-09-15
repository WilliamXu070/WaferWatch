# Signup email confirmation — resolved

## Failure and cause

Signup delivered its email successfully, but opening the link outside the browser that started signup returned `PKCE code verifier not found in storage`. Supabase had already confirmed the email; WaferWatch failed to establish the session and did not provide a useful recovery path. The callback discarded error codes, and server-only handling could not see errors or session tokens returned in URL fragments.

The production Supabase project was also paused (`INACTIVE`): its hostname initially failed DNS, and `/api/health` returned HTTP 503 / NETWORK_ERROR. The existing project was resumed and reached `ACTIVE_HEALTHY`; no database restore from an older snapshot or wafer-data change was performed.

## Fix

- Email signup, resend, and password-recovery requests use a public-key, non-persistent Supabase client with the implicit email flow. The built-in Supabase email links therefore work independently of the signup browser's cookies.
- `/auth/confirm` sends fragment-based links to `/auth/finish`. The browser removes the tokens from its address bar, and a server action validates the session with Supabase before writing SSR session cookies.
- Existing PKCE and direct token-hash callbacks remain supported.
- Expired/used links retain actionable error codes. Legacy fragment errors show the same recovery screen. Signup success and unconfirmed sign-in expose the resend form.
- Auth redirects reject external/backslash/control-character destinations; callback responses are private/no-store. Submit buttons prevent repeated in-flight requests, and upstream failures show a readable retry message.
- Email confirmation remains enabled. Auth roles and wafer data were not changed.

## End-to-end verification

| Check | Evidence | Result |
| --- | --- | --- |
| Original failure | Actual signup email delivered to a disposable Gmail alias; opening its original PKCE link with no browser cookies returned the missing-verifier error | Reproduced |
| Previously stuck account | Original test account was confirmed by Supabase despite the callback failure; password sign-in reached the production dashboard | Passed |
| New deployed signup | Submitted production Create account; received a real Supabase confirmation email; verified its link contained no PKCE challenge | Passed |
| Production email callback | Opened that received link; `/auth/confirm` → `/auth/finish` → `/dashboard`; URL contained no tokens afterward | Passed |
| Server state | Supabase confirmed the exact new test account had both email confirmation and a sign-in timestamp | Passed |
| Session persistence | Subsequent authenticated dashboard navigation worked; sign-out and password sign-in passed | Passed |
| Mobile account loop | Phone dashboard, navigation, password sign-in, and sign-out replayed; sign-out returned to login | Passed |
| Used link recovery | Reopened the consumed production email link; reached `/?error_code=otp_expired` with a usable Resend confirmation email form | Passed |
| Phone layout | Recovery screen measured 390×844; document scroll width was 390 | Passed |
| Local callback regression | Fresh admin-generated Supabase signup link for a separate disposable account established an authenticated local session with no prior signup cookie | Passed |
| Recovery compatibility | Admin-generated password recovery link reached the authenticated Choose a new password page | Passed |
| Automated checks | `npm test`: 297 passing; `npm run typecheck`, `npm run lint`, `npm run build` | Passed |
| Runtime identity | Vercel production deployment `dpl_J6NyPAv1FZm7itpAW6JRaZ8rCQ4e` reported commit `16050c160629a0edf42cec11cc48cab5f6ec5a65`; clean release checkout had no source diff | Passed |
| Production health | `https://wafer-watch.vercel.app/api/health`: HTTP 200, `ok: true`, Supabase healthy | Passed |

The final documentation-only release retains exactly this tested source. Live email tests used the existing Supabase sender and the owner's Gmail aliases. Local generated-link tests did not send email. No physical phone was used; mobile checks used a browser viewport. Password change submission and an additional resend-email delivery were not tested. All three disposable auth accounts were removed after verification; no wafer data was mutated.

## Provider constraint and rollback

Supabase rejected email-template changes on the free default sender, so no template change was applied. Its default sender restricts recipients and sending volume; registration for general-public email addresses requires a custom SMTP provider. This is separate from the repaired verification callback. Owner was asked whether an existing provider is available. Do not disable email confirmation to bypass this restriction.

Rollback: redeploy the previous application commit `b6954f6` if necessary. Keep the Supabase project active; intentionally pausing it would take the application offline again. The primary checkout's unrelated changes were preserved, and only auth-fix files were committed/released.

## Status

Resolved. Production signup and email verification passed end to end. See GitHub issue #72 for the latest deployment identity and final health confirmation.
