"use client";

import { useMemo, type FC } from "react";
import {
  type WaferChipPiece,
  type WaferMode,
  type WaferPoint,
  type WaferViewport,
  buildDieOverlayRectsMm,
  buildSvgViewport,
  buildWaferPieces,
  overlayRectMmToSvg,
  toSvgPoints,
  DEFAULT_WAFER_CUT_RECIPE
} from "@/features/wafers/geometry";

type WaferModeHint = WaferMode;

type WaferGeometryPreviewProps = {
  modeKeyword?: string;
  selectedLabel?: number;
  selectedDieCode?: string;
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

const WAFER_DIAMETER_MM = 100;
const WAFER_SEGMENTS = 96;

const PALETTE = {
  pre: {
    chipFill: "#ffffff",
    chipStroke: "#9aa49a",
    chipFillActive: "#e9f0e3",
    chipStrokeActive: "#5f7b56"
  },
  post: {
    chipFill: "#f4f7f1",
    chipStroke: "#8d9a8c",
    chipFillActive: "#e3ecd9",
    chipStrokeActive: "#557451"
  }
};

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

      if (candidate.includes(token) && candidate.length > 3) {
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

function buildSyntheticWaferOutline(
  diameterMm = WAFER_DIAMETER_MM,
  segments = WAFER_SEGMENTS
): WaferPoint[] {
  const radius = diameterMm / 2;
  const pointCount = Math.max(24, Math.round(segments));
  const step = (Math.PI * 2) / pointCount;

  return Array.from({ length: pointCount }, (_, index) => {
    const angle = index * step;

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

function toSvgLabelCenter(points: WaferPoint[], viewport: WaferViewport) {
  const centroid = computeCentroid(points);

  return {
    x: centroid.x - viewport.centerX + viewport.halfSpan,
    y: viewport.halfSpan - (centroid.y - viewport.centerY)
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
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
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
  showOnlySelectedDie = false,
  className = "",
  dimmed = false
}) => {
  const mode = inferModeFromKeyword(modeKeyword);
  const parsedDieCode = parseDieCode(selectedDieCode);
  const palette = PALETTE[mode === "pre-dice" ? "pre" : "post"];
  const waferPoints = useMemo(() => buildSyntheticWaferOutline(), []);
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
        viewBox={`0 0 ${viewportForRender.halfSpan * 2} ${viewportForRender.halfSpan * 2}`}
        role="img"
        aria-label="Wafer keyword preview"
      >
        <defs>
          {visibleChips.map((chip) => (
            <clipPath key={`${chip.id}-clip`} id={`wafer-preview-chip-clip-${chip.id}`}>
              <polygon points={toSvgPoints(chip.points, viewportForRender)} />
            </clipPath>
          ))}
        </defs>

        {!displayOnlyFocused ? (
          <ellipse
            cx={viewport.halfSpan}
            cy={viewport.halfSpan}
            rx={WAFER_DIAMETER_MM / 2}
            ry={WAFER_DIAMETER_MM / 2}
            fill="#f4f7f3"
            stroke="#b7c1b5"
            strokeWidth={2}
          />
        ) : null}

        {visibleChips.map((chip) => {
          const isSelected = chip.label === focusedLabel;
          const chipCenter = toSvgLabelCenter(chip.points, labelCenterViewport);
          const chipLabel = isSelected && selectedDieCode ? parseSelectedDieCode(chip.label, selectedDieCode) : String(chip.label);

          return (
            <g key={chip.id}>
              <polygon
                points={toSvgPoints(chip.points, viewportForRender)}
                fill={isSelected ? palette.chipFillActive : palette.chipFill}
                stroke={isSelected ? palette.chipStrokeActive : palette.chipStroke}
                strokeWidth={isSelected ? 1.7 : 1}
              />
              <text
                x={chipCenter.x}
                y={chipCenter.y + 0.8}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={isSelected ? "#3f593b" : "#58645a"}
                fontSize={isSelected ? 8.8 : 8}
                fontFamily="Arial, Helvetica, sans-serif"
                fontWeight={isSelected ? 700 : 600}
              >
                {chipLabel}
              </text>
              {mode === "post-dice" ? renderChipOverlay(chip, viewportForRender, isSelected) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
