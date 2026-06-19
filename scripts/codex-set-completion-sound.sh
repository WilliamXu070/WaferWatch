#!/usr/bin/env zsh
# Codex completion sound setter
# Usage:
#   codex-set-completion-sound set   /path/to/sound.mp3
#   codex-set-completion-sound reset
#   codex-set-completion-sound show
#
# Recommended slash command wiring:
#   /set-completion-sound set "<path>"
#

set -euo pipefail

WRAPPER_FILE="${CODEX_FINISHED_SOUND_WRAPPER:-$HOME/.codex/codex-finished-sound}"
USAGE="Usage:\n  $(basename "$0") set <path>\n  $(basename "$0") reset\n  $(basename "$0") show\n  $(basename "$0") test"

usage() {
  print -r -- "$USAGE"
}

read_current_setting() {
  if [[ ! -r "$WRAPPER_FILE" ]]; then
    print -r -- "" 
    return
  fi

  local line
  while IFS= read -r line; do
    if [[ "$line" == export\ CODEX_SOUND_COMPLETION_FILE=* ]]; then
      print -r -- "${line#*=}"
      return
    fi
  done < "$WRAPPER_FILE"
}

set_wrapper_setting() {
  local target="$1"
  local tmp_file
  tmp_file="$(mktemp "${WRAPPER_FILE}.tmp.XXXXXX")"

  touch "$WRAPPER_FILE"

  if grep -q '^export CODEX_SOUND_COMPLETION_FILE=' "$WRAPPER_FILE" 2>/dev/null; then
    awk -v new_path="$target" '
      BEGIN { done = 0; }
      /^export CODEX_SOUND_COMPLETION_FILE=/ {
        if (!done) {
          print "export CODEX_SOUND_COMPLETION_FILE=\"" new_path "\""
          done = 1
        }
        next
      }
      { print }
      END {
        if (!done) {
          print "export CODEX_SOUND_COMPLETION_FILE=\"" new_path "\""
        }
      }
    ' "$WRAPPER_FILE" > "$tmp_file"
  else
    {
      awk 'NR==1 { print; next }' "$WRAPPER_FILE"
      print "export CODEX_SOUND_COMPLETION_FILE=\"${target}\""
      sed -n '2,$p' "$WRAPPER_FILE"
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
    /^export CODEX_SOUND_COMPLETION_FILE=/ { if (!removed) { removed = 1; next } next }
    { print }
  ' "$WRAPPER_FILE" > "$tmp_file"

  mv -f "$tmp_file" "$WRAPPER_FILE"
}

cmd=${1:-}
case "${cmd}" in
  set)
    sound_path=${2:-}
    if [[ -z "${sound_path}" ]]; then
      print -r -- "Missing file path."
      usage
      exit 1
    fi
    if [[ ! -r "${sound_path}" ]]; then
      print -r -- "Sound file not readable: ${sound_path}"
      exit 1
    fi
    set_wrapper_setting "$sound_path"
    print -r -- "Updated completion sound to: ${sound_path}"
    ;;

  reset)
    clear_wrapper_setting
    print -r -- "Removed explicit completion sound override."
    ;;

  show)
    current=$(read_current_setting)
    if [[ -z "$current" ]]; then
      print -r -- "No override set in wrapper."
    else
      print -r -- "Current override: ${current}"
    fi
    ;;

  test)
    if [[ ! -x "${WRAPPER_FILE}" ]]; then
      print -r -- "Wrapper is not executable: ${WRAPPER_FILE}"
      exit 1
    fi
    export CODEX_SOUND_COMPLETION_FILE="$(read_current_setting)"
    exec "$WRAPPER_FILE" --event completion
    ;;

  -h|--help|help|'')
    usage
    ;;

  *)
    print -r -- "Unknown command: ${cmd}"
    usage
    exit 1
    ;;
esac
