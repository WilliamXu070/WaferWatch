# /sound

Set and inspect the random completion sound volume used by Codex notifications.

## Arguments

- `volume`: `0`-`1` for decimal form, or `0`-`100` / `0%-100%` for percentage.
- `show`: print the current volume override from `~/.codex/codex-finished-sound`.
- `reset` or `default`: remove override and fall back to default (1.0).
- `test`: play one completion sample with the current volume setting.

## Handler

- `scripts/codex-set-completion-sound.sh`

## Examples

- `/sound 0.35`
- `/sound 70`
- `/sound 50%`
- `/sound show`
- `/sound test`
- `/sound reset`
