export const MAX_NOTE_ATTACHMENTS = 8;
export const NOTE_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export const NOTE_ATTACHMENT_ACCEPT = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".csv",
  ".json"
].join(",");

export function getNoteAttachmentFileKey(file: File) {
  return `${file.name}:${file.type}:${file.size}`;
}

export function formatNoteAttachmentSize(sizeBytes: number | null | undefined) {
  if (!sizeBytes) return "";
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mergeNoteAttachmentFiles(
  current: readonly File[],
  incoming: readonly File[],
  maxFiles = MAX_NOTE_ATTACHMENTS
) {
  const accepted = incoming.filter((file) => file.size <= NOTE_ATTACHMENT_MAX_BYTES);
  const keys = new Set(current.map(getNoteAttachmentFileKey));
  let duplicateCount = 0;
  const additions = accepted.filter((file) => {
    const key = getNoteAttachmentFileKey(file);
    if (keys.has(key)) {
      duplicateCount += 1;
      return false;
    }
    keys.add(key);
    return true;
  });
  const combined = [...current, ...additions];

  return {
    files: combined.slice(0, maxFiles),
    duplicateCount,
    oversizedCount: incoming.length - accepted.length,
    overflowCount: Math.max(0, combined.length - maxFiles)
  };
}
