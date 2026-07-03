## Symptom

On `/wireframe/calendar`, clicking empty calendar space after selecting an event can leave the previous event selected. Wireframe event colors also need to follow the location row palette: McMaster amber, Waterloo blue, Toronto green.

## Expected behavior

Blank calendar clicks clear the selected event and editor state. Event cards keep a consistent location color, including selected states.

## Diagnosis

The calendar uses controlled selection through `selectedEventId`, but `react-calendar-timeline` can emit a stale item selection around the same blank-click interaction that clears selection. Wireframe item tone classes were assigned from event label/special cases instead of the event location.

## Plan

1. Add a short-lived blank-click guard so stale item-select callbacks do not reselect the previous event.
2. Map wireframe item tone classes from event location.
3. Update scoped wireframe CSS so selected states preserve each location palette.
4. Verify blank-click deselect and location colors in Playwright, then run `npm run lint` and `npm run build`.

## Verification

- `npm run lint` passed.
- `npm run build` passed.
- Playwright at `http://localhost:3005/wireframe/calendar`, viewport `1440x1000`:
  - Selected Waterloo event, clicked blank grid space, verified zero selected event cards and empty inspector.
  - Selected Toronto event, clicked the site/sidebar row, verified zero selected event cards and empty inspector.
  - Verified location palette classes/colors: McMaster amber, Waterloo blue, Toronto green.
  - No console errors.
  - Screenshot: `/Users/williamxu/Desktop/Projects/WaferWatch/test-results/wireframe-calendar-selection-location-colors.png`.

## Status

Complete.
