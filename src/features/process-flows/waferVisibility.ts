export function isDicedParentWafer(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  const record = metadata as Record<string, unknown>;
  return [record.diced_child_wafer_ids, record.diced_child_die_labels].some(
    (value) => Array.isArray(value) && value.some((entry) => typeof entry === "string" && entry.trim().length > 0)
  );
}
