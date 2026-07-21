"use client";

import Image from "next/image";
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { getAttachmentDownloadUrl } from "@/features/measurements/actions";
import { getClipboardImageFiles } from "@/features/measurements/clipboardImages";
import { NOTE_ATTACHMENT_MAX_BYTES, uploadWaferNoteAttachments } from "@/features/measurements/noteAttachmentUpload";
import { upsertTextSurface } from "@/features/text-surfaces/actions";
import type { WaferStatusTileModel } from "../../types";
import { DetailCard } from "./DetailCard";
import { APPEARANCE_FIELD_KEY, useDieAppearance } from "./DieAppearancePreview";
import { DieAppearanceTemplate } from "./DieAppearanceTemplate";
import { getWaferDieNotesScopeKey, waferDieNotesSurface } from "./waferDieDetailData";

const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function DieAppearanceCard({ tile, canEdit }: { tile: WaferStatusTileModel; canEdit: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const {
    attachmentId,
    dieLabel,
    error: appearanceError,
    imageUrl,
    isLoading,
    setSavedAppearance,
    version
  } = useDieAppearance(tile);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBusy = isLoading || isUploading;
  const scopeKey = getWaferDieNotesScopeKey(tile.waferId, dieLabel);

  const uploadImage = useCallback(async (file: File) => {
    if (!canEdit || isBusy) {
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setError("Use a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > NOTE_ATTACHMENT_MAX_BYTES) {
      setError("Images must be 50 MB or smaller.");
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const [attachment] = await uploadWaferNoteAttachments({
        projectId: tile.projectId,
        waferId: tile.waferId,
        dieLabel,
        category: "appearance",
        stepExecutionId: tile.currentStepExecutionId ?? null,
        noteId: crypto.randomUUID(),
        files: [file]
      });
      if (!attachment) {
        throw new Error("The die image was not uploaded.");
      }

      const saved = await upsertTextSurface({
        projectId: tile.projectId,
        scopeType: waferDieNotesSurface.scopeType,
        scopeKey,
        fieldKey: APPEARANCE_FIELD_KEY,
        value: attachment.id,
        expectedVersion: version
      });
      if (!saved.ok) {
        throw new Error(saved.error);
      }

      const download = await getAttachmentDownloadUrl({ attachmentId: attachment.id });
      if (!download.ok) {
        throw new Error(download.error);
      }
      setSavedAppearance({ attachmentId: attachment.id, imageUrl: download.data.signedUrl, version: saved.data.version });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to save the die image.");
    } finally {
      setIsUploading(false);
    }
  }, [canEdit, dieLabel, isBusy, scopeKey, setSavedAppearance, tile.currentStepExecutionId, tile.projectId, tile.waferId, version]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void uploadImage(file);
  };

  const { getRootProps, isDragActive } = useDropzone({
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"]
    },
    disabled: !canEdit || isBusy,
    maxSize: NOTE_ATTACHMENT_MAX_BYTES,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    onDrop: (acceptedFiles, rejectedFiles) => {
      const [file] = acceptedFiles;
      if (file) {
        void uploadImage(file);
        return;
      }
      if (rejectedFiles.length > 0) {
        setError("Use a PNG, JPEG, or WebP image up to 50 MB.");
      }
    }
  });

  useEffect(() => {
    if (!canEdit) return;

    const handlePaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isBusy) return;

      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const [image] = getClipboardImageFiles(clipboardData);
      if (!image) return;

      event.preventDefault();
      void uploadImage(image);
    };

    // The native file picker moves focus away from the canvas. Listening while
    // this editor is open makes ⌘V / clipboard paste a first-class replacement
    // path, even when the operator did not first tab to the preview.
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [canEdit, isBusy, uploadImage]);

  return (
    <DetailCard title="Die appearance" className="die-appearance-card">
      <div
        {...getRootProps({
          className: [
            "die-appearance-card__canvas group relative grid min-h-[260px] place-items-center overflow-hidden rounded-lg border bg-[#fafaf7] outline-none focus-within:border-[#111111] focus:border-[#111111]",
            isDragActive ? "border-[#55554f] bg-[#f1f1eb]" : "border-[#e5e5e0]"
          ].join(" "),
          tabIndex: canEdit ? 0 : -1,
          "aria-label": canEdit ? "Die appearance image drop zone" : "Die appearance",
          "data-die-appearance-dropzone": canEdit ? "true" : undefined,
          "data-drag-active": isDragActive ? "true" : "false"
        })}
      >
        {imageUrl ? (
          <Image
            alt={`${dieLabel} appearance`}
            className="object-contain p-3"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            src={imageUrl}
            unoptimized
          />
        ) : (
          <div className="grid w-full max-w-[280px] justify-items-center gap-3 px-6 text-center">
            <DieAppearanceTemplate className="h-[130px] max-w-[180px]" />
            <div>
              <p className="text-[14px] font-semibold text-[#22221f]">
                {isBusy ? "Loading image..." : "Die image template"}
              </p>
              {canEdit ? <p className="mt-1 text-[12px] leading-5 text-[#777770]">Choose, drop, or paste a PNG, JPEG, or WebP image.</p> : null}
            </div>
          </div>
        )}

        {canEdit ? (
          <div className="absolute inset-x-3 bottom-3 flex justify-end">
            <button
              className="button ghost-button bg-white/95"
              disabled={isBusy}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <ImagePlus aria-hidden size={15} />
              {attachmentId ? "Replace image" : "Add image"}
            </button>
          </div>
        ) : null}

        {isDragActive ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[#f1f1eb]/95 text-[13px] font-semibold text-[#33332f]" role="status">
            <span className="inline-flex items-center gap-2">
              <Upload aria-hidden size={17} />
              Drop to {attachmentId ? "replace image" : "add image"}
            </span>
          </div>
        ) : null}
      </div>
      {canEdit ? (
        <input
          ref={inputRef}
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          name="dieAppearanceImage"
          onChange={handleFileChange}
          type="file"
        />
      ) : null}
      {error || appearanceError ? <p className="form-error mt-2" role="alert">{error || appearanceError}</p> : null}
    </DetailCard>
  );
}
