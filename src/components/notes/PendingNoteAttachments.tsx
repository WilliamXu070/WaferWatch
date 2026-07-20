"use client";

import Image from "next/image";
import { Camera, FileText, Images, Paperclip, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  formatNoteAttachmentSize,
  getNoteAttachmentFileKey,
  MAX_NOTE_ATTACHMENTS,
  NOTE_ATTACHMENT_ACCEPT,
  NOTE_ATTACHMENT_IMAGE_ACCEPT
} from "@/features/measurements/noteAttachmentDraft";

const previewUrlCache = new WeakMap<File, { url: string; consumers: number }>();

function getPreviewUrl(file: File) {
  if (!file.type.startsWith("image/") || typeof URL.createObjectURL !== "function") {
    return null;
  }
  const cached = previewUrlCache.get(file);
  if (cached) return cached.url;
  const url = URL.createObjectURL(file);
  previewUrlCache.set(file, { url, consumers: 0 });
  return url;
}

function PendingAttachmentPreview({ file }: { file: File }) {
  const [previewUrl] = useState<string | null>(() => getPreviewUrl(file));

  useEffect(() => {
    if (!previewUrl) return;
    const cached = previewUrlCache.get(file);
    if (!cached) return;
    cached.consumers += 1;
    return () => {
      cached.consumers -= 1;
      window.setTimeout(() => {
        if (cached.consumers > 0 || previewUrlCache.get(file) !== cached) return;
        URL.revokeObjectURL(cached.url);
        previewUrlCache.delete(file);
      }, 0);
    };
  }, [file, previewUrl]);

  if (!previewUrl) {
    return <FileText className="size-4 text-[#777770]" aria-hidden />;
  }

  return (
    <Image
      alt=""
      className="h-full w-full object-cover"
      fill
      sizes="44px"
      src={previewUrl}
      unoptimized
    />
  );
}

export function PendingNoteAttachments({
  files,
  disabled = false,
  description,
  mobileDescription,
  error,
  onAddFiles,
  onRemoveFile
}: {
  files: readonly File[];
  disabled?: boolean;
  description?: string;
  mobileDescription?: string;
  error?: string | null;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (file: File) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2" aria-label="Note attachments">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#dcdcd5] bg-white px-3 text-[12px] font-semibold text-[#55554f] hover:bg-[#f8f8f4] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 md:hidden">
          <Camera className="size-4" aria-hidden />
          Take photo
          <input
            accept={NOTE_ATTACHMENT_IMAGE_ACCEPT}
            capture="environment"
            className="sr-only"
            disabled={disabled || files.length >= MAX_NOTE_ATTACHMENTS}
            onChange={(event) => {
              const selectedFiles = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (selectedFiles.length) onAddFiles(selectedFiles);
            }}
            type="file"
          />
        </label>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#dcdcd5] bg-white px-3 text-[12px] font-semibold text-[#55554f] hover:bg-[#f8f8f4] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 md:hidden">
          <Images className="size-4" aria-hidden />
          Photo library
          <input
            accept={NOTE_ATTACHMENT_IMAGE_ACCEPT}
            className="sr-only"
            disabled={disabled || files.length >= MAX_NOTE_ATTACHMENTS}
            multiple
            onChange={(event) => {
              const selectedFiles = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (selectedFiles.length) onAddFiles(selectedFiles);
            }}
            type="file"
          />
        </label>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#dcdcd5] bg-white px-3 text-[12px] font-semibold text-[#55554f] hover:bg-[#f8f8f4] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 md:h-9 md:min-h-0">
          <Paperclip className="size-3.5" aria-hidden />
          <span className="md:hidden">Files</span>
          <span className="hidden md:inline">Attach files</span>
          <input
            accept={NOTE_ATTACHMENT_ACCEPT}
            className="sr-only"
            disabled={disabled || files.length >= MAX_NOTE_ATTACHMENTS}
            multiple
            onChange={(event) => {
              const selectedFiles = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (selectedFiles.length) onAddFiles(selectedFiles);
            }}
            type="file"
          />
        </label>
        <p className="m-0 hidden text-[11px] leading-4 text-[#85857d] md:block">
          {description ?? `Paste images with ⌘V or attach up to ${MAX_NOTE_ATTACHMENTS} files.`}
        </p>
        <p className="m-0 basis-full text-[11px] leading-4 text-[#85857d] md:hidden">
          {mobileDescription ?? `Add up to ${MAX_NOTE_ATTACHMENTS} photos or files.`}
        </p>
      </div>

      {files.length ? (
        <div className="flex min-w-0 flex-wrap gap-2" aria-live="polite">
          {files.map((file) => (
            <article
              className="grid h-12 max-w-[240px] grid-cols-[44px_minmax(0,1fr)_28px] items-center overflow-hidden rounded-lg border border-[#deded8] bg-[#fafaf7]"
              key={getNoteAttachmentFileKey(file)}
            >
              <div className="relative grid h-11 w-11 place-items-center overflow-hidden bg-[#f0f0eb]">
                <PendingAttachmentPreview file={file} />
              </div>
              <div className="min-w-0 px-2">
                <p className="truncate text-[11px] font-semibold text-[#3f3f3a]" title={file.name}>{file.name}</p>
                <p className="text-[10px] text-[#8a8a83]">{formatNoteAttachmentSize(file.size)}</p>
              </div>
              <button
                aria-label={`Remove ${file.name}`}
                className="grid h-7 w-7 place-items-center rounded-md text-[#777770] hover:bg-[#ecece6] hover:text-[#171714] disabled:opacity-50"
                disabled={disabled}
                onClick={() => onRemoveFile(file)}
                type="button"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {error ? <p className="m-0 text-[12px] font-semibold text-[#9c3028]" role="status">{error}</p> : null}
    </div>
  );
}
