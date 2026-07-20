"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import type { WaferStatusTileModel } from "../../types";
import { DieAppearanceTemplate } from "./DieAppearanceTemplate";
import { getWaferDieNotesScopeKey, waferDieAppearanceSurface } from "./waferDieDetailData";

export const APPEARANCE_FIELD_KEY = waferDieAppearanceSurface.fieldKey;

type DieAppearanceState = {
  scopeKey: string | null;
  attachmentId: string | null;
  imageUrl: string | null;
  version: number;
  isLoading: boolean;
  error: string | null;
};

export function useDieAppearance(tile: WaferStatusTileModel) {
  const dieLabel = tile.dieLabel || tile.code;
  const scopeKey = getWaferDieNotesScopeKey(tile.waferId, dieLabel);
  const [savedAppearance, setSavedAppearanceState] = useState<DieAppearanceState | null>(null);
  const modelAppearance: DieAppearanceState = {
    scopeKey,
    attachmentId: tile.appearance?.attachmentId ?? null,
    imageUrl: tile.appearance?.imageUrl ?? null,
    version: tile.appearance?.version ?? 0,
    isLoading: false,
    error: null
  };
  const appearance = savedAppearance?.scopeKey === scopeKey && savedAppearance.version >= modelAppearance.version
    ? savedAppearance
    : modelAppearance;

  const setSavedAppearance = useCallback(({ attachmentId, imageUrl, version }: Pick<DieAppearanceState, "attachmentId" | "imageUrl" | "version">) => {
    setSavedAppearanceState({ scopeKey, attachmentId, imageUrl, version, isLoading: false, error: null });
  }, [scopeKey]);

  return {
    ...appearance,
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
  const imageUrl = tile.appearance?.imageUrl ?? null;
  const dieLabel = tile.dieLabel || tile.code;

  return (
    <div aria-busy={false} className={`relative grid h-full w-full place-items-center ${className}`}>
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
