export const MAX_NOTE_ATTACHMENTS = 8;
export const NOTE_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

const NOTE_ATTACHMENT_EXTENSIONS = [
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
];

export const NOTE_ATTACHMENT_ACCEPT = NOTE_ATTACHMENT_EXTENSIONS.join(",");

export const NOTE_ATTACHMENT_IMAGE_ACCEPT = "image/*,.heic,.heif,.tif,.tiff";

const contentKeyByFile = new WeakMap<File, string>();
const contentKeyPromiseByFile = new WeakMap<File, Promise<void>>();

const NOTE_ATTACHMENT_MIME_TYPES = new Set([
  "application/json",
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv"
]);

export function isAcceptedNoteAttachmentFile(file: File) {
  const normalizedName = file.name.trim().toLowerCase();
  return file.type.startsWith("image/")
    || NOTE_ATTACHMENT_MIME_TYPES.has(file.type.toLowerCase())
    || NOTE_ATTACHMENT_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
}

async function cacheNoteAttachmentContentKey(file: File) {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return;
    const digest = await subtle.digest("SHA-256", await file.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    contentKeyByFile.set(file, `sha256:${file.type}:${file.size}:${hash}`);
  } catch {
    // Metadata identity remains available when content hashing is unsupported.
  }
}

export async function prepareNoteAttachmentFiles(files: readonly File[]) {
  await Promise.all(files
    .filter((file) => file.size <= NOTE_ATTACHMENT_MAX_BYTES)
    .map((file) => {
      const cached = contentKeyPromiseByFile.get(file);
      if (cached) return cached;
      const pending = cacheNoteAttachmentContentKey(file);
      contentKeyPromiseByFile.set(file, pending);
      return pending;
    }));
}

export function getNoteAttachmentFileKey(file: File) {
  return contentKeyByFile.get(file) ?? `${file.name}:${file.type}:${file.size}`;
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
  const supported = incoming.filter(isAcceptedNoteAttachmentFile);
  const accepted = supported.filter((file) => file.size <= NOTE_ATTACHMENT_MAX_BYTES);
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
    unsupportedCount: incoming.length - supported.length,
    oversizedCount: supported.length - accepted.length,
    overflowCount: Math.max(0, combined.length - maxFiles)
  };
}

export function getNoteAttachmentMergeError(
  result: Pick<ReturnType<typeof mergeNoteAttachmentFiles>, "overflowCount" | "oversizedCount" | "unsupportedCount">
) {
  if (result.unsupportedCount > 0) {
    return "Use an image, PDF, Word, PowerPoint, Excel, CSV, or JSON file.";
  }
  if (result.oversizedCount > 0) {
    return "Files must be 50 MB or smaller.";
  }
  if (result.overflowCount > 0) {
    return `You can attach up to ${MAX_NOTE_ATTACHMENTS} files.`;
  }
  return null;
}
