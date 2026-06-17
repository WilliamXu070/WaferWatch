## Symptom

After zooming the process calendar very far in, zooming back out can leave the timeline header stuck at the tiny hour/minute scale.

## Expected behavior

The time header should follow the visible time span:

- under 4 hours: minute labels
- under 2 days: hour labels
- over 2 days: day labels under the month header

## Diagnosis

The timeline library computes its own display unit while zooming. After an extreme zoom-in/out sequence, that internal unit can lag the viewport the user is actually seeing.

## Plan

1. Keep the timeline viewport controlled with `visibleTimeStart` and `visibleTimeEnd`.
2. Derive the rendered header scale from the controlled visible span.
3. Re-key the date headers by our scale id so React remounts them when crossing minute/hour/day scale boundaries.
4. Verify lint, typecheck, test/build commands, and local health.

## Verification

- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm test` is blocked because `package.json` has no `test` script.
- `npm run build` passes.
- `curl -s http://localhost:3000/api/health` returns `{"ok":true,...}`.
- Browser smoke check loads the public app at `http://localhost:3000/`; protected dashboard verification is blocked because signup returns "Account created. Confirm your email, then sign in."

## Status

Fixed in code; exact protected dashboard zoom repro still needs a signed-in browser session or user confirmation.
