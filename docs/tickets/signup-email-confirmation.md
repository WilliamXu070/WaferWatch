# Signup email confirmation recovery

## Symptom
Signup emails arrive, but following the confirmation link leaves the user stuck instead of signed in.

## Diagnosis
- Production Supabase project `obltnrupgsgguosjgail` is INACTIVE; its hostname fails DNS and production `/api/health` returns 503 / NETWORK_ERROR.
- The live confirmation and recovery templates use `.ConfirmationURL`. Server-side signup uses PKCE, so its code exchange depends on the originating browser's verifier cookie. Opening the email on another browser/device cannot complete that session.
- The callback drops `error_code`; the login page exposes resend only for `otp_expired`. Failed verification therefore hides the recovery action.
- Site URL and redirect allow-list correctly include the production origin; email confirmation remains enabled.

## Plan
1. Resume the existing paused production project, preserving its database and auth configuration.
2. Reproduce verification with a disposable account and inspect the returned redirect/session.
3. Use direct token-hash confirmation email URLs per Supabase's SSR guide; retain PKCE compatibility for already-issued links. Preserve actionable callback error codes and expose resend after signup/unconfirmed sign-in.
4. Add regression coverage for invalid/expired links, browser-independent token verification, safe destinations, and successful authenticated redirects.
5. Release only this fix from a clean checkout, preserving the primary checkout's unrelated work. Run npm test, typecheck, lint, build, deploy the verified commit, and check production health.
6. Replay signup → actual email → confirmation → dashboard → sign out/sign in on desktop and phone viewport when browser access permits.

## Risk / rollback
No wafer data or access roles change. Record the previous email templates before changing them; restore those templates and the previous deployment if verification regresses. Existing PKCE links remain supported but may require sign-in or a new email when opened in a different browser.

## Verification
Pending. Browser connection currently times out; investigating separately. Actual email delivery and UI replay must be distinguished from generated-link/API checks.

## Status
Investigating; production backend paused.

## Updated diagnosis and plan
Supabase rejected template updates with HTTP 400: "Email template modification is not available for free tier projects using the default email provider. Please upgrade your plan or configure a custom SMTP provider." No template change was applied.

The compatible fix will keep the built-in ConfirmationURL emails and use Supabase's implicit email flow for signup/reset requests. A dedicated browser completion page receives the token fragment, removes it from the address bar, and sends the session tokens to a server action for Supabase validation and SSR cookie creation. Existing PKCE and direct token-hash callbacks remain supported. Missing/expired fragment errors go to the recovery UI. No email-confirmation or access checks are disabled. General-public email delivery still needs custom SMTP credentials, requested from the owner.

## Verification before release
- Restored production project: `ACTIVE_HEALTHY`; production `/api/health` HTTP 200.
- Actual signup email received in the test Gmail alias. Following its original PKCE link without browser cookies reproduced `PKCE code verifier not found in storage` at the deployed callback.
- Fresh source: 297 tests passed; typecheck, lint, and a clean production build passed.
- Generated Supabase signup link (no email send, distinct disposable account) opened in the browser against the clean local production server: `/auth/confirm` → `/auth/finish` → `/dashboard`; Sign out visible; token fragment removed.
- Supabase SSR forces PKCE regardless of the flowType option. The fix therefore uses a separate public-key, non-persistent Supabase client for sending email requests; a regression test checks the actual signup/recovery request bodies contain no PKCE challenge.
