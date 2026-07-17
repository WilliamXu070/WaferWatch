"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { getAttachmentDownloadUrl } from "@/features/measurements/actions";
import { isWorkflowEventFor, WORKFLOW_REALTIME_EVENT } from "@/features/collaboration/realtime";
import { getTextSurface } from "@/features/text-surfaces/actions";
import type { WaferStatusTileModel } from "../../types";
import { DieAppearanceTemplate } from "./DieAppearanceTemplate";
import { getWaferDieNotesScopeKey, waferDieNotesSurface } from "./waferDieDetailData";

export const APPEARANCE_FIELD_KEY = "appearance_attachment_id";

type DieAppearanceState = {
  scopeKey: string | null;
  attachmentId: string | null;
  imageUrl: string | null;
  version: number;
  isLoading: boolean;
  error: string | null;
};

const initialAppearanceState: DieAppearanceState = {
  scopeKey: null,
  attachmentId: null,
  imageUrl: null,
  version: 0,
  isLoading: true,
  error: null
};

export function useDieAppearance(tile: WaferStatusTileModel) {
  const dieLabel = tile.dieLabel || tile.code;
  const scopeKey = getWaferDieNotesScopeKey(tile.waferId, dieLabel);
  const [appearance, setAppearance] = useState<DieAppearanceState>(initialAppearanceState);

  const loadAppearance = useCallback(async () => {
    setAppearance((current) => ({ ...current, isLoading: true, error: null }));
    const result = await getTextSurface({
      projectId: tile.projectId,
      scopeType: waferDieNotesSurface.scopeType,
      scopeKey,
      fieldKey: APPEARANCE_FIELD_KEY
    });

    if (!result.ok) {
      setAppearance((current) => ({ ...current, scopeKey, isLoading: false, error: result.error }));
      return;
    }

    const attachmentId = result.data?.value.trim() || null;
    const version = result.data?.version ?? 0;
    if (!attachmentId) {
      setAppearance({ scopeKey, attachmentId: null, imageUrl: null, version, isLoading: false, error: null });
      return;
    }

    const download = await getAttachmentDownloadUrl({ attachmentId });
    if (!download.ok) {
      setAppearance({ scopeKey, attachmentId, imageUrl: null, version, isLoading: false, error: download.error });
      return;
    }

    setAppearance({ scopeKey, attachmentId, imageUrl: download.data.signedUrl, version, isLoading: false, error: null });
  }, [scopeKey, tile.projectId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadAppearance(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadAppearance]);

  useEffect(() => {
    const handleRealtimeChange = (event: Event) => {
      if (isWorkflowEventFor({ event, table: "text_surfaces", projectId: tile.projectId })) {
        void loadAppearance();
      }
    };

    window.addEventListener(WORKFLOW_REALTIME_EVENT, handleRealtimeChange);
    return () => window.removeEventListener(WORKFLOW_REALTIME_EVENT, handleRealtimeChange);
  }, [loadAppearance, tile.projectId]);

  const setSavedAppearance = useCallback(({ attachmentId, imageUrl, version }: Pick<DieAppearanceState, "attachmentId" | "imageUrl" | "version">) => {
    setAppearance({ scopeKey, attachmentId, imageUrl, version, isLoading: false, error: null });
  }, [scopeKey]);

  const isCurrentScope = appearance.scopeKey === scopeKey;
  return {
    ...appearance,
    attachmentId: isCurrentScope ? appearance.attachmentId : null,
    imageUrl: isCurrentScope ? appearance.imageUrl : null,
    version: isCurrentScope ? appearance.version : 0,
    isLoading: isCurrentScope ? appearance.isLoading : true,
    error: isCurrentScope ? appearance.error : null,
    dieLabel,
    setSavedAppearance
  };
}

export function DieAppearancePreview({
  tile,
  className = "",
  imageClassName = "",
  sizes = "(max-width: 1024px) 40vw, 320px"
}: {
  tile: WaferStatusTileModel;
  className?: string;
  imageClassName?: string;
  sizes?: string;
}) {
  const { imageUrl, dieLabel, isLoading } = useDieAppearance(tile);

  return (
    <div aria-busy={isLoading} className={`relative grid h-full w-full place-items-center ${className}`}>
      {imageUrl ? (
        <Image
          alt={`${dieLabel} appearance`}
          className={`object-contain ${imageClassName}`}
          fill
          sizes={sizes}
          src={imageUrl}
          unoptimized
        />
      ) : (
        <DieAppearanceTemplate className="max-h-full max-w-full" />
      )}
    </div>
  );
}
