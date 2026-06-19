#!/usr/bin/env zsh
# Codex completion sound volume control
# Usage:
#   codex-set-completion-sound <volume>
#   codex-set-completion-sound set <volume>
#   codex-set-completion-sound show
#   codex-set-completion-sound reset
#   codex-set-completion-sound test
#
# Volume forms accepted:
#   - decimal 0-1 (for example 0, 0.25, 1)
#   - percent 0-100 or 0-100% (for example 25%, 50, 100)
#
# Recommended slash command wiring:
#   /sound <volume>
#   /sound show
#   /sound reset
#   /sound test

set -euo pipefail

WRAPPER_FILE="${CODEX_FINISHED_SOUND_WRAPPER:-$HOME/.codex/codex-finished-sound}"
VOLUME_KEY='export CODEX_SOUND_VOLUME='
USAGE="Usage:\n  $(basename "$0") <volume|0-100|0-100%>\n  $(basename "$0") set <volume|0-100|0-100%>\n  $(basename "$0") show\n  $(basename "$0") reset\n  $(basename "$0") test"

usage() {
  print -r -- "$USAGE"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  print -r -- "$value"
}

read_current_setting() {
  if [[ ! -r "$WRAPPER_FILE" ]]; then
    print -r -- ""
    return
  fi

  local line
  while IFS= read -r line; do
    if [[ "$line" == ${VOLUME_KEY}* ]]; then
      local parsed="${line#*=}"
      parsed="${parsed#\"}"
      parsed="${parsed%\"}"
      print -r -- "$(trim "$parsed")"
      return
    fi
  done < "$WRAPPER_FILE"
}

normalize_volume() {
  local raw="$1"
  local normalized
  normalized="$(
    awk -v raw="$raw" '
    function trim(v) {
      sub(/^[[:space:]]+/, "", v)
      sub(/[[:space:]]+$/, "", v)
      return v
    }

    BEGIN {
      v = trim(raw)
      if (v == "") {
        exit 1
      }

      is_percent = 0
      if (substr(v, length(v), 1) == "%") {
        is_percent = 1
        v = substr(v, 1, length(v)-1)
      }

      if (v !~ /^[0-9]+(\.[0-9]+)?$/) {
        exit 1
      }

      value = v + 0
      if (value < 0) {
        exit 1
      }

      if (is_percent || value > 1) {
        if (value > 100) {
          exit 1
        }
        printf "%.3f", value / 100
      } else {
        printf "%.3f", value
      }
    }'
  )"

  if (( $? != 0 )); then
    return 1
  fi

  print -r -- "$normalized"
}

set_wrapper_setting() {
  local volume="$1"
  local tmp_file
  tmp_file="$(mktemp "${WRAPPER_FILE}.tmp.XXXXXX")"

  if [[ ! -e "$WRAPPER_FILE" ]]; then
    touch "$WRAPPER_FILE"
  fi

  if grep -q '^export CODEX_SOUND_VOLUME=' "$WRAPPER_FILE" 2>/dev/null; then
    awk -v new_volume="$volume" '
      BEGIN { replaced = 0 }
      /^export CODEX_SOUND_VOLUME=/ {
        if (!replaced) {
          print "export CODEX_SOUND_VOLUME=\"" new_volume "\""
          replaced = 1
        }
        next
      }
      { print }
      END { if (!replaced) print "export CODEX_SOUND_VOLUME=\"" new_volume "\"" }
    ' "$WRAPPER_FILE" > "$tmp_file"
  else
    {
      cat "$WRAPPER_FILE"
      print "export CODEX_SOUND_VOLUME=\"$volume\""
    } > "$tmp_file"
  fi

  mv -f "$tmp_file" "$WRAPPER_FILE"
}

clear_wrapper_setting() {
  local tmp_file
  tmp_file="$(mktemp "${WRAPPER_FILE}.tmp.XXXXXX")"

  if [[ ! -f "$WRAPPER_FILE" ]]; then
    print -r -- "No wrapper file found, nothing to clear: ${WRAPPER_FILE}"
    return
  fi

  awk '
    BEGIN { removed = 0 }
    /^export CODEX_SOUND_VOLUME=/ { if (!removed) { removed = 1; next } next }
    { print }
  ' "$WRAPPER_FILE" > "$tmp_file"

  mv -f "$tmp_file" "$WRAPPER_FILE"
}

set_volume() {
  local value="$1"
  local normalized
  if ! normalized="$(normalize_volume "$value")"; then
    print -r -- "Invalid volume '${value}'. Use 0-1, 0-100, or 0-100%."
    usage
    return 1
  fi

  set_wrapper_setting "$normalized"
  print -r -- "Sound volume set to: ${normalized}"
  return 0
}

cmd=${1:-}
case "$cmd" in
  set)
    arg=${2:-}
    if [[ -z "$arg" ]]; then
      print -r -- "Missing volume."
      usage
      exit 1
    fi
    set_volume "$arg"
    ;;

  show)
    current=$(read_current_setting)
    if [[ -z "$current" ]]; then
      print -r -- "No sound volume override configured in ${WRAPPER_FILE}."
      print -r -- "Default behavior is full volume (1.0)."
    else
      print -r -- "Current sound volume: ${current}"
    fi
    ;;

  reset|default)
    clear_wrapper_setting
    print -r -- "Removed completion sound volume override."
    ;;

  test)
    if [[ ! -x "$WRAPPER_FILE" ]]; then
      print -r -- "Wrapper file not executable: ${WRAPPER_FILE}"
      exit 1
    fi

    current=$(read_current_setting)
    if [[ -n "$current" ]]; then
      CODEX_SOUND_VOLUME="$current" "$WRAPPER_FILE" --event completion
    else
      "$WRAPPER_FILE" --event completion
    fi
    ;;

  -h|--help|help|'')
    usage
    ;;

  *)
    set_volume "$cmd" || exit 1
    ;;
esac
