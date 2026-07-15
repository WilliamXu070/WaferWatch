function getMetadataRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

export function getWaferFamilyDeleteIds(
  waferId: string,
  metadata: unknown,
  discoveredChildIds: string[] = []
) {
  const record = getMetadataRecord(metadata);

  // A die is independently addressable while siblings remain. Once the final
  // die is deleted, remove the hidden completed parent so its name is released.
  if (typeof record.parent_wafer_id === "string" && record.parent_wafer_id) {
    const hasSibling = discoveredChildIds.some((childId) => childId !== waferId);
    return hasSibling ? [waferId] : [waferId, record.parent_wafer_id];
  }

  const recordedChildIds = Array.isArray(record.diced_child_wafer_ids)
    ? record.diced_child_wafer_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  return Array.from(new Set([waferId, ...recordedChildIds, ...discoveredChildIds]));
}

export function isLegacyDeletedWaferFamily({
  assignmentStatuses,
  discoveredChildIds,
  metadata,
  waferStatus
}: {
  assignmentStatuses: string[];
  discoveredChildIds: string[];
  metadata: unknown;
  waferStatus: string;
}) {
  const record = getMetadataRecord(metadata);
  const recordedChildIds = Array.isArray(record.diced_child_wafer_ids)
    ? record.diced_child_wafer_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  return waferStatus === "completed" &&
    record.created_from === "process_flow_add_wafer" &&
    typeof record.dicing_completed_at === "string" &&
    recordedChildIds.length > 0 &&
    discoveredChildIds.length === 0 &&
    assignmentStatuses.length > 0 &&
    assignmentStatuses.every((status) => status === "completed");
}
