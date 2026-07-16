/**
 * Converts a persisted post-dicing identifier into its compact UI label.
 * The full identifier remains the source of truth for queries and writes.
 */
export function formatDieDisplayLabel(value: string) {
  const label = value.trim();
  const indexedDieMatch = label.match(/^([a-z])[a-z0-9 .-]*_(\d+)$/i);

  if (!indexedDieMatch) {
    return label;
  }

  return `${indexedDieMatch[1].toUpperCase()}${indexedDieMatch[2]}`;
}
