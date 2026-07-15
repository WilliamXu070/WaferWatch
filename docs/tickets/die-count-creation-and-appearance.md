# Die-count wafer creation and appearance images

## Scope

- Remove physical wafer size from Process Flow wafer creation.
- Create a user-selected number of dies labeled `<wafer>_1` through `<wafer>_<count>`.
- Keep one wafer/process assignment while exposing each die as a selectable status tile.
- Replace generated die artwork in detail view with a persistent uploaded or pasted image.

## Compatibility

- Existing wafers without generated `die_labels` retain their current display behavior.
- New die images use the existing protected attachment bucket and a die-scoped text surface.

## Status

Implemented. Verification pending.
