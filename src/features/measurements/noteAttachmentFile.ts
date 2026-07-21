import { getNoteAttachmentMimeType } from "@/features/measurements/noteAttachmentDraft";

type HeicConverter = (options: {
  blob: Blob;
  toType: string;
  quality: number;
}) => Promise<Blob | Blob[]>;

const normalizedFilePromiseByFile = new WeakMap<File, Promise<File>>();

export function isHeicNoteAttachment(fileName: string, mimeType?: string | null) {
  const normalizedMimeType = mimeType?.toLowerCase().split(";", 1)[0].trim();
  return normalizedMimeType === "image/heic"
    || normalizedMimeType === "image/heic-sequence"
    || normalizedMimeType === "image/heif"
    || normalizedMimeType === "image/heif-sequence"
    || /\.(?:heic|heif)$/i.test(fileName);
}

function jpegFileName(fileName: string) {
  return /\.(?:heic|heif)$/i.test(fileName)
    ? fileName.replace(/\.(?:heic|heif)$/i, ".jpg")
    : `${fileName || "image"}.jpg`;
}

async function convertHeicToJpeg(options: Parameters<HeicConverter>[0]) {
  const { default: heic2any } = await import("heic2any");
  return heic2any(options);
}

async function normalizeFile(file: File, convertHeic: HeicConverter) {
  const mimeType = getNoteAttachmentMimeType(file);
  if (!mimeType) return file;

  if (isHeicNoteAttachment(file.name, mimeType)) {
    const converted = await convertHeic({ blob: file, toType: "image/jpeg", quality: 0.92 });
    const jpeg = Array.isArray(converted) ? converted[0] : converted;
    if (!jpeg) throw new Error(`Unable to convert ${file.name || "the HEIC image"}.`);
    return new File([jpeg], jpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified
    });
  }

  if (file.type.trim().toLowerCase() === mimeType) return file;
  return new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
}

export function normalizeNoteAttachmentFile(file: File, convertHeic?: HeicConverter) {
  if (convertHeic) return normalizeFile(file, convertHeic);

  const cached = normalizedFilePromiseByFile.get(file);
  if (cached) return cached;
  const pending = normalizeFile(file, convertHeicToJpeg);
  normalizedFilePromiseByFile.set(file, pending);
  return pending;
}

export function normalizeNoteAttachmentFiles(files: readonly File[]) {
  return Promise.all(files.map((file) => normalizeNoteAttachmentFile(file)));
}
