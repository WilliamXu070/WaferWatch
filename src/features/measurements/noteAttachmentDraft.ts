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

const contentKeyByFile = new WeakMap<File, string>();
const contentKeyPromiseByFile = new WeakMap<File, Promise<void>>();

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
