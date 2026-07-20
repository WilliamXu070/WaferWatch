export type WaferStatusAppearanceSurfaceSource = {
  projectId: string;
  scopeKey: string;
  attachmentId: string;
  version: number;
};

export type WaferStatusAppearanceAttachmentSource = {
  id: string;
  projectId: string;
  bucketName: string;
  objectPath: string;
};

export type WaferStatusAppearanceSnapshot = {
  attachmentId: string;
  imageUrl: string | null;
  version: number;
};

export function getWaferStatusSurfaceMapKey({
  projectId,
  scopeType,
  scopeKey,
  fieldKey
}: {
  projectId: string;
  scopeType: string;
  scopeKey: string;
  fieldKey: string;
}) {
  return [projectId, scopeType, scopeKey, fieldKey].join(":");
}

export function getAppearanceAttachmentIds(surfaces: readonly WaferStatusAppearanceSurfaceSource[]) {
  return Array.from(new Set(surfaces.map((surface) => surface.attachmentId).filter(Boolean)));
}

/**
 * Only user-scoped attachment rows returned by Supabase are eligible for admin
 * signing. A surface cannot make an inaccessible attachment signable merely by
 * storing its id.
 */
export function groupAuthorizedAppearanceAttachments({
  surfaces,
  attachments
}: {
  surfaces: readonly WaferStatusAppearanceSurfaceSource[];
  attachments: readonly WaferStatusAppearanceAttachmentSource[];
}) {
  const requestedProjectsByAttachmentId = new Map<string, Set<string>>();
  for (const surface of surfaces) {
    const projects = requestedProjectsByAttachmentId.get(surface.attachmentId) ?? new Set<string>();
    projects.add(surface.projectId);
    requestedProjectsByAttachmentId.set(surface.attachmentId, projects);
  }

  const groups = new Map<string, WaferStatusAppearanceAttachmentSource[]>();
  for (const attachment of attachments) {
    if (!requestedProjectsByAttachmentId.get(attachment.id)?.has(attachment.projectId)) continue;
    const bucket = groups.get(attachment.bucketName) ?? [];
    if (!bucket.some((candidate) => candidate.id === attachment.id)) {
      bucket.push(attachment);
      groups.set(attachment.bucketName, bucket);
    }
  }

  return groups;
}

export function buildAppearanceSnapshotsBySurfaceKey({
  surfaces,
  attachments,
  signedUrlByAttachmentId,
  scopeType,
  fieldKey
}: {
  surfaces: readonly WaferStatusAppearanceSurfaceSource[];
  attachments: readonly WaferStatusAppearanceAttachmentSource[];
  signedUrlByAttachmentId: ReadonlyMap<string, string>;
  scopeType: string;
  fieldKey: string;
}) {
  const attachmentById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  const snapshots = new Map<string, WaferStatusAppearanceSnapshot>();

  for (const surface of surfaces) {
    const attachment = attachmentById.get(surface.attachmentId);
    if (!attachment || attachment.projectId !== surface.projectId) continue;
    snapshots.set(getWaferStatusSurfaceMapKey({
      projectId: surface.projectId,
      scopeType,
      scopeKey: surface.scopeKey,
      fieldKey
    }), {
      attachmentId: surface.attachmentId,
      imageUrl: signedUrlByAttachmentId.get(surface.attachmentId) ?? null,
      version: surface.version
    });
  }

  return snapshots;
}
