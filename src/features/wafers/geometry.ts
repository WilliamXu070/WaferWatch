export type WaferPoint = {
  x: number;
  y: number;
};

export type ParsedWaferPolygon = {
  id: string;
  points: WaferPoint[];
};

export type WaferMode = "pre-dice" | "post-dice";

export type WaferChipPiece = {
  id: string;
  label: number;
  points: WaferPoint[];
  area: number;
  centroid: WaferPoint;
};

export type WaferViewport = {
  centerX: number;
  centerY: number;
  halfSpan: number;
};

export type WaferCutRecipe = {
  id: string;
  diameterMm: number;
  horizontalCutsMm: number[];
  verticalCutsMm: number[];
  chipCount: number;
  minChipAreaMm2: number;
};

export type DieOverlayTemplate = {
  columns: number;
  rows: number;
  rectWidthMm: number;
  rectHeightMm: number;
  gapXRatio?: number;
  gapYRatio?: number;
  insetMm?: number;
  clusterSpanFraction?: number;
  clusterHeightFraction?: number;
  horizontalOffsetFraction?: number;
  verticalOffsetFraction?: number;
  rowDirection?: "top-to-bottom" | "bottom-to-top";
};

export type DieOverlayRectMm = {
  id: string;
  row: number;
  column: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
};

export type DieOverlayRectSvg = {
  id: string;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const GDS_RECORD = {
  BOUNDARY: 0x08,
  XY: 0x10,
  ENDEL: 0x11,
  ENDSTR: 0x07,
  ENDLIB: 0x04
} as const;

const TARGET_WAFER_DIAMETER_MM = 100;
const TARGET_HALF_DIAMETER_MM = TARGET_WAFER_DIAMETER_MM / 2;
const HORIZONTAL_CUT_STEP_MM = 25.4;
const VERTICAL_OFFSET_MM = 38.1;
const SVG_PADDING_MM = 20;

export const DEFAULT_WAFER_CUT_RECIPE: WaferCutRecipe = {
  id: "4in-8-die-primary-flat",
  diameterMm: TARGET_WAFER_DIAMETER_MM,
  horizontalCutsMm: buildLinearCuts(TARGET_HALF_DIAMETER_MM, HORIZONTAL_CUT_STEP_MM),
  verticalCutsMm: [-VERTICAL_OFFSET_MM, 0, VERTICAL_OFFSET_MM],
  chipCount: 8,
  minChipAreaMm2: 5
};

export const DEFAULT_DIE_OVERLAY_TEMPLATE: DieOverlayTemplate = {
  columns: 15,
  rows: 3,
  rectWidthMm: 25.4,
  rectHeightMm: 12.192,
  gapXRatio: 0.18,
  gapYRatio: 0.5,
  insetMm: 0,
  clusterSpanFraction: 0.74,
  clusterHeightFraction: 0.48,
  horizontalOffsetFraction: 0.08,
  rowDirection: "top-to-bottom"
};

const EDGE_ALIGNMENT_EPSILON_MM = 0.001;
const RECTANGULAR_EDGE_RATIO = 0.88;
const ASYMMETRIC_EDGE_DELTA_RATIO = 0.2;

export function parseGdsPolygons(buffer: ArrayBuffer): ParsedWaferPolygon[] {
  const view = new DataView(buffer);
  const len = view.byteLength;
  let offset = 0;
  let activePoints: WaferPoint[] | null = null;
  const polygons: ParsedWaferPolygon[] = [];

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
          activePoints.push({
            x: view.getInt32(dataStart + index, false),
            y: view.getInt32(dataStart + index + 4, false)
          });
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

export function polygonArea(points: WaferPoint[]) {
  let sum = 0;

  for (let index = 0; index < points.length; index++) {
    const next = (index + 1) % points.length;
    sum += points[index].x * points[next].y;
    sum -= points[next].x * points[index].y;
  }

  return Math.abs(sum) / 2;
}

export function polygonCentroid(points: WaferPoint[]) {
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

export function deriveWaferGeometry(polygons: ParsedWaferPolygon[], minChipAreaMm2 = 5) {
  if (polygons.length === 0) {
    return null;
  }

  const withArea = polygons
    .map((polygon) => ({ polygon, area: polygonArea(polygon.points) }))
    .filter((item) => item.area > minChipAreaMm2)
    .sort((a, b) => b.area - a.area);

  return withArea.length > 0 ? withArea[0].polygon : polygons[0] ?? null;
}

export function normalizeToMillimeters(
  polygons: ParsedWaferPolygon[],
  targetDiameterMm = TARGET_WAFER_DIAMETER_MM
): ParsedWaferPolygon[] {
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
  const scale = targetDiameterMm / spanX;
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

export function buildWaferPieces(
  waferPoints: WaferPoint[],
  mode: WaferMode,
  recipe = DEFAULT_WAFER_CUT_RECIPE
): WaferChipPiece[] {
  if (mode === "pre-dice") {
    const area = polygonArea(waferPoints);
    if (area <= recipe.minChipAreaMm2) {
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

  return buildChipPieces(waferPoints, recipe);
}

export function buildSvgViewport(points: WaferPoint[], padding = SVG_PADDING_MM): WaferViewport {
  const bounds = polygonBounds(points);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const halfSpan = Math.max(bounds.width, bounds.height) / 2 + padding;

  return { centerX, centerY, halfSpan };
}

export function polygonBounds(points: WaferPoint[]) {
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

export function toSvgPoints(points: WaferPoint[], viewport: WaferViewport) {
  return points
    .map(
      (point) =>
        `${point.x - viewport.centerX + viewport.halfSpan},${viewport.halfSpan - (point.y - viewport.centerY)}`
    )
    .join(" ");
}

export function toSvgPoint(point: WaferPoint, viewport: WaferViewport) {
  return {
    x: point.x - viewport.centerX + viewport.halfSpan,
    y: viewport.halfSpan - (point.y - viewport.centerY)
  };
}

export function buildDieOverlayRectsMm(
  points: WaferPoint[],
  label: number,
  template = DEFAULT_DIE_OVERLAY_TEMPLATE
): DieOverlayRectMm[] {
  const bounds = polygonBounds(points);
  const columns = sanitizeGridAxisCount(template.columns);
  const rows = sanitizeGridAxisCount(template.rows);
  const rawRectWidth = sanitizeMm(template.rectWidthMm);
  const rawRectHeight = sanitizeMm(template.rectHeightMm);
  const rawGapX = sanitizeMm((template.gapXRatio ?? 0.2) * rawRectWidth);
  const rawGapY = sanitizeMm((template.gapYRatio ?? 0.2) * rawRectHeight);
  const inset = sanitizeMm(template.insetMm ?? 0.1);
  const clampSpanFraction = clampNumber(template.clusterSpanFraction ?? 1, 0.05, 1);
  const clampHeightFraction = clampNumber(template.clusterHeightFraction ?? clampSpanFraction, 0.05, 1);
  const verticalOffsetFraction = clampNumber(
    deriveDieOverlayVerticalOffset(label, points, template.verticalOffsetFraction),
    0,
    1
  );
  const horizontalOffsetFraction = deriveDieOverlayHorizontalOffset(points, template.horizontalOffsetFraction);

  if (columns === 0 || rows === 0 || rawRectWidth === 0 || rawRectHeight === 0) {
    return [];
  }

  const gapXToRectWidth = Math.min(1, rawGapX / rawRectWidth);
  const gapYToRectHeight = Math.min(1, rawGapY / rawRectHeight);
  const innerWidth = Math.max(bounds.width - 2 * inset, 1);
  const innerHeight = Math.max(bounds.height - 2 * inset, 1);
  const spanWidth = Math.max(1, innerWidth * clampSpanFraction);
  const spanHeight = Math.max(1, innerHeight * clampHeightFraction);
  const rectWidth = spanWidth / (columns + (columns + 1) * gapXToRectWidth);
  const rectHeight = spanHeight / (rows + (rows + 1) * gapYToRectHeight);
  const gapX = rectWidth * gapXToRectWidth;
  const gapY = rectHeight * gapYToRectHeight;
  const startX = bounds.minX + inset + (innerWidth - spanWidth) * horizontalOffsetFraction + gapX;
  const startY = bounds.minY + inset + (innerHeight - spanHeight) * verticalOffsetFraction + gapY;
  const rowDirection = template.rowDirection ?? "top-to-bottom";
  const structures: DieOverlayRectMm[] = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const waferRow = rowDirection === "top-to-bottom" ? rows - 1 - row : row;
      const xMin = startX + column * (rectWidth + gapX);
      const yMin = startY + waferRow * (rectHeight + gapY);

      structures.push({
        id: `die-${label}-r-${row + 1}-c-${column + 1}`,
        row: row + 1,
        column: column + 1,
        xMin,
        yMin,
        xMax: xMin + rectWidth,
        yMax: yMin + rectHeight
      });
    }
  }

  return structures;
}

function deriveDieOverlayHorizontalOffset(points: WaferPoint[], fallbackOffsetFraction = 0.5) {
  const bounds = polygonBounds(points);
  const leftVerticalSpan = boundaryVerticalSpan(points, bounds.minX);
  const rightVerticalSpan = boundaryVerticalSpan(points, bounds.maxX);
  const rectangularEdgeSpan = bounds.height * RECTANGULAR_EDGE_RATIO;
  const asymmetricThreshold = bounds.height * ASYMMETRIC_EDGE_DELTA_RATIO;

  if (leftVerticalSpan >= rectangularEdgeSpan && rightVerticalSpan >= rectangularEdgeSpan) {
    return 0.5;
  }

  if (rightVerticalSpan - leftVerticalSpan > asymmetricThreshold) {
    return 1;
  }

  if (leftVerticalSpan - rightVerticalSpan > asymmetricThreshold) {
    return 0;
  }

  return clampNumber(fallbackOffsetFraction, 0, 1);
}

function deriveDieOverlayVerticalOffset(
  label: number,
  points: WaferPoint[],
  fallbackOffsetFraction = 0.5
) {
  if (label === 1 || label === 2) {
    return 0;
  }

  if (label >= 7) {
    return 1;
  }

  const bounds = polygonBounds(points);
  const topHorizontalSpan = boundaryHorizontalSpan(points, bounds.maxY);
  const bottomHorizontalSpan = boundaryHorizontalSpan(points, bounds.minY);
  const rectangularSpan = bounds.width * RECTANGULAR_EDGE_RATIO;
  const asymmetricThreshold = bounds.width * ASYMMETRIC_EDGE_DELTA_RATIO;

  if (topHorizontalSpan >= rectangularSpan && bottomHorizontalSpan >= rectangularSpan) {
    return 0.5;
  }

  if (bottomHorizontalSpan - topHorizontalSpan > asymmetricThreshold) {
    return 1;
  }

  if (topHorizontalSpan - bottomHorizontalSpan > asymmetricThreshold) {
    return 0;
  }

  return clampNumber(fallbackOffsetFraction, 0, 1);
}

function boundaryVerticalSpan(points: WaferPoint[], boundaryX: number) {
  let span = 0;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const startOnBoundary = Math.abs(start.x - boundaryX) <= EDGE_ALIGNMENT_EPSILON_MM;
    const endOnBoundary = Math.abs(end.x - boundaryX) <= EDGE_ALIGNMENT_EPSILON_MM;

    if (startOnBoundary && endOnBoundary) {
      span += Math.abs(end.y - start.y);
    }
  }

  return span;
}

function boundaryHorizontalSpan(points: WaferPoint[], boundaryY: number) {
  let span = 0;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const startOnBoundary = Math.abs(start.y - boundaryY) <= EDGE_ALIGNMENT_EPSILON_MM;
    const endOnBoundary = Math.abs(end.y - boundaryY) <= EDGE_ALIGNMENT_EPSILON_MM;

    if (startOnBoundary && endOnBoundary) {
      span += Math.abs(end.x - start.x);
    }
  }

  return span;
}

export function overlayRectMmToSvg(rect: DieOverlayRectMm, viewport: WaferViewport): DieOverlayRectSvg {
  const startPoint = toSvgPoint({ x: rect.xMin, y: rect.yMin }, viewport);
  const endPoint = toSvgPoint({ x: rect.xMax, y: rect.yMax }, viewport);

  return {
    id: rect.id,
    row: rect.row,
    column: rect.column,
    x: Math.min(startPoint.x, endPoint.x),
    y: Math.min(startPoint.y, endPoint.y),
    width: Math.abs(endPoint.x - startPoint.x),
    height: Math.abs(endPoint.y - startPoint.y)
  };
}

function buildLinearCuts(halfSpan: number, step: number): number[] {
  const rawCuts: number[] = [];

  for (let value = -halfSpan + step; value < halfSpan - 0.000001; value += step) {
    rawCuts.push(value);
  }

  return rawCuts;
}

function splitPolygonByAxis(points: WaferPoint[], axis: "x" | "y", cut: number) {
  const negativeSide: WaferPoint[] = [];
  const positiveSide: WaferPoint[] = [];

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

    const crosses = (startDelta < 0 && endDelta > 0) || (startDelta > 0 && endDelta < 0);
    if (crosses) {
      const t = startDelta / (startDelta - endDelta);
      const intersection = {
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

function cleanPolygon(points: WaferPoint[]): WaferPoint[] | null {
  if (points.length < 3) {
    return null;
  }

  const output: WaferPoint[] = [];
  for (const point of points) {
    const previous = output.at(-1);
    if (!previous || previous.x !== point.x || previous.y !== point.y) {
      output.push(point);
    }
  }

  const first = output[0];
  const last = output.at(-1);
  if (first && last && first.x === last.x && first.y === last.y) {
    output.pop();
  }

  return output.length >= 3 ? output : null;
}

function buildChipPieces(waferPoints: WaferPoint[], recipe: WaferCutRecipe): WaferChipPiece[] {
  let chunks: WaferPoint[][] = [waferPoints];

  for (const cut of recipe.horizontalCutsMm) {
    chunks = chunks
      .flatMap((chunk) => {
        const split = splitPolygonByAxis(chunk, "y", cut);
        return [split.negative, split.positive];
      })
      .filter((chunk): chunk is WaferPoint[] => Boolean(chunk));
  }

  for (const cut of recipe.verticalCutsMm) {
    chunks = chunks
      .flatMap((chunk) => {
        const split = splitPolygonByAxis(chunk, "x", cut);
        return [split.negative, split.positive];
      })
      .filter((chunk): chunk is WaferPoint[] => Boolean(chunk));
  }

  const filteredPieces = chunks
    .map((chunk, index) => ({
      id: `piece-${index}`,
      points: chunk,
      area: polygonArea(chunk),
      centroid: polygonCentroid(chunk),
      label: 0
    }))
    .filter((piece) => piece.area > recipe.minChipAreaMm2)
    .sort((a, b) => b.area - a.area)
    .slice(0, recipe.chipCount)
    .sort((a, b) => b.centroid.y - a.centroid.y);

  if (filteredPieces.length === 0) {
    return [];
  }

  const rows = groupPiecesIntoRows(filteredPieces);
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
    .slice(0, recipe.chipCount);
}

function groupPiecesIntoRows(pieces: WaferChipPiece[]) {
  const sortedByY = [...pieces].sort((a, b) => b.centroid.y - a.centroid.y);
  const yGaps = sortedByY.slice(1).map((piece, index) => sortedByY[index].centroid.y - piece.centroid.y);

  if (yGaps.length === 0) {
    return [sortedByY];
  }

  let smallGap = yGaps.reduce((acc, value) => Math.min(acc, value), yGaps[0]);
  let largeGap = yGaps.reduce((acc, value) => Math.max(acc, value), yGaps[0]);

  for (let pass = 0; pass < 3; pass++) {
    const splitAt = (smallGap + largeGap) / 2;
    const smallGroup = yGaps.filter((gap) => gap <= splitAt);
    const largeGroup = yGaps.filter((gap) => gap > splitAt);
    const smallSum = smallGroup.reduce((acc, value) => acc + value, 0);
    const largeSum = largeGroup.reduce((acc, value) => acc + value, 0);
    smallGap = smallGroup.length > 0 ? smallSum / smallGroup.length : smallGap;
    largeGap = largeGroup.length > 0 ? largeSum / largeGroup.length : largeGap;
  }

  const rowSplitAt = (smallGap + largeGap) / 2;
  const rows: WaferChipPiece[][] = [[]];

  for (const piece of sortedByY) {
    const currentRow = rows[rows.length - 1];
    if (
      currentRow.length > 0 &&
      piece.centroid.y < currentRow[currentRow.length - 1].centroid.y - rowSplitAt
    ) {
      rows.push([]);
    }

    rows[rows.length - 1].push(piece);
  }

  return rows;
}

function sanitizeGridAxisCount(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 0;
}

function sanitizeMm(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
