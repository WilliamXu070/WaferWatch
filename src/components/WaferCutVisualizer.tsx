"use client";

import { type KeyboardEvent, type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DieInspectionMap } from "@/components/DieInspectionMap";
import {
  listDieInspectionsForDie,
  type DieInspectionRecord
} from "@/features/inspections/actions";
import { updateWaferDiePolingParameter } from "@/features/wafers/actions";

type Point = {
  x: number;
  y: number;
};

type ParsedPolygon = {
  id: string;
  points: Point[];
};

type WaferMode = "pre-dice" | "post-dice";

type DieStatus =
  | "clean"
  | "post_elb"
  | "post_pad"
  | "pl2"
  | "post_poling"
  | "post_inspection";

type ChipPiece = {
  id: string;
  label: number;
  points: Point[];
  area: number;
  centroid: Point;
};

type DieStructure = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke?: string;
  fill?: string;
};

type DieStructureRectMm = {
  id: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
};

type DieGridRowDirection = "top-to-bottom" | "bottom-to-top";

type DieStructureGridTemplateInInches = {
  columns: number;
  rows: number;
  rectWidthIn: number;
  rectHeightIn: number;
  gapXIn?: number;
  gapYIn?: number;
  insetIn?: number;
  clusterSpanFraction?: number;
  rowDirection?: DieGridRowDirection;
};

type SvgViewport = {
  centerX: number;
  centerY: number;
  halfSpan: number;
};

const VISIBLE_POLING_PARAMETER_FIELD_KEYS = [
  "voltage",
  "width",
  "pulseCount",
  "postPulseVoltage",
  "postPulseWidth"
] as const;
const LEGACY_POLING_PARAMETER_FIELD_KEYS = ["peakVoltage", "pulseDuration", "description"] as const;
const DIE_POLING_PARAMETER_FIELD_KEYS = [
  ...VISIBLE_POLING_PARAMETER_FIELD_KEYS,
  ...LEGACY_POLING_PARAMETER_FIELD_KEYS
] as const;

type VisiblePolingParameterField = typeof VISIBLE_POLING_PARAMETER_FIELD_KEYS[number];
type DiePolingParameterField = typeof DIE_POLING_PARAMETER_FIELD_KEYS[number];

type DiePolingCellValues = Partial<Record<DiePolingParameterField, string>>;

type DiePolingRows = Record<string, Record<string, DiePolingCellValues>>;

export type WaferVisualizerSample = {
  id: string;
  waferId?: string;
  projectId?: string;
  name: string;
  stateName?: string | null;
  statusLabel?: string | null;
  assignmentLabel?: string | null;
  nextStepName?: string | null;
  currentHandlerName?: string | null;
  dieDescriptions?: Record<string, string>;
  diePolingParameters?: Record<string, DiePolingRows>;
};

type WaferCutVisualizerProps = {
  waferStateName?: string | null;
  wafers?: WaferVisualizerSample[];
};

type WaferOverviewTileLayout = {
  wafer: WaferVisualizerSample;
  index: number;
  tileX: number;
  tileY: number;
  tileScale: number;
  tileViewport: SvgViewport;
  tileMode: WaferMode;
  tileChips: ChipPiece[];
  clipPrefix: string;
};

const GDS_ASSET_PATH = "/wafer-assets/wafer_4in_100mm_bottom_primary_flat_only.gds";
const TARGET_WAFER_DIAMETER_MM = 100;
const TARGET_HALF_DIAMETER_MM = TARGET_WAFER_DIAMETER_MM / 2;
const HORIZONTAL_CUT_STEP_MM = 25.4;
const VERTICAL_OFFSET_MM = 38.1;
const MM_PER_INCH = 25.4;

const CHIP_COUNT = 8;
const MIN_CHIP_AREA_MM2 = 5;
const SVG_PADDING_MM = 20;
const POST_DICE_STATUS_SEQUENCE: DieStatus[] = [
  "clean",
  "post_elb",
  "post_pad",
  "pl2",
  "post_poling",
  "post_inspection"
];
const POST_ELB_GRID_DEFAULT_INCHES: DieStructureGridTemplateInInches = {
  columns: 3,
  rows: 4,
  rectWidthIn: 1.5,
  rectHeightIn: 1,
  gapXIn: 0.22,
  gapYIn: 0.20,
  insetIn: 0,
  clusterSpanFraction: 1,
  rowDirection: "top-to-bottom"
};
const POST_ELB_CLUSTER_SPAN_FRACTION = 1;
const WAFER_OVERVIEW_TILE_SIZE = 240;
const WAFER_OVERVIEW_TILE_GAP = 30;
const WAFER_OVERVIEW_LABEL_HEIGHT = 42;
const WAFER_REUSE_PREFIX = "V";
const WAFER_REUSE_CYCLE = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POLING_MATRIX_COLUMN_COUNT = 15;
const POLING_PARAMETER_FIELDS: Array<{
  key: VisiblePolingParameterField;
  label: string;
  legacyKey?: DiePolingParameterField;
}> = [
  { key: "voltage", label: "Voltage (mV)", legacyKey: "peakVoltage" },
  { key: "width", label: "Width (ms)", legacyKey: "pulseDuration" },
  { key: "pulseCount", label: "# of Pulses" },
  { key: "postPulseVoltage", label: "post-pulse voltage" },
  { key: "postPulseWidth", label: "post-pulse width" }
];
const POLING_ROW_HUES = [202, 190, 172, 154, 218, 32, 284, 122];
const WAFER_FAMILY_ORDER = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "zeta",
  "eta",
  "theta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "omicron",
  "pi",
  "rho",
  "sigma",
  "tau",
  "upsilon",
  "phi",
  "chi",
  "psi",
  "omega"
];

const DIE_POST_ELB_LAYOUTS_BY_LABEL: Record<number, DieStructureGridTemplateInInches> = {
  1: POST_ELB_GRID_DEFAULT_INCHES,
  2: POST_ELB_GRID_DEFAULT_INCHES,
  3: POST_ELB_GRID_DEFAULT_INCHES,
  4: POST_ELB_GRID_DEFAULT_INCHES,
  5: POST_ELB_GRID_DEFAULT_INCHES,
  6: POST_ELB_GRID_DEFAULT_INCHES,
  7: POST_ELB_GRID_DEFAULT_INCHES,
  8: POST_ELB_GRID_DEFAULT_INCHES
};
const ELECTRODE_PATTERN_ID = "wafer-electrode-pattern";

const GDS_RECORD = {
  BOUNDARY: 0x08,
  XY: 0x10,
  ENDEL: 0x11,
  ENDSTR: 0x07,
  ENDLIB: 0x04
} as const;

function parseGdsPolygons(buffer: ArrayBuffer): ParsedPolygon[] {
  const view = new DataView(buffer);
  const len = view.byteLength;
  let offset = 0;

  let activePoints: Point[] | null = null;
  const polygons: ParsedPolygon[] = [];

  const finalizeBoundary = () => {
    if (!activePoints || activePoints.length < 3) {
      activePoints = null;
      return;
    }

    if (
      activePoints.length > 2 &&
      activePoints[0].x === activePoints[activePoints.length - 1].x &&
      activePoints[0].y === activePoints[activePoints.length - 1].y
    ) {
      activePoints.pop();
    }

    if (activePoints.length >= 3) {
      polygons.push({
        id: `${polygons.length + 1}`,
        points: [...activePoints]
      });
    }

    activePoints = null;
  };

  while (offset + 4 <= len) {
    const recordLen = view.getUint16(offset, false);
    if (recordLen < 4 || offset + recordLen > len) {
      break;
    }

    const recordType = view.getUint8(offset + 2);
    const recordDataType = view.getInt8(offset + 3);
    const dataStart = offset + 4;
    const dataLen = recordLen - 4;

    if (recordType === GDS_RECORD.BOUNDARY) {
      finalizeBoundary();
      activePoints = [];
    } else if (recordType === GDS_RECORD.XY && activePoints) {
      if (recordDataType === 3 && dataLen > 0 && dataLen % 8 === 0) {
        for (let index = 0; index < dataLen; index += 8) {
          const x = view.getInt32(dataStart + index, false);
          const y = view.getInt32(dataStart + index + 4, false);
          activePoints.push({ x, y });
        }
      }
    } else if (
      recordType === GDS_RECORD.ENDEL ||
      recordType === GDS_RECORD.ENDSTR ||
      recordType === GDS_RECORD.ENDLIB
    ) {
      finalizeBoundary();
    } else {
      void recordDataType;
    }

    offset += recordLen;
  }

  finalizeBoundary();
  return polygons;
}

function polygonArea(points: Point[]) {
  let sum = 0;

  for (let index = 0; index < points.length; index++) {
    const next = (index + 1) % points.length;
    sum += points[index].x * points[next].y;
    sum -= points[next].x * points[index].y;
  }

  return Math.abs(sum) / 2;
}

function polygonCentroid(points: Point[]) {
  let signedArea = 0;
  let cx = 0;
  let cy = 0;

  for (let index = 0; index < points.length; index++) {
    const next = (index + 1) % points.length;
    const cross = points[index].x * points[next].y - points[next].x * points[index].y;

    signedArea += cross;
    cx += (points[index].x + points[next].x) * cross;
    cy += (points[index].y + points[next].y) * cross;
  }

  if (!signedArea) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      x: (Math.max(...xs) + Math.min(...xs)) / 2,
      y: (Math.max(...ys) + Math.min(...ys)) / 2
    };
  }

  const divisor = 6 * signedArea;
  return {
    x: cx / divisor,
    y: cy / divisor
  };
}

function cleanPolygon(points: Point[]): Point[] | null {
  if (points.length < 3) {
    return null;
  }

  const output: Point[] = [];
  for (const point of points) {
    const previous = output.at(-1);
    if (!previous || previous.x !== point.x || previous.y !== point.y) {
      output.push(point);
    }
  }

  if (output.length > 1) {
    const first = output[0];
    const last = output.at(-1);

    if (last && first.x === last.x && first.y === last.y) {
      output.pop();
    }
  }

  return output.length >= 3 ? output : null;
}

function splitPolygonByAxis(points: Point[], axis: "x" | "y", cut: number) {
  const negativeSide: Point[] = [];
  const positiveSide: Point[] = [];

  for (let index = 0; index < points.length; index++) {
    const start = points[index];
    const end = points[(index + 1) % points.length];

    const startCoord = axis === "x" ? start.x : start.y;
    const endCoord = axis === "x" ? end.x : end.y;
    const startDelta = startCoord - cut;
    const endDelta = endCoord - cut;

    if (startDelta <= 0) {
      negativeSide.push(start);
    }

    if (startDelta >= 0) {
      positiveSide.push(start);
    }

    const crosses =
      (startDelta < 0 && endDelta > 0) ||
      (startDelta > 0 && endDelta < 0);

    if (crosses) {
      const t = startDelta / (startDelta - endDelta);
      const intersection: Point = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t
      };

      negativeSide.push(intersection);
      positiveSide.push(intersection);
    }
  }

  return {
    negative: cleanPolygon(negativeSide),
    positive: cleanPolygon(positiveSide)
  };
}

function buildLinearCuts(halfSpan: number, step: number): number[] {
  const rawCuts: number[] = [];

  for (let value = -halfSpan + step; value < halfSpan - 0.000001; value += step) {
    rawCuts.push(value);
  }

  return rawCuts;
}

function getWaferModeFromState(waferStateName?: string | null): WaferMode {
  const normalized = (waferStateName ?? "").toLowerCase();

  if (!normalized) {
    return "pre-dice";
  }

  if (normalized.includes("post") || normalized.includes("pad") || normalized.includes("poling")) {
    return "post-dice";
  }

  if (normalized.includes("pl2") || normalized.includes("inspection") || normalized.includes("elb")) {
    return "post-dice";
  }

  if (normalized.includes("clean") || normalized.includes("pre")) {
    return "pre-dice";
  }

  return "post-dice";
}

function getWaferFamilyPrefix(waferName: string, fallbackIndex: number) {
  const normalized = (waferName ?? "").toLowerCase();
  const familyIndex = WAFER_FAMILY_ORDER.findIndex((name) => normalized.includes(name));

  if (familyIndex >= 0) {
    return String.fromCharCode(65 + familyIndex);
  }

  const tokenMatch = normalized.match(/[a-z]/);
  if (tokenMatch) {
    return tokenMatch[0].toUpperCase();
  }

  return String.fromCharCode(65 + (fallbackIndex % 26));
}

function getDieStatusForLabelAndMode(label: number, mode: WaferMode): DieStatus {
  if (mode === "pre-dice") {
    return "clean";
  }

  return POST_DICE_STATUS_SEQUENCE[(label - 1) % POST_DICE_STATUS_SEQUENCE.length];
}

function buildWaferPieces(waferPoints: Point[], mode: WaferMode): ChipPiece[] {
  if (mode === "pre-dice") {
    const area = polygonArea(waferPoints);
    if (area <= MIN_CHIP_AREA_MM2) {
      return [];
    }

    return [
      {
        id: "1",
        label: 1,
        points: waferPoints,
        area,
        centroid: polygonCentroid(waferPoints)
      }
    ];
  }

  return buildChipPieces(waferPoints);
}

function deriveWaferGeometry(polygons: ParsedPolygon[]): ParsedPolygon | null {
  if (polygons.length === 0) {
    return null;
  }

  const withArea = polygons
    .map((polygon) => ({ polygon, area: polygonArea(polygon.points) }))
    .filter((item) => item.area > MIN_CHIP_AREA_MM2)
    .sort((a, b) => b.area - a.area);

  return withArea.length > 0 ? withArea[0].polygon : polygons[0] ?? null;
}

function normalizeToMillimeters(polygons: ParsedPolygon[]): ParsedPolygon[] {
  if (polygons.length === 0) {
    return [];
  }

  const allX = polygons.flatMap((polygon) => polygon.points.map((point) => point.x));
  const allY = polygons.flatMap((polygon) => polygon.points.map((point) => point.y));

  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  const spanX = Math.max(maxX - minX, 1);
  const scale = TARGET_WAFER_DIAMETER_MM / spanX;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return polygons.map((polygon) => ({
    ...polygon,
    points: polygon.points.map((point) => ({
      x: (point.x - centerX) * scale,
      y: (point.y - centerY) * scale
    }))
  }));
}

function buildChipPieces(waferPoints: Point[]): ChipPiece[] {
  const verticalCuts = [
    -VERTICAL_OFFSET_MM,
    0,
    VERTICAL_OFFSET_MM
  ];

  const horizontalCuts = buildLinearCuts(TARGET_HALF_DIAMETER_MM, HORIZONTAL_CUT_STEP_MM);

  let chunks: Point[][] = [waferPoints];

  for (const cut of horizontalCuts) {
    chunks = chunks
      .flatMap((chunk) => {
        const split = splitPolygonByAxis(chunk, "y", cut);
        return [split.negative, split.positive];
      })
      .filter((chunk): chunk is Point[] => Boolean(chunk));
  }

  for (const cut of verticalCuts) {
    chunks = chunks
      .flatMap((chunk) => {
        const split = splitPolygonByAxis(chunk, "x", cut);
        return [split.negative, split.positive];
      })
      .filter((chunk): chunk is Point[] => Boolean(chunk));
  }

  const filteredPieces = chunks
    .map((chunk, index) => {
      const area = polygonArea(chunk);
      return {
        id: `piece-${index}`,
        points: chunk,
        area,
        centroid: polygonCentroid(chunk),
        label: 0
      };
    })
    .filter((piece) => piece.area > MIN_CHIP_AREA_MM2)
    .sort((a, b) => b.area - a.area)
    .slice(0, CHIP_COUNT)
    .sort((a, b) => b.centroid.y - a.centroid.y);

  if (filteredPieces.length === 0) {
    return [];
  }

  const sortedByY = [...filteredPieces].sort((a, b) => b.centroid.y - a.centroid.y);
  const yGaps = sortedByY.slice(1).map((piece, index) => {
    const previous = sortedByY[index];
    return previous.centroid.y - piece.centroid.y;
  });

  let rows: ChipPiece[][] = [];
  if (yGaps.length === 0) {
    rows = [sortedByY];
  } else {
    let smallGap = yGaps.reduce((acc, value) => Math.min(acc, value), yGaps[0]);
    let largeGap = yGaps.reduce((acc, value) => Math.max(acc, value), yGaps[0]);

    for (let pass = 0; pass < 3; pass++) {
      const smallGroup: number[] = [];
      const largeGroup: number[] = [];
      const splitAt = (smallGap + largeGap) / 2;

      for (const gap of yGaps) {
        if (gap <= splitAt) {
          smallGroup.push(gap);
        } else {
          largeGroup.push(gap);
        }
      }

      const smallSum = smallGroup.reduce((acc, value) => acc + value, 0);
      const largeSum = largeGroup.reduce((acc, value) => acc + value, 0);
      smallGap = smallGroup.length > 0 ? smallSum / smallGroup.length : smallGap;
      largeGap = largeGroup.length > 0 ? largeSum / largeGroup.length : largeGap;
    }

    const rowSplitAt = (smallGap + largeGap) / 2;
    rows = [[]];

    for (const piece of sortedByY) {
      if (rows.length === 0) {
        rows.push([]);
      }

      const currentRow = rows[rows.length - 1];
      if (
        currentRow.length > 0 &&
        piece.centroid.y < currentRow[currentRow.length - 1].centroid.y - rowSplitAt
      ) {
        rows.push([]);
      }

      rows[rows.length - 1].push(piece);
    }
  }

  let nextLabel = 1;
  return rows
    .flatMap((row) => {
      row.sort((a, b) => a.centroid.x - b.centroid.x);

      return row.map((piece) => ({
        ...piece,
        id: `${nextLabel}`,
        label: nextLabel++
      }));
    })
    .slice(0, CHIP_COUNT);
}

function buildSvgViewport(points: Point[], padding = SVG_PADDING_MM): SvgViewport {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const halfSpan = Math.max(maxX - minX, maxY - minY) / 2 + padding;

  return {
    centerX,
    centerY,
    halfSpan
  };
}

function polygonBoundsCenter(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2
  };
}

function polygonBounds(points: Point[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getHorizontalPolygonIntervalAtY(points: Point[], y: number) {
  const intersections: number[] = [];
  const epsilon = 1e-9;

  for (let index = 0; index < points.length; index++) {
    const start = points[index];
    const end = points[(index + 1) % points.length];

    if (Math.abs(start.y - end.y) < epsilon) {
      if (Math.abs(y - start.y) < epsilon) {
        intersections.push(start.x, end.x);
      }
      continue;
    }

    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const withinEdge = y >= minY - epsilon && y <= maxY + epsilon;

    if (!withinEdge) {
      continue;
    }

    const t = (y - start.y) / (end.y - start.y);
    if (t >= -epsilon && t <= 1 + epsilon) {
      intersections.push(start.x + (end.x - start.x) * t);
    }
  }

  if (intersections.length < 2) {
    return null;
  }

  return {
    minX: Math.min(...intersections),
    maxX: Math.max(...intersections)
  };
}

function getDieLabelPlacement(points: Point[], viewport: SvgViewport, useCompactPlacement: boolean) {
  const bounds = polygonBounds(points);
  const shortestSpan = Math.max(1, Math.min(bounds.width, bounds.height));
  const fontSize = useCompactPlacement
    ? clampNumber(shortestSpan * 0.1, 2, 4)
    : clampNumber(shortestSpan * 0.2, 3.5, 8);
  const inset = Math.max(fontSize * 0.9, 1.2);

  if (!useCompactPlacement) {
    const centerPoint = toSvgPoint(polygonBoundsCenter(points), viewport);
    return {
      x: centerPoint.x,
      y: centerPoint.y,
      fontSize,
      textAnchor: "middle" as const,
      dominantBaseline: "middle" as const
    };
  }

  const desiredY = bounds.maxY - inset;
  const interval = getHorizontalPolygonIntervalAtY(points, desiredY);
  const fallbackPoint = polygonCentroid(points);
  const labelPoint =
    interval && interval.maxX - interval.minX > inset * 2
      ? {
          x: interval.minX + inset,
          y: desiredY
        }
      : fallbackPoint;
  const svgPoint = toSvgPoint(labelPoint, viewport);

  return {
    x: svgPoint.x,
    y: svgPoint.y,
    fontSize,
    textAnchor: "start" as const,
    dominantBaseline: "hanging" as const
  };
}

function sanitizeGridAxisCount(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 0;
}

function sanitizeMm(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function buildCenteredGridRectsForDieMm(points: Point[], label: number): DieStructureRectMm[] {
  const bounds = polygonBounds(points);
  const template = DIE_POST_ELB_LAYOUTS_BY_LABEL[label];

  if (!template) {
    return [];
  }

  const columns = sanitizeGridAxisCount(template.columns);
  const rows = sanitizeGridAxisCount(template.rows);
  const rawRectWidth = sanitizeMm(template.rectWidthIn * MM_PER_INCH);
  const rawRectHeight = sanitizeMm(template.rectHeightIn * MM_PER_INCH);
  const rawGapX = sanitizeMm((template.gapXIn ?? template.rectWidthIn * 0.2) * MM_PER_INCH);
  const rawGapY = sanitizeMm((template.gapYIn ?? template.rectHeightIn * 0.2) * MM_PER_INCH);
  const inset = sanitizeMm((template.insetIn ?? 0.1) * MM_PER_INCH);
  const clampSpanFraction = Math.min(
    1,
    Math.max(0.05, template.clusterSpanFraction ?? POST_ELB_CLUSTER_SPAN_FRACTION)
  );

  if (columns === 0 || rows === 0 || rawRectWidth === 0 || rawRectHeight === 0) {
    return [];
  }

  const gapXToRectWidth = Math.min(1, rawGapX / rawRectWidth);
  const gapYToRectHeight = Math.min(1, rawGapY / rawRectHeight);

  const innerWidth = Math.max(bounds.width - 2 * inset, 1);
  const innerHeight = Math.max(bounds.height - 2 * inset, 1);
  const spanWidth = Math.max(1, innerWidth * clampSpanFraction);
  const spanHeight = Math.max(1, innerHeight * clampSpanFraction);

  // Equal-gutter die-local layout in wafer-space mm:
  // left chip edge gap = internal column gap = right chip edge gap,
  // top chip edge gap = internal row gap = bottom chip edge gap.
  // The grid fills the chip bounding span and is clipped to the chip polygon
  // during SVG rendering so curved wafer-edge dies do not show spillover.
  const rectWidth = spanWidth / (columns + (columns + 1) * gapXToRectWidth);
  const rectHeight = spanHeight / (rows + (rows + 1) * gapYToRectHeight);
  const gapX = rectWidth * gapXToRectWidth;
  const gapY = rectHeight * gapYToRectHeight;

  const startX = bounds.minX + inset + (innerWidth - spanWidth) / 2 + gapX;
  const startY = bounds.minY + inset + (innerHeight - spanHeight) / 2 + gapY;
  const rowDirection = template.rowDirection ?? "top-to-bottom";

  const structures: DieStructureRectMm[] = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const waferRow = rowDirection === "top-to-bottom" ? rows - 1 - row : row;
      const xMin = startX + column * (rectWidth + gapX);
      const yMin = startY + waferRow * (rectHeight + gapY);
      const xMax = xMin + rectWidth;
      const yMax = yMin + rectHeight;

      structures.push({
        id: `die-${label}-r-${row + 1}-c-${column + 1}`,
        xMin,
        yMin,
        xMax,
        yMax
      });
    }
  }

  return structures;
}

function rectMmToSvg(rect: DieStructureRectMm, viewport: SvgViewport): DieStructure {
  const startPoint = toSvgPoint({ x: rect.xMin, y: rect.yMin }, viewport);
  const endPoint = toSvgPoint({ x: rect.xMax, y: rect.yMax }, viewport);
  const cellMatch = rect.id.match(/r-(\d+)-c-(\d+)$/);
  const rowIndex = cellMatch ? Number(cellMatch[1]) - 1 : 0;
  const columnIndex = cellMatch ? Number(cellMatch[2]) - 1 : 0;
  const totalColumns = POST_ELB_GRID_DEFAULT_INCHES.columns;
  const hue = POLING_ROW_HUES[rowIndex % POLING_ROW_HUES.length];
  const lightnessStep = totalColumns > 1 ? columnIndex / (totalColumns - 1) : 0;
  const fillLightness = 78 + lightnessStep * 10;

  return {
    id: rect.id,
    x: Math.min(startPoint.x, endPoint.x),
    y: Math.min(startPoint.y, endPoint.y),
    width: Math.abs(endPoint.x - startPoint.x),
    height: Math.abs(endPoint.y - startPoint.y),
    stroke: `hsl(${hue} 44% 28%)`,
    fill: `hsl(${hue} 58% ${fillLightness}%)`
  };
}

function buildCenteredGridRectsForDie(
  points: Point[],
  viewport: SvgViewport,
  label: number
) {
  return buildCenteredGridRectsForDieMm(points, label).map((rect) => rectMmToSvg(rect, viewport));
}

function getModeStructuresForDie(points: Point[], status: DieStatus, label: number, viewport: SvgViewport) {
  if (status !== "post_elb") {
    return [];
  }

  return buildCenteredGridRectsForDie(points, viewport, label);
}

function getPolingCellKey(
  waferId: string,
  dieCode: string,
  row: number,
  column: number,
  field: DiePolingParameterField
) {
  return `${waferId}:${dieCode}:R${row}:C${column}:${field}`;
}

function isDiePolingParameterField(value: string): value is DiePolingParameterField {
  return DIE_POLING_PARAMETER_FIELD_KEYS.some((field) => field === value);
}

function parsePolingCellKey(key: string) {
  const match = key.match(
    /^([^:]+):([^:]+):R(\d+):C(\d+):([^:]+)$/
  );

  if (!match || !isDiePolingParameterField(match[5])) {
    return null;
  }

  return {
    waferId: match[1],
    dieCode: match[2],
    row: Number(match[3]),
    column: Number(match[4]),
    field: match[5]
  };
}

function fitPolingTextareaHeight(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function toSvgPoints(points: Point[], viewport: SvgViewport) {
  return points
    .map(
      (point) =>
        `${point.x - viewport.centerX + viewport.halfSpan},${viewport.halfSpan - (point.y - viewport.centerY)}`
    )
    .join(" ");
}

function toSvgPoint(point: Point, viewport: SvgViewport) {
  return {
    x: point.x - viewport.centerX + viewport.halfSpan,
    y: viewport.halfSpan - (point.y - viewport.centerY)
  };
}

export function WaferCutVisualizer({ waferStateName, wafers = [] }: WaferCutVisualizerProps) {
  const [rawPolygons, setRawPolygons] = useState<ParsedPolygon[]>([]);
  const [selectedWaferId, setSelectedWaferId] = useState<string | null>(null);
  const [selectedChipId, setSelectedChipId] = useState<string | null>(null);
  const [isInspectionPanelOpen, setIsInspectionPanelOpen] = useState(false);
  const [selectedInspectionCell, setSelectedInspectionCell] = useState<{ row: number; column: number } | null>(null);
  const [inspectionCellState, setInspectionCellState] = useState<{
    scope: string;
    cells: Record<string, boolean>;
    inspectionsByCell: Record<string, DieInspectionRecord[]>;
  }>({ scope: "", cells: {}, inspectionsByCell: {} });
  const [polingValues, setPolingValues] = useState<Record<string, string>>({});
  const [savedPolingOverrides, setSavedPolingOverrides] = useState<Record<string, string>>({});
  const [, setPolingSaveStatus] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const hasWaferOverview = wafers.length > 0;
  const selectedWafer = hasWaferOverview
    ? wafers.find((wafer) => wafer.id === selectedWaferId) ?? null
    : null;
  const isWaferOverviewView = hasWaferOverview && !selectedWafer;
  const activeWaferStateName = selectedWafer?.stateName ?? waferStateName;
  const activeWaferName = selectedWafer?.name ?? "Wafer";
  const waferMode = getWaferModeFromState(activeWaferStateName);
  const isPostDiceMode = waferMode === "post-dice";
  const waferFamilyPrefixById = useMemo(
    () =>
      wafers.reduce<Record<string, string>>((acc, wafer, index) => {
        acc[wafer.id] = getWaferFamilyPrefix(wafer.name, index);
        return acc;
      }, {}),
    [wafers]
  );
  const databasePolingByKey = useMemo(() => {
    const parameters: Record<string, string> = {};

    for (const wafer of wafers) {
      if (!wafer.waferId) {
        continue;
      }

      for (const [dieCode, rows] of Object.entries(wafer.diePolingParameters ?? {})) {
        for (const [rowKey, columns] of Object.entries(rows)) {
          const row = Number(rowKey.replace(/^R/i, ""));
          if (!Number.isFinite(row)) {
            continue;
          }

          for (const [columnKey, fields] of Object.entries(columns)) {
            const column = Number(columnKey.replace(/^C/i, ""));
            if (!Number.isFinite(column)) {
              continue;
            }

            for (const fieldKey of DIE_POLING_PARAMETER_FIELD_KEYS) {
              const value = fields[fieldKey];
              if (typeof value === "string") {
                parameters[getPolingCellKey(wafer.waferId, dieCode, row, column, fieldKey)] = value;
              }
            }
          }
        }
      }
    }

    return parameters;
  }, [wafers]);

  useEffect(() => {
    let isStale = false;

    const loadGds = async () => {
      try {
        const response = await fetch(GDS_ASSET_PATH);
        if (!response.ok) {
          throw new Error("Unable to load local GDS source.");
        }

        const buffer = await response.arrayBuffer();
        const parsed = parseGdsPolygons(buffer);
        if (isStale) {
          return;
        }

        if (parsed.length === 0) {
          setRawPolygons([]);
          return;
        }

        setRawPolygons(parsed);
      } catch {
        if (!isStale) {
          setRawPolygons([]);
        }
      }
    };

    void loadGds();

    return () => {
      isStale = true;
    };
  }, []);

  const normalizedPolygons = useMemo(() => normalizeToMillimeters(rawPolygons), [rawPolygons]);
  const waferOutline = useMemo(() => deriveWaferGeometry(normalizedPolygons), [normalizedPolygons]);
  const waferViewport = useMemo(() => (waferOutline ? buildSvgViewport(waferOutline.points) : null), [waferOutline]);
  const chipPieces = useMemo(() => {
    if (!waferOutline || isWaferOverviewView) {
      return [];
    }

    return buildWaferPieces(waferOutline.points, waferMode);
  }, [isWaferOverviewView, waferMode, waferOutline]);

  const svgViewport = useMemo(() => (waferOutline ? buildSvgViewport(waferOutline.points) : null), [waferOutline]);
  const overviewColumns = 3;
  const overviewRows = Math.max(2, Math.ceil(wafers.length / overviewColumns));
  const overviewWidth =
    overviewColumns * WAFER_OVERVIEW_TILE_SIZE + Math.max(0, overviewColumns - 1) * WAFER_OVERVIEW_TILE_GAP;
  const overviewHeight =
    overviewRows * (WAFER_OVERVIEW_TILE_SIZE + WAFER_OVERVIEW_LABEL_HEIGHT) +
    Math.max(0, overviewRows - 1) * WAFER_OVERVIEW_TILE_GAP;
  const overviewTileLayouts = useMemo(() => {
    if (!waferOutline || !waferViewport) {
      return [] as WaferOverviewTileLayout[];
    }

    return wafers.map((wafer, index) => {
      const column = index % overviewColumns;
      const row = Math.floor(index / overviewColumns);
      const tileX = column * (WAFER_OVERVIEW_TILE_SIZE + WAFER_OVERVIEW_TILE_GAP);
      const tileY = row * (WAFER_OVERVIEW_TILE_SIZE + WAFER_OVERVIEW_TILE_GAP + WAFER_OVERVIEW_LABEL_HEIGHT);
      const tileScale = WAFER_OVERVIEW_TILE_SIZE / (waferViewport.halfSpan * 2);
      const tileMode = getWaferModeFromState(wafer.stateName);
      const tileChips = buildWaferPieces(waferOutline.points, tileMode);

      return {
        wafer,
        index,
        tileX,
        tileY,
        tileScale,
        tileViewport: waferViewport,
        tileMode,
        tileChips,
        clipPrefix: `overview-${wafer.id}-`
      };
    });
  }, [waferOutline, waferViewport, overviewColumns, wafers]);

  const overviewClipDefs = useMemo(() => {
    return overviewTileLayouts.flatMap((layout) =>
      layout.tileChips.map((chip) => ({
        id: `${layout.clipPrefix}wafer-chip-clip-${chip.id}`,
        points: toSvgPoints(chip.points, layout.tileViewport),
        key: `clip-${layout.clipPrefix}${chip.id}`
      }))
    );
  }, [overviewTileLayouts]);

  const activeChipId =
    !isWaferOverviewView &&
    isPostDiceMode &&
    selectedChipId &&
    chipPieces.some((chip) => chip.id === selectedChipId)
      ? selectedChipId
      : null;

  const activeChip = activeChipId ? chipPieces.find((chip) => chip.id === activeChipId) ?? null : null;
  const activeChipViewport = activeChip ? buildSvgViewport(activeChip.points, 3) : null;
  const displayViewport = activeChipViewport ?? svgViewport;
  const isChipFocusView = Boolean(activeChip && activeChipViewport);
  const isWaferFocusView = hasWaferOverview && Boolean(selectedWafer) && !isChipFocusView;
  const activeWaferPrefix = selectedWafer ? waferFamilyPrefixById[selectedWafer.id] : "";
  const activeChipCode = activeChip
    ? `${activeWaferPrefix || "T"}${activeChip.label}-${WAFER_REUSE_PREFIX}${WAFER_REUSE_CYCLE}`
    : null;
  const activeChipExpandedName = activeChip
    ? `${activeWaferName} wafer, die number ${activeChip.label}, version ${WAFER_REUSE_CYCLE}`
    : null;
  const activeWaferDatabaseId = selectedWafer?.waferId;
  const activeProjectId = selectedWafer?.projectId;
  const activeChipStatus = activeChip ? getDieStatusForLabelAndMode(activeChip.label, waferMode) : null;
  const activeChipInspectionRow = selectedInspectionCell?.row ?? 1;
  const activeChipInspectionColumn = selectedInspectionCell?.column ?? 1;
  const activeInspectionHue = POLING_ROW_HUES[(activeChipInspectionRow - 1) % POLING_ROW_HUES.length];
  const activePolingTemplate =
    activeChip && activeChipStatus === "post_elb"
      ? DIE_POST_ELB_LAYOUTS_BY_LABEL[activeChip.label] ?? null
      : null;
  const activePolingCanPersist = Boolean(activeWaferDatabaseId && UUID_PATTERN.test(activeWaferDatabaseId ?? ""));
  const activeInspectionCellScope = activeWaferDatabaseId && activeChipCode
    ? `${activeWaferDatabaseId}:${activeChipCode}`
    : "";
  const activeInspectionCells =
    inspectionCellState.scope === activeInspectionCellScope ? inspectionCellState.cells : {};
  const activeInspectionRecordsByCell = useMemo(
    () =>
      inspectionCellState.scope === activeInspectionCellScope
        ? inspectionCellState.inspectionsByCell
        : {},
    [activeInspectionCellScope, inspectionCellState.inspectionsByCell, inspectionCellState.scope]
  );
  const activeInspectionCellKey = `${activeChipInspectionRow}:${activeChipInspectionColumn}`;
  const activeInspectionRecords = activeInspectionRecordsByCell[activeInspectionCellKey] ?? [];
  const activeInspectionImageUrls = useMemo(
    () =>
      Array.from(
        new Set(
          Object.values(activeInspectionRecordsByCell)
            .flat()
            .map((inspection) => inspection.imageUrl)
            .filter((imageUrl): imageUrl is string => Boolean(imageUrl))
        )
      ),
    [activeInspectionRecordsByCell]
  );

  const getPolingValue = (
    row: number,
    column: number,
    field: DiePolingParameterField
  ) => {
    if (!activeWaferDatabaseId || !activeChipCode) {
      return "";
    }

    const key = getPolingCellKey(activeWaferDatabaseId, activeChipCode, row, column, field);
    const directValue = polingValues[key] ?? savedPolingOverrides[key] ?? databasePolingByKey[key];
    if (typeof directValue === "string") {
      return directValue;
    }

    const legacyKey = POLING_PARAMETER_FIELDS.find((parameter) => parameter.key === field)?.legacyKey;
    if (!legacyKey) {
      return "";
    }

    const fallbackKey = getPolingCellKey(activeWaferDatabaseId, activeChipCode, row, column, legacyKey);
    return savedPolingOverrides[fallbackKey] ?? databasePolingByKey[fallbackKey] ?? "";
  };

  const getPersistedPolingValue = useCallback(
    (key: string) => savedPolingOverrides[key] ?? databasePolingByKey[key] ?? "",
    [databasePolingByKey, savedPolingOverrides]
  );

  const savePolingCell = useCallback(async (key: string, value: string) => {
    const parsed = parsePolingCellKey(key);
    if (!parsed || !activePolingCanPersist) {
      return;
    }

    if (value === getPersistedPolingValue(key)) {
      return;
    }

    setPolingSaveStatus((current) => ({
      ...current,
      [key]: "saving"
    }));

    const result = await updateWaferDiePolingParameter({
      waferId: parsed.waferId,
      dieCode: parsed.dieCode,
      row: parsed.row,
      column: parsed.column,
      field: parsed.field,
      value
    });

    if (result.ok) {
      setSavedPolingOverrides((current) => ({
        ...current,
        [key]: value
      }));
      setPolingSaveStatus((current) => ({
        ...current,
        [key]: "saved"
      }));
    } else {
      setPolingSaveStatus((current) => ({
        ...current,
        [key]: "error"
      }));
    }
  }, [activePolingCanPersist, getPersistedPolingValue]);

  useEffect(() => {
    if (!activeWaferDatabaseId || !activeChipCode || !activePolingCanPersist) {
      return;
    }

    const activePrefix = `${activeWaferDatabaseId}:${activeChipCode}:`;
    const dirtyEntries = Object.entries(polingValues).filter(
      ([key, value]) => key.startsWith(activePrefix) && value !== getPersistedPolingValue(key)
    );

    if (dirtyEntries.length === 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      for (const [key, value] of dirtyEntries) {
        void savePolingCell(key, value);
      }
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [
    activeChipCode,
    activePolingCanPersist,
    activeWaferDatabaseId,
    getPersistedPolingValue,
    polingValues,
    savePolingCell
  ]);

  useEffect(() => {
    if (!activeWaferDatabaseId || !activeChipCode) {
      return;
    }

    let isStale = false;
    void listDieInspectionsForDie({
      waferId: activeWaferDatabaseId,
      dieCode: activeChipCode
    }).then((result) => {
      if (isStale) {
        return;
      }

      if (result.ok) {
        const cells: Record<string, boolean> = {};
        const inspectionsByCell: Record<string, DieInspectionRecord[]> = {};

        for (const inspection of result.data) {
          const key = `${inspection.row}:${inspection.column}`;
          cells[key] = true;
          inspectionsByCell[key] = [...(inspectionsByCell[key] ?? []), inspection];
        }

        setInspectionCellState({
          scope: `${activeWaferDatabaseId}:${activeChipCode}`,
          cells,
          inspectionsByCell
        });
      }
    });

    return () => {
      isStale = true;
    };
  }, [activeChipCode, activeWaferDatabaseId]);

  useEffect(() => {
    const warmedImages = activeInspectionImageUrls.map((imageUrl) => {
      const image = new window.Image();
      image.decoding = "async";
      image.src = imageUrl;
      return image;
    });

    return () => {
      for (const image of warmedImages) {
        image.src = "";
      }
    };
  }, [activeInspectionImageUrls]);

  const handleChipSelect = (chipId: string) => {
    if (!isPostDiceMode) {
      return;
    }

    setIsInspectionPanelOpen(false);
    setSelectedInspectionCell(null);
    setSelectedChipId((current) => (current === chipId ? null : chipId));
  };

  const handleChipKeySelect = (
    event: KeyboardEvent<SVGPolygonElement>,
    chipId: string
  ) => {
    if (!isPostDiceMode) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleChipSelect(chipId);
    }
  };

  const handlePolingCellChange = (
    row: number,
    column: number,
    field: DiePolingParameterField,
    value: string
  ) => {
    if (!activeWaferDatabaseId || !activeChipCode) {
      return;
    }

    const key = getPolingCellKey(activeWaferDatabaseId, activeChipCode, row, column, field);
    setPolingValues((current) => ({
      ...current,
      [key]: value
    }));
    setPolingSaveStatus((current) => ({
      ...current,
      [key]: "idle"
    }));
  };

  const renderPolingRecipeHeader = (row: number, selectedColumn?: number) => {
    const rowCode = `R${row}`;
    const cellRange = selectedColumn
      ? `${rowCode}C${selectedColumn}`
      : `${rowCode}C1-C${POLING_MATRIX_COLUMN_COUNT}`;
    const recipeId = activeChipCode ?? `${activeWaferPrefix || "W"}${rowCode}`;
    const headerCells = [
      { label: "fabricated by", value: selectedWafer?.currentHandlerName ?? "" },
      { label: "Wafer", value: activeWaferName },
      { label: "Wafer id:", value: activeWaferDatabaseId ?? "" },
      { label: "Poling Date:", value: "" },
      { label: "M1", value: "1 mm" },
      { label: "Run", value: activeWaferPrefix || "alpha" },
      { label: "Piece", value: String(activeChip?.label ?? "") },
      { label: "Row", value: rowCode },
      { label: "Revision", value: "R1" },
      { label: "Cells", value: cellRange }
    ];

    return (
      <div className="wafer-poling-recipe-header" aria-label={`${recipeId} recipe details`}>
        <div className="wafer-poling-recipe-id">{recipeId}</div>
        <div className="wafer-poling-recipe-meta">
          {headerCells.map((cell) => (
            <div className="wafer-poling-recipe-meta-cell" key={`${cell.label}-${cell.value}`}>
              <span>{cell.label}</span>
              <strong>{cell.value}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPolingMatrix = (row: number, selectedColumn?: number) => {
    if (!activeChipCode) {
      return null;
    }

    const columns = selectedColumn
      ? [selectedColumn]
      : Array.from({ length: POLING_MATRIX_COLUMN_COUNT }, (_, columnIndex) => columnIndex + 1);
    const rowCode = `R${row}`;
    const gridStyle = {
      gridTemplateColumns: selectedColumn
        ? "116px minmax(176px, 1fr)"
        : `116px repeat(${columns.length}, minmax(86px, 1fr))`
    };

    return (
      <div className="wafer-poling-grid" style={gridStyle}>
        <div className="wafer-poling-corner">Period<br />2.5</div>
        {columns.map((column) => (
          <div
            className="wafer-poling-column-header"
            key={`poling-header-${row}-${column}`}
          >
            {rowCode}C{column}
          </div>
        ))}
        <div className="wafer-poling-row-subhead">gap 20<br />micron</div>
        {columns.map((column) => (
          <div
            className="wafer-poling-column-spacer"
            key={`poling-spacer-${row}-${column}`}
            aria-hidden="true"
          />
        ))}
        {POLING_PARAMETER_FIELDS.map((field) => (
          <div className="wafer-poling-field-row" key={`poling-${row}-${field.key}`}>
            <div className={`wafer-poling-row-label wafer-poling-row-label--${field.key}`}>
              {field.label}
            </div>
            {columns.map((column) => {
              const key = activeWaferDatabaseId && activeChipCode
                ? getPolingCellKey(activeWaferDatabaseId, activeChipCode, row, column, field.key)
                : "";
              const inputValue = getPolingValue(row, column, field.key);

              return (
                <div
                  className={`wafer-poling-cell wafer-poling-cell--${field.key}`}
                  key={`poling-cell-${row}-${column}-${field.key}`}
                >
                  <span className="sr-only">
                    {rowCode}C{column}, {field.label}
                  </span>
                  <textarea
                    className="wafer-poling-cell-editor"
                    aria-label={`${rowCode}C${column}, ${field.label}`}
                    rows={1}
                    value={inputValue}
                    onChange={(event) => {
                      handlePolingCellChange(row, column, field.key, event.target.value);
                      fitPolingTextareaHeight(event.target);
                    }}
                    onFocus={(event) => fitPolingTextareaHeight(event.target)}
                    onBlur={(event) => {
                      if (key) {
                        void savePolingCell(key, event.target.value);
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const renderActiveInspectionPolingSummary = () => {
    if (!activePolingTemplate || !activeChip || !activeChipCode || !activeWaferDatabaseId) {
      return null;
    }

    const row = activeChip.label;

    return (
      <div
        className="wafer-poling-panel wafer-inspection-poling-panel"
        aria-label={`${activeChipCode} selected chip poling parameters`}
      >
        <div className="wafer-poling-header">
          <h3>Poling parameters</h3>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setIsInspectionPanelOpen(false)}
          >
            Close
          </button>
        </div>
        <div className="wafer-poling-sheet wafer-poling-sheet--single">
          {renderPolingRecipeHeader(row, activeChipInspectionColumn)}
          {renderPolingMatrix(row, activeChipInspectionColumn)}
        </div>
      </div>
    );
  };

  const renderPolingParameterSheet = () => {
    if (!activePolingTemplate || !activeChip || !activeChipCode) {
      return null;
    }

    const row = activeChip.label;

    return (
      <section className="panel wafer-poling-panel" aria-label={`${activeChipCode} poling parameters`}>
        <div className="wafer-poling-header">
          <h3>Poling parameters</h3>
        </div>
        <div className="wafer-poling-sheet">
          {renderPolingRecipeHeader(row)}
          {renderPolingMatrix(row)}
        </div>
      </section>
    );
  };

  const renderChip = (
    chip: ChipPiece,
    viewport: SvgViewport,
    isFocusedView: boolean,
    mode = waferMode,
    clipPrefix = "",
    allowChipSelect = true
  ) => {
    const isSelected = chip.id === activeChipId;
    const chipStatus = getDieStatusForLabelAndMode(chip.label, mode);
    const chipClipPathId = `${clipPrefix}wafer-chip-clip-${chip.id}`;
    const structureRects = getModeStructuresForDie(chip.points, chipStatus, chip.label, viewport);
    const chipLabel = getDieLabelPlacement(chip.points, viewport, structureRects.length > 0);
    const canSelect = allowChipSelect && mode === "post-dice" && !isFocusedView;

    return (
      <g key={`${clipPrefix}${chip.id}`}>
        <polygon
          className={[
            "wafer-chip-shape",
            chipStatus === "clean" ? "wafer-chip-shape--clean" : "wafer-chip-shape--electrode",
            canSelect ? "wafer-chip-shape--interactive" : "wafer-chip-shape--readonly",
            isSelected ? "wafer-chip-shape--selected" : "",
            isFocusedView ? "wafer-chip-shape--focused" : ""
          ].join(" ")}
          points={toSvgPoints(chip.points, viewport)}
          vectorEffect="non-scaling-stroke"
          role={canSelect ? "button" : undefined}
          tabIndex={canSelect ? 0 : -1}
          aria-label={canSelect ? `Select die ${chip.label}` : `Die ${chip.label}`}
          aria-pressed={canSelect ? isSelected : undefined}
          onMouseDown={canSelect ? () => handleChipSelect(chip.id) : undefined}
          onKeyDown={canSelect ? (event) => handleChipKeySelect(event, chip.id) : undefined}
        />
        {chipStatus === "post_elb" && (
          <polygon
            className="wafer-chip-shape wafer-chip-hatch"
            points={toSvgPoints(chip.points, viewport)}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "none" }}
          />
        )}
        <g clipPath={`url(#${chipClipPathId})`} style={{ pointerEvents: isFocusedView ? "auto" : "none" }}>
          {structureRects.map((rect) => {
            const match = rect.id.match(/r-(\d+)-c-(\d+)$/);
            const inspectionRow = match ? Number(match[1]) : 1;
            const inspectionColumn = match ? Number(match[2]) : 1;
            const hasInspection = isFocusedView && Boolean(activeInspectionCells[`${inspectionRow}:${inspectionColumn}`]);
            const isActiveInspectionCell =
              isFocusedView &&
              isInspectionPanelOpen &&
              selectedInspectionCell?.row === inspectionRow &&
              selectedInspectionCell?.column === inspectionColumn;
            const openInspectionCell = (event: MouseEvent<SVGRectElement>) => {
              if (!isFocusedView) {
                return;
              }

              event.stopPropagation();
              setSelectedInspectionCell({
                row: inspectionRow,
                column: inspectionColumn
              });
              setIsInspectionPanelOpen(true);
            };

            return (
              <g key={rect.id}>
              <rect
                className="wafer-mode-structure"
                data-inspection-cell={`r${inspectionRow}-c${inspectionColumn}`}
                data-inspection-row={inspectionRow}
                data-inspection-column={inspectionColumn}
                data-active-inspection-cell={isActiveInspectionCell ? "true" : undefined}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                fill={rect.fill}
                stroke={rect.stroke}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                onMouseDown={isFocusedView ? openInspectionCell : undefined}
                onClick={isFocusedView ? openInspectionCell : undefined}
                style={isFocusedView ? { pointerEvents: "auto", cursor: "pointer" } : undefined}
              />
              {isActiveInspectionCell ? (
                <rect
                  className="wafer-mode-structure-active-ring"
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              ) : null}
              {hasInspection ? (
                <circle
                  className="wafer-mode-inspection-pin"
                  cx={rect.x + rect.width / 2}
                  cy={rect.y + rect.height / 2}
                  r={Math.max(0.65, Math.min(rect.width, rect.height) * 0.12)}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              ) : null}
              </g>
            );
          })}
        </g>
        {mode === "post-dice" && !isFocusedView ? (
          <text
            x={chipLabel.x}
            y={chipLabel.y}
            textAnchor={chipLabel.textAnchor}
            dominantBaseline={chipLabel.dominantBaseline}
            pointerEvents="none"
            fontSize={chipLabel.fontSize}
            fontWeight={700}
            fill="rgba(15, 23, 42, 0.56)"
            stroke="rgba(236, 253, 245, 0.72)"
            strokeWidth={0.25}
            style={{
              paintOrder: "stroke",
              userSelect: "none"
            }}
          >
            {chip.label}
          </text>
        ) : null}
      </g>
    );
  };

  const handleWaferOverviewKeySelect = (event: KeyboardEvent<SVGGElement>, waferId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedChipId(null);
      setSelectedWaferId(waferId);
    }
  };

  const renderWaferOverviewTile = (layout: WaferOverviewTileLayout) => {
    const { wafer, tileX, tileY, tileScale, tileViewport, tileMode, tileChips, clipPrefix } = layout;

    if (!waferOutline) {
      return null;
    }

    return (
      <g
        key={wafer.id}
        className="wafer-overview-tile"
        role="button"
        tabIndex={0}
        aria-label={`Open ${wafer.name}`}
        onClick={() => {
          setSelectedChipId(null);
          setSelectedWaferId(wafer.id);
        }}
        onKeyDown={(event) => handleWaferOverviewKeySelect(event, wafer.id)}
      >
        <rect
          className="wafer-overview-tile__hitbox"
          x={tileX}
          y={tileY}
          width={WAFER_OVERVIEW_TILE_SIZE}
          height={WAFER_OVERVIEW_TILE_SIZE + WAFER_OVERVIEW_LABEL_HEIGHT}
          rx={8}
        />
        <g transform={`translate(${tileX} ${tileY}) scale(${tileScale})`}>
          <polygon
            className="wafer-wafer-outline-shape"
            points={toSvgPoints(waferOutline.points, tileViewport)}
            vectorEffect="non-scaling-stroke"
          />
          {tileChips.map((chip) => renderChip(chip, tileViewport, false, tileMode, clipPrefix, false))}
        </g>
        <text
          className="wafer-overview-tile__name"
          x={tileX + WAFER_OVERVIEW_TILE_SIZE / 2}
          y={tileY + WAFER_OVERVIEW_TILE_SIZE + 22}
          textAnchor="middle"
        >
          {wafer.name}
        </text>
        <text
          className="wafer-overview-tile__meta"
          x={tileX + WAFER_OVERVIEW_TILE_SIZE / 2}
          y={tileY + WAFER_OVERVIEW_TILE_SIZE + 38}
          textAnchor="middle"
        >
          {wafer.stateName ?? wafer.statusLabel ?? "Waiting to start"}
        </text>
      </g>
    );
  };

  return (
    <div className="wafer-visualizer">
      <div
        className={[
          "wafer-visualizer-layout",
          !isChipFocusView ? "wafer-visualizer-layout--overview" : "",
          isChipFocusView ? "wafer-visualizer-layout--chip-focus" : ""
        ].join(" ")}
      >
        <div className={isChipFocusView ? "wafer-focus-rail" : "wafer-focus-rail wafer-focus-rail--inactive"}>
        <section className="panel wafer-viewer-panel">
          <div
            className={[
              "wafer-stage-shell",
              isWaferOverviewView ? "wafer-stage-shell--overview" : "",
              isChipFocusView || isWaferFocusView ? "wafer-stage-shell--focused" : "",
              isChipFocusView ? "wafer-stage-shell--inspection-trigger" : ""
            ].join(" ")}
          >
            {isChipFocusView || isWaferFocusView ? (
              <button
                type="button"
                className="button button-secondary wafer-chip-zoom-back"
                onClick={(event) => {
                  event.stopPropagation();
                  if (isChipFocusView) {
                    setIsInspectionPanelOpen(false);
                    setSelectedInspectionCell(null);
                    setSelectedChipId(null);
                    return;
                  }

                  setIsInspectionPanelOpen(false);
                  setSelectedInspectionCell(null);
                  setSelectedChipId(null);
                  setSelectedWaferId(null);
                }}
              >
                {isChipFocusView ? "← All dies" : "← All wafers"}
              </button>
            ) : null}
            {isWaferOverviewView && waferOutline ? (
              <svg
                className="wafer-svg-canvas wafer-svg-canvas--overview"
                viewBox={`0 0 ${overviewWidth} ${overviewHeight}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="Available wafer overview"
                style={{ aspectRatio: `${overviewWidth} / ${overviewHeight}` }}
              >
                {overviewTileLayouts.map(renderWaferOverviewTile)}
                <defs>
                  {overviewClipDefs.map((clipDef) => (
                    <clipPath id={clipDef.id} key={clipDef.key}>
                      <polygon points={clipDef.points} />
                    </clipPath>
                  ))}
                  <pattern
                    id={ELECTRODE_PATTERN_ID}
                    x="0"
                    y="0"
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" fill="rgba(15, 23, 42, 0.04)" />
                    <path d="M0 0h6" stroke="rgba(15, 23, 42, 0.2)" strokeWidth="1" />
                  </pattern>
                </defs>
              </svg>
            ) : null}
            {!isWaferOverviewView && waferOutline && displayViewport ? (
              <svg
                className={["wafer-svg-canvas", isChipFocusView ? "wafer-svg-canvas--focused" : ""].join(" ")}
                viewBox={`0 0 ${displayViewport.halfSpan * 2} ${displayViewport.halfSpan * 2}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label={
                  isChipFocusView && activeChip
                    ? `Die ${activeChip.label} focused layout`
                    : `${activeWaferName} wafer layout`
                }
              >
                {!isChipFocusView ? (
                  <polygon
                    className="wafer-wafer-outline-shape"
                    points={toSvgPoints(waferOutline.points, displayViewport)}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}

                {isChipFocusView && activeChip
                  ? renderChip(activeChip, displayViewport, true)
                  : chipPieces.map((chip) => renderChip(chip, displayViewport, false))}
                <defs>
                  {(isChipFocusView && activeChip ? [activeChip] : chipPieces).map((chip) => (
                    <clipPath id={`wafer-chip-clip-${chip.id}`} key={`clip-${chip.id}`}>
                      <polygon points={toSvgPoints(chip.points, displayViewport)} />
                    </clipPath>
                  ))}
                  <pattern
                    id={ELECTRODE_PATTERN_ID}
                    x="0"
                    y="0"
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" fill="rgba(15, 23, 42, 0.04)" />
                    <path d="M0 0h6" stroke="rgba(15, 23, 42, 0.2)" strokeWidth="1" />
                  </pattern>
                </defs>
              </svg>
            ) : null}
          </div>
        </section>

        {isChipFocusView && !isInspectionPanelOpen ? (
          <aside className="panel wafer-params-panel">
                {isPostDiceMode ? (
              activeChip && activeChipCode && activeChipExpandedName ? (
                    <div className="wafer-params-block">
                      <div className="wafer-panel-heading">
                        <div className="wafer-params-id">{activeChipCode}</div>
                        <p className="wafer-params-name">{activeChipExpandedName}</p>
                      </div>
                      <div className="wafer-params-empty">
                        <p className="muted">Click the die preview below to open inspection.</p>
                        <p className="muted">Row {activeChipInspectionRow} / Column {activeChipInspectionColumn}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="wafer-params-empty">
                      <p className="muted">
                        Click one of the dies on the wafer to inspect chip details.
                      </p>
                      <p className="muted">No die is selected right now.</p>
                    </div>
                  )
                ) : (
                  <div className="wafer-params-empty">
                    <p className="muted">This wafer is in pre-dice state.</p>
                    <p className="muted">Die-level parameter sheet appears when this wafer enters post-dice state.</p>
                  </div>
                )}
          </aside>
        ) : null}
        </div>
        {isChipFocusView && isInspectionPanelOpen && activeChipCode && activeChipExpandedName && activeWaferDatabaseId && activeProjectId ? (
          <div className="wafer-inspection-stack">
            <section className="panel wafer-inspection-workspace">
              {renderActiveInspectionPolingSummary()}
              <DieInspectionMap
                key={`${activeWaferDatabaseId}:${activeChipCode}:${activeChipInspectionRow}:${activeChipInspectionColumn}`}
                projectId={activeProjectId}
                waferId={activeWaferDatabaseId}
                dieCode={activeChipCode}
                dieName={activeChipExpandedName}
                row={activeChipInspectionRow}
                column={activeChipInspectionColumn}
                hue={activeInspectionHue}
                preloadedInspections={activeInspectionRecords}
                onInspectionsChange={(updatedInspections) => {
                  setInspectionCellState((current) => {
                    if (current.scope !== activeInspectionCellScope) {
                      return current;
                    }

                    const nextCells = { ...current.cells };
                    const nextInspectionsByCell = {
                      ...current.inspectionsByCell,
                      [activeInspectionCellKey]: updatedInspections
                    };

                    if (updatedInspections.length > 0) {
                      nextCells[activeInspectionCellKey] = true;
                    } else {
                      delete nextCells[activeInspectionCellKey];
                    }

                    return {
                      ...current,
                      cells: nextCells,
                      inspectionsByCell: nextInspectionsByCell
                    };
                  });
                }}
              />
            </section>
          </div>
        ) : isChipFocusView ? renderPolingParameterSheet() : null}
      </div>
    </div>
  );
}
