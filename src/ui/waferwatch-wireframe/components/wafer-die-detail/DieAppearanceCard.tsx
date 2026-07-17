"use client";

import Image from "next/image";
import { type ChangeEvent, type ClipboardEvent, useCallback, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
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

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const [image] = getClipboardImageFiles(event.clipboardData);
    if (!image) return;
    event.preventDefault();
    void uploadImage(image);
  };

  return (
    <DetailCard title="Die appearance" className="die-appearance-card">
      <div
        className="die-appearance-card__canvas group relative grid min-h-[260px] place-items-center overflow-hidden rounded-lg border border-[#e5e5e0] bg-[#fafaf7] outline-none focus-within:border-[#111111] focus:border-[#111111]"
        onPaste={handlePaste}
        tabIndex={canEdit ? 0 : -1}
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
              {canEdit ? <p className="mt-1 text-[12px] leading-5 text-[#777770]">Upload or paste an image to replace this template.</p> : null}
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
      </div>
      <input
        ref={inputRef}
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        name="dieAppearanceImage"
        onChange={handleFileChange}
        type="file"
      />
      {error || appearanceError ? <p className="form-error mt-2" role="alert">{error || appearanceError}</p> : null}
    </DetailCard>
  );
}
