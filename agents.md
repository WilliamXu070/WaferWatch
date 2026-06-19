# Agent Workflow Notes

## Required verification after every coding change

After every coding change, run both lint and compile/build checks in order:

```bash
npm run lint
npm run build
```

This ensures the code is lint-clean and compile-safe before we move on.

Run this exact sequence for every change, including UI/asset updates.

## Editable text surfaces must be persistent

Any user-editable text surface that represents wafer/process/inspection state must be tied to the database. Do not add local-only textareas for operational notes, comments, descriptions, parameters, or status-like text.

Default to the shared `text_surfaces` table/actions for generic text keyed to an exact object/scope. Use a domain-specific table only when the text is already a first-class domain field, such as poling parameters.

## Commit expectation

After completing each feature, rework, or bug fix, commit the finished changes with a clear message once lint and build pass.

## Playwright and auth testing safety

Never create new Supabase auth users, run signup flows, or use fake/random email addresses while testing this app with Playwright or browser automation. This project may point local development at a live Supabase project, and signup tests can send real transactional emails that bounce and risk Supabase email restrictions.

For authenticated UI testing:

1. Use an existing confirmed test/admin account to sign in.
2. Prefer a saved Playwright storage state/session after one successful login.
3. Keep credentials and storage state out of git.
4. Do not use generated addresses, `example.com`, typo addresses, or unowned Gmail addresses.
5. If signup behavior must be tested, ask the user first and use only a mailbox they explicitly control or a dedicated local/email-sandbox setup.

Ignored auth/session files should remain ignored, such as `playwright/.auth/`.
