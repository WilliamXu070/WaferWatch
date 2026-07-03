"use client";

import { useEffect, useMemo, useState, type FC } from "react";
import {
  type WaferChipPiece,
  type WaferMode,
  type WaferPoint,
  type WaferViewport,
  buildDieOverlayRectsMm,
  buildSvgViewport,
  buildWaferPieces,
  deriveWaferGeometry,
  normalizeToMillimeters,
  overlayRectMmToSvg,
  parseGdsPolygons,
  DEFAULT_WAFER_CUT_RECIPE
} from "@/features/wafers/geometry";

type WaferModeHint = WaferMode;

type WaferGeometryPreviewProps = {
  modeKeyword?: string;
  selectedLabel?: number;
  selectedDieCode?: string;
  colorSeed?: string;
  showDieLabel?: boolean;
  showOnlySelectedDie?: boolean;
  className?: string;
  dimmed?: boolean;
};

const PRE_MODE_KEYWORDS = [
  "pre",
  "litho",
  "etch",
  "predice",
  "pre-dice",
  "pre dice",
  "preclean",
  "pre clean",
  "pre-clean",
  "precise"
];

const POST_MODE_KEYWORDS = [
  "post",
  "postdice",
  "post-dice",
  "post dice",
  "postelb",
  "post elb",
  "post clean",
  "post-clean",
  "post-cleaning",
  "elb",
  "poling",
  "pad",
  "posting",
  "p0st",
  "poast",
  "posnt"
];

const GENERIC_MODE_TOKENS = new Set(["clean"]);
const WAFER_DIAMETER_MM = 100;
const WAFER_SEGMENTS = 96;
const SVG_COORD_PRECISION = 6;
const WAFER_GDS_ASSET_PATH = "/wafer-assets/wafer_4in_100mm_bottom_primary_flat_only.gds";
const PRIMARY_FLAT_Y_MM = -45;

const PALETTE = {
  pre: {
    chipFill: "#ffffff",
    chipStroke: "#9aa49a",
    chipFillActive: "#e9f0e3",
    chipStrokeActive: "#5f7b56",
    fillSaturation: 8,
    strokeSaturation: 20,
    hueBase: 145
  },
  post: {
    chipFill: "#f4f7f1",
    chipStroke: "#8d9a8c",
    chipFillActive: "#e3ecd9",
    chipStrokeActive: "#557451",
    fillSaturation: 12,
    strokeSaturation: 24,
    hueBase: 205
  }
};

type WaferSwatch = {
  fill: string;
  stroke: string;
  fillActive: string;
  strokeActive: string;
  text: string;
  textActive: string;
};

const FAMILY_SWATCHES: Record<string, Record<"pre" | "post", WaferSwatch>> = {
  ALPHA: {
    pre: {
      fill: "#edf7e9",
      stroke: "#86aa78",
      fillActive: "#d5eccd",
      strokeActive: "#4f7f42",
      text: "#5f7658",
      textActive: "#2f5628"
    },
    post: {
      fill: "#e8f4e3",
      stroke: "#74a063",
      fillActive: "#cde7c3",
      strokeActive: "#3f7534",
      text: "#587250",
      textActive: "#2d5327"
    }
  },
  BETA: {
    pre: {
      fill: "#eaf3fb",
      stroke: "#78a4ca",
      fillActive: "#d1e7f8",
      strokeActive: "#3f759f",
      text: "#526f88",
      textActive: "#2f5878"
    },
    post: {
      fill: "#e5f0fa",
      stroke: "#6898c2",
      fillActive: "#c7def3",
      strokeActive: "#326b98",
      text: "#4d6d88",
      textActive: "#2b5578"
    }
  },
  GAMMA: {
    pre: {
      fill: "#fdecea",
      stroke: "#d8877d",
      fillActive: "#f8d5d1",
      strokeActive: "#ad554b",
      text: "#8a5e59",
      textActive: "#753d36"
    },
    post: {
      fill: "#fae7e4",
      stroke: "#cf796e",
      fillActive: "#f4cac5",
      strokeActive: "#9f493f",
      text: "#855853",
      textActive: "#703831"
    }
  }
};

function hashSeed(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }

  return hash >>> 0;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const s = clamp01(saturation / 100);
  const l = clamp01(lightness / 100);

  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const huePrime = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (huePrime >= 0 && huePrime < 1) {
    r1 = chroma;
    g1 = x;
  } else if (huePrime < 2) {
    r1 = x;
    g1 = chroma;
  } else if (huePrime < 3) {
    g1 = chroma;
    b1 = x;
  } else if (huePrime < 4) {
    g1 = x;
    b1 = chroma;
  } else if (huePrime < 5) {
    r1 = x;
    b1 = chroma;
  } else {
    r1 = chroma;
    b1 = x;
  }

  const m = l - chroma / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);

  const toHex = (value: number) => value.toString(16).padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function buildWaferSwatch(seed: string, mode: "pre" | "post") {
  const familySwatch = FAMILY_SWATCHES[seed.trim().toUpperCase()];
  if (familySwatch) {
    return familySwatch[mode];
  }

  const modePalette = PALETTE[mode];
  const hashed = hashSeed(seed);
  const hueShift = hashed % 90;
  const hue = modePalette.hueBase + hueShift;
  const fill = hslToHex(hue, Math.min(26, Math.max(6, modePalette.fillSaturation + (hashed % 11))), 94);
  const fillActive = hslToHex(hue, Math.min(30, modePalette.fillSaturation + (hashed % 14)), 86);
  const stroke = hslToHex(hue, Math.min(35, modePalette.strokeSaturation + (hashed % 13)), 74);
  const strokeActive = hslToHex(hue, Math.min(38, modePalette.strokeSaturation + (hashed % 17)), 58);

  return {
    fill,
    stroke,
    fillActive,
    strokeActive,
    text: stroke,
    textActive: strokeActive
  } satisfies WaferSwatch;
}

function formatSvgCoordinate(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toFixed(SVG_COORD_PRECISION);
}

function toSvgPointsRounded(points: WaferPoint[], viewport: WaferViewport) {
  return points
    .map(
      (point) =>
        `${formatSvgCoordinate(point.x - viewport.centerX + viewport.halfSpan)},${formatSvgCoordinate(
          viewport.halfSpan - (point.y - viewport.centerY)
        )}`
    )
    .join(" ");
}

function toSvgLabelCenterRounded(points: WaferPoint[], viewport: WaferViewport) {
  const centroid = computeCentroid(points);

  return {
    x: Number(formatSvgCoordinate(centroid.x - viewport.centerX + viewport.halfSpan)),
    y: Number(formatSvgCoordinate(viewport.halfSpan - (centroid.y - viewport.centerY)))
  };
}

type ParsedDieCode = {
  label?: string;
  index?: number;
};

function normalizeKeyword(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, (_, row) => [row]);

  for (let column = 1; column <= b.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      if (a[row - 1] === b[column - 1]) {
        matrix[row][column] = matrix[row - 1][column - 1];
      } else {
        matrix[row][column] =
          Math.min(matrix[row - 1][column - 1], matrix[row][column - 1], matrix[row - 1][column]) + 1;
      }
    }
  }

  return matrix[a.length][b.length];
}

function hasCloseMatch(value: string, candidates: readonly string[], threshold: number) {
  const normalizedTokens = value
    .split(" ")
    .filter(Boolean)
    .flatMap((token, index, tokens) => {
      const pair = tokens[index + 1];
      return pair ? [token, `${token} ${pair}`] : [token];
    });

  return candidates.some((candidate) =>
    normalizedTokens.some((token) => {
      if (token === candidate || token.includes(candidate)) {
        return true;
      }

      if (!GENERIC_MODE_TOKENS.has(token) && candidate.includes(token) && candidate.length > 3) {
        return true;
      }

      return levenshtein(token, candidate) <= threshold;
    })
  );
}

function parseDieCode(value?: string): ParsedDieCode {
  if (!value) {
    return {};
  }

  const normalized = value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const codedMatches = normalized.match(/[A-Z]+[0-9]+/g);

  if (codedMatches?.length) {
    const bestMatch = [...codedMatches].reverse().find((match) => /^[A-Z]{1,3}[0-9]+$/.test(match));
    if (bestMatch) {
      const parsedIndex = Number(bestMatch.replace(/^[A-Z]+/, ""));
      if (!Number.isNaN(parsedIndex)) {
        return {
          label: bestMatch,
          index: parsedIndex
        };
      }
    }
  }

  const directMatch = normalized.match(/\d+/);
  if (!directMatch) {
    return {};
  }

  const parsedIndex = Number(directMatch[0]);
  return {
    index: Number.isNaN(parsedIndex) ? undefined : parsedIndex
  };
}

function inferModeFromKeyword(modeKeyword?: string): WaferModeHint {
  const normalized = normalizeKeyword(modeKeyword);
  const explicitPreIndex = normalized.indexOf("pre");
  const explicitPostIndex = normalized.indexOf("post");
  const hasExplicitPre = explicitPreIndex >= 0;
  const hasExplicitPost = explicitPostIndex >= 0;

  if (hasExplicitPre && !hasExplicitPost) {
    return "pre-dice";
  }

  if (hasExplicitPost && !hasExplicitPre) {
    return "post-dice";
  }

  if (hasExplicitPre && hasExplicitPost) {
    return explicitPostIndex < explicitPreIndex ? "post-dice" : "pre-dice";
  }

  const normalizedPre = PRE_MODE_KEYWORDS.map((keyword) => normalizeKeyword(keyword));
  const normalizedPost = POST_MODE_KEYWORDS.map((keyword) => normalizeKeyword(keyword));
  const hasPre = hasCloseMatch(normalized, normalizedPre, 1) || normalized.includes("pre");
  const hasPost = hasCloseMatch(normalized, normalizedPost, 1) || normalized.includes("post");

  if (hasPost && !hasPre) {
    return "post-dice";
  }

  if (hasPre && !hasPost) {
    return "pre-dice";
  }

  return hasPost ? "post-dice" : "pre-dice";
}

function parseSelectedDieCode(label: number, dieCode?: string) {
  const parsed = parseDieCode(dieCode);

  if (!parsed.label && !parsed.index) {
    return String(label);
  }

  if (parsed.label) {
    return parsed.label;
  }

  if (!parsed.index) {
    return String(label);
  }

  if (parsed.index === label) {
    return parsed.label || String(label);
  }

  return String(label);
}

let cachedImportedWaferPoints: WaferPoint[] | null = null;
let importedWaferPointsPromise: Promise<WaferPoint[] | null> | null = null;

async function loadImportedFlatWaferOutline() {
  if (cachedImportedWaferPoints) {
    return cachedImportedWaferPoints;
  }

  importedWaferPointsPromise ??= fetch(WAFER_GDS_ASSET_PATH)
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }

      const buffer = await response.arrayBuffer();
      const normalized = normalizeToMillimeters(parseGdsPolygons(buffer));
      const outline = deriveWaferGeometry(normalized);

      if (!outline) {
        return null;
      }

      cachedImportedWaferPoints = outline.points;
      return outline.points;
    })
    .catch(() => null);

  return importedWaferPointsPromise;
}

function buildFlatBottomWaferOutline(
  diameterMm = WAFER_DIAMETER_MM,
  segments = WAFER_SEGMENTS
): WaferPoint[] {
  const radius = diameterMm / 2;
  const pointCount = Math.max(24, Math.round(segments));
  const flatY = Math.max(-radius + 1, Math.min(radius - 1, PRIMARY_FLAT_Y_MM));
  const flatHalfWidth = Math.sqrt(radius * radius - flatY * flatY);
  const startAngle = Math.atan2(flatY, flatHalfWidth);
  const endAngle = Math.atan2(flatY, -flatHalfWidth) + Math.PI * 2;
  const arcStep = (endAngle - startAngle) / (pointCount - 1);

  return Array.from({ length: pointCount }, (_, index) => {
    const angle = startAngle + index * arcStep;

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  });
}

function computeCentroid(points: WaferPoint[]) {
  let area = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    area += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  if (area === 0) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);

    return {
      x: (Math.max(...xs) + Math.min(...xs)) / 2,
      y: (Math.max(...ys) + Math.min(...ys)) / 2
    };
  }

  const divisor = 6 * area;
  return {
    x: centroidX / divisor,
    y: centroidY / divisor
  };
}

function renderChipOverlay(chip: WaferChipPiece, viewport: WaferViewport, focused: boolean) {
  if (!focused) {
    return null;
  }

  const rects = buildDieOverlayRectsMm(chip.points, chip.label).map((rect) => overlayRectMmToSvg(rect, viewport));
  if (rects.length === 0) {
    return null;
  }

  const clipId = `wafer-preview-chip-clip-${chip.id}`;

  return (
    <g clipPath={`url(#${clipId})`} key={`${chip.id}-overlay`}>
      {rects.map((rect) => (
        <rect
          key={`${chip.id}-${rect.id}`}
          x={formatSvgCoordinate(rect.x)}
          y={formatSvgCoordinate(rect.y)}
          width={formatSvgCoordinate(rect.width)}
          height={formatSvgCoordinate(rect.height)}
          fill="#dbe2d8"
          fillOpacity={0.42}
          stroke="#7f8d7c"
          strokeWidth={0.6}
        />
      ))}
    </g>
  );
}

function clampSelectedLabel(label: number | undefined, chipCount: number) {
  const value = Number.isFinite(label as number) ? Number(label) : NaN;

  if (!Number.isFinite(value) || value < 1 || value > chipCount) {
    return chipCount === 1 ? 1 : undefined;
  }

  return Math.floor(value);
}

export const WaferGeometryPreview: FC<WaferGeometryPreviewProps> = ({
  modeKeyword,
  selectedLabel,
  selectedDieCode,
  colorSeed,
  showDieLabel = true,
  showOnlySelectedDie = false,
  className = "",
  dimmed = false
}) => {
  const mode = inferModeFromKeyword(modeKeyword);
  const chipSeed = (colorSeed || selectedDieCode || String(selectedLabel ?? "")).trim();
  const parsedDieCode = parseDieCode(selectedDieCode);
  const activeMode = mode === "pre-dice" ? "pre" : "post";
  const fallbackWaferPoints = useMemo(() => buildFlatBottomWaferOutline(), []);
  const [importedWaferPoints, setImportedWaferPoints] = useState<WaferPoint[] | null>(cachedImportedWaferPoints);
  const waferPoints = importedWaferPoints ?? fallbackWaferPoints;

  useEffect(() => {
    let isStale = false;

    void loadImportedFlatWaferOutline().then((points) => {
      if (!isStale && points) {
        setImportedWaferPoints(points);
      }
    });

    return () => {
      isStale = true;
    };
  }, []);

  const viewport = useMemo(() => buildSvgViewport(waferPoints), [waferPoints]);
  const requestedLabel =
    selectedLabel !== undefined && Number.isInteger(selectedLabel) ? selectedLabel : parsedDieCode.index;

  const requestMode = mode === "pre-dice" && showOnlySelectedDie && requestedLabel !== undefined
    ? "post-dice"
    : mode;

  const chips = useMemo(
    () => buildWaferPieces(waferPoints, requestMode, DEFAULT_WAFER_CUT_RECIPE),
    [requestMode, waferPoints]
  );

  const focusedLabel = clampSelectedLabel(requestedLabel, chips.length);
  const displayOnlyFocused = showOnlySelectedDie && focusedLabel !== undefined;
  const focusedChip = displayOnlyFocused ? chips.find((chip) => chip.label === focusedLabel) : undefined;
  const viewportForRender = useMemo(
    () =>
      focusedChip
        ? buildSvgViewport(focusedChip.points, 10)
        : viewport,
    [focusedChip, viewport]
  );
  const visibleChips = displayOnlyFocused && focusedChip ? [focusedChip] : chips;
  const labelCenterViewport = displayOnlyFocused && focusedChip ? viewportForRender : viewport;

  return (
    <div className={"grid min-h-[78px] w-full place-items-center " + className}>
      <svg
        className={"h-full w-full max-w-[220px] " + (dimmed ? "opacity-50" : "opacity-100")}
        viewBox={`0 0 ${formatSvgCoordinate(viewportForRender.halfSpan * 2)} ${formatSvgCoordinate(viewportForRender.halfSpan * 2)}`}
        role="img"
        aria-label="Wafer keyword preview"
      >
        <defs>
          {visibleChips.map((chip) => (
            <clipPath key={`${chip.id}-clip`} id={`wafer-preview-chip-clip-${chip.id}`}>
              <polygon points={toSvgPointsRounded(chip.points, viewportForRender)} />
            </clipPath>
          ))}
        </defs>

        {visibleChips.map((chip) => {
          const isSelected = chip.label === focusedLabel;
          const chipCenter = toSvgLabelCenterRounded(chip.points, labelCenterViewport);
          const chipLabel =
            showDieLabel && isSelected && selectedDieCode
              ? parseSelectedDieCode(chip.label, selectedDieCode)
              : String(chip.label);
          const chipSwatch = buildWaferSwatch(chipSeed || `${activeMode}-wafer`, activeMode);

          return (
            <g key={chip.id}>
              <polygon
                points={toSvgPointsRounded(chip.points, viewportForRender)}
                fill={isSelected ? chipSwatch.fillActive : chipSwatch.fill}
                stroke={isSelected ? chipSwatch.strokeActive : chipSwatch.stroke}
                strokeWidth={isSelected ? 1.7 : 1}
              />
              {showDieLabel ? (
                <text
                  x={formatSvgCoordinate(chipCenter.x)}
                  y={formatSvgCoordinate(chipCenter.y + 0.8)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isSelected ? chipSwatch.textActive : chipSwatch.text}
                  fontSize={isSelected ? 8.8 : 8}
                  fontFamily="Arial, Helvetica, sans-serif"
                  fontWeight={isSelected ? 700 : 600}
                >
                  {chipLabel}
                </text>
              ) : null}
              {requestMode === "post-dice" ? renderChipOverlay(chip, viewportForRender, isSelected) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
