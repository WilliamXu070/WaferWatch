"use client";

import { useId } from "react";
import type {
  ParsedWaferPolygon,
  WaferChipPiece,
  WaferMode,
  WaferViewport
} from "@/features/wafers/geometry";
import {
  buildDieOverlayRectsMm,
  buildSvgViewport,
  buildWaferPieces,
  deriveWaferGeometry,
  normalizeToMillimeters,
  overlayRectMmToSvg,
  parseGdsPolygons,
  toSvgPoints
} from "@/features/wafers/geometry";

export type WaferGeometry = {
  outline: ParsedWaferPolygon;
  viewport: WaferViewport;
};

type WaferGeometryPreviewProps = {
  geometry: WaferGeometry | null;
  mode: WaferMode;
  selectedLabel?: number;
  className?: string;
  dimmed?: boolean;
};

export const WAFER_GDS_ASSET_PATH = "/wafer-assets/wafer_4in_100mm_bottom_primary_flat_only.gds";

export async function loadWaferGeometry(assetPath = WAFER_GDS_ASSET_PATH): Promise<WaferGeometry | null> {
  const response = await fetch(assetPath);
  if (!response.ok) {
    return null;
  }

  const buffer = await response.arrayBuffer();
  const normalized = normalizeToMillimeters(parseGdsPolygons(buffer));
  const outline = deriveWaferGeometry(normalized);

  if (!outline) {
    return null;
  }

  return {
    outline,
    viewport: buildSvgViewport(outline.points)
  };
}

function getPreviewPieces(geometry: WaferGeometry, mode: WaferMode) {
  return buildWaferPieces(geometry.outline.points, mode);
}

function renderOverlay(chip: WaferChipPiece, viewport: WaferViewport, idPrefix: string) {
  if (chip.label === 1) {
    return null;
  }

  const clipId = `${idPrefix}-chip-${chip.id}`;
  const rects = buildDieOverlayRectsMm(chip.points, chip.label).map((rect) => overlayRectMmToSvg(rect, viewport));

  return (
    <g clipPath={`url(#${clipId})`} aria-hidden>
      {rects.map((rect) => (
        <rect
          key={rect.id}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          className="stroke-current text-[#7c8792]"
          fill="#d8dddf"
          fillOpacity={0.42}
          strokeWidth={0.7}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

export function WaferGeometryPreview({
  geometry,
  mode,
  selectedLabel,
  className = "",
  dimmed = false
}: WaferGeometryPreviewProps) {
  const fallbackId = useId().replace(/:/g, "");

  if (!geometry) {
    return (
      <div
        className={[
          "grid aspect-[1.35] min-h-[78px] place-items-center rounded-md border border-dashed border-[#c9ccd0] bg-[#f6f7f5]",
          className
        ].join(" ")}
      >
        <span className="text-[11px] font-semibold text-[#8a8f92]">GDS</span>
      </div>
    );
  }

  const pieces = getPreviewPieces(geometry, mode);
  const idPrefix = `wafer-preview-${fallbackId}-${mode}-${selectedLabel ?? "all"}`;

  return (
    <svg
      className={[
        "h-full w-full overflow-visible",
        dimmed ? "opacity-45" : "opacity-100",
        className
      ].join(" ")}
      viewBox={`0 0 ${geometry.viewport.halfSpan * 2} ${geometry.viewport.halfSpan * 2}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Cut wafer geometry preview"
    >
      <defs>
        {pieces.map((chip) => (
          <clipPath id={`${idPrefix}-chip-${chip.id}`} key={chip.id}>
            <polygon points={toSvgPoints(chip.points, geometry.viewport)} />
          </clipPath>
        ))}
      </defs>

      <polygon
        points={toSvgPoints(geometry.outline.points, geometry.viewport)}
        fill="#f3f6f2"
        stroke="#737b82"
        strokeWidth={0.9}
        vectorEffect="non-scaling-stroke"
      />

      {pieces.map((chip) => {
        const selected = chip.label === selectedLabel;
        return (
          <g key={chip.id}>
            <polygon
              points={toSvgPoints(chip.points, geometry.viewport)}
              fill={selected ? "#dce8ff" : "#fbfcfa"}
              stroke={selected ? "#2f5fb3" : "#8a9297"}
              strokeWidth={selected ? 1.45 : 0.75}
              vectorEffect="non-scaling-stroke"
            />
            {renderOverlay(chip, geometry.viewport, idPrefix)}
          </g>
        );
      })}
    </svg>
  );
}
