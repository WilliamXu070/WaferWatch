export type PolingConfidence = "direct" | "reconciled" | "source_conflict" | (string & {});

export type PolingSourceAppearance = {
  fileName: string;
  slide: number | null;
  label?: string | null;
};

export type PolingRecord = {
  id: string;
  sourceKey?: string;
  specimenReference: string;
  dieLabel: string;
  voltage: number;
  pulses: number;
  pulseWidthMs: number;
  postPulseVoltage?: number | null;
  postPulseWidthMs?: number | null;
  imagePath?: string | null;
  imageSha256?: string | null;
  sourceFile?: string | null;
  slide?: number | null;
  sourceImageLabel?: string | null;
  sourceAppearances?: readonly PolingSourceAppearance[];
  parameterSource?: Record<string, unknown> | null;
  workbookProvenance?: Record<string, unknown> | null;
  confidence?: PolingConfidence;
  flags?: readonly string[];
  flag?: string;
  replicateIndex?: number;
  replicateCount?: number;
  displayOrder?: number;
};

export type AnalysisDataSource =
  | {
      kind: "database";
      projectId: string;
      importId: string;
      manifestSha256: string;
      recordCount: number;
      assetCount: number;
      importedAt: string;
    }
  | {
      kind: "unavailable";
      reason?:
        | "no-process"
        | "no-project"
        | "no-ready-import"
        | "schema-unavailable"
        | "read-failed"
        | "incomplete-import";
    };

export type PolingPointPosition = {
  voltage: number;
  pulses: number;
};

export const POLING_SERIES_PALETTE = [
  "#006d77",
  "#9a4e00",
  "#6c4ccf",
  "#b4235a",
  "#2a6fbb",
  "#537a1f",
  "#c04a24"
] as const;

export function getPolingSpecimens(records: readonly PolingRecord[]) {
  return [...new Set(records.map((record) => record.specimenReference))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

export function getPolingPulseWidths(records: readonly PolingRecord[]) {
  return [...new Set(records.map((record) => record.pulseWidthMs))].sort((a, b) => a - b);
}

export function getPolingSeriesColors(specimens: readonly string[]) {
  return Object.fromEntries(
    specimens.map((specimen, index) => [
      specimen,
      POLING_SERIES_PALETTE[index] ??
        `hsl(${((index * 137.508) % 360).toFixed(2)} 64% 38%)`
    ])
  ) as Record<string, string>;
}

/** Keeps graph coordinates faithful to the recorded experimental values. */
export function buildPolingPointPositions(records: readonly PolingRecord[]) {
  const positions = new Map<string, PolingPointPosition>();
  for (const record of records) {
    positions.set(record.id, {
      voltage: record.voltage,
      pulses: record.pulses
    });
  }

  return positions;
}

function getOrderedPolingOverlaps(
  visibleRecords: readonly PolingRecord[],
  target: PolingRecord
) {
  return visibleRecords
    .filter(
      (record) =>
        record.voltage === target.voltage && record.pulses === target.pulses
    )
    .sort(
      (a, b) =>
        (a.displayOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.displayOrder ?? Number.MAX_SAFE_INTEGER) ||
        (a.sourceKey ?? "").localeCompare(b.sourceKey ?? "") ||
        a.id.localeCompare(b.id)
    );
}

/**
 * Selects an exact-coordinate stack by display order, then stable source/id
 * fallbacks. A first click selects the clicked record; repeat clicks advance
 * through only the overlaps that remain visible.
 */
export function getNextPolingOverlapRecord(
  visibleRecords: readonly PolingRecord[],
  clickedRecord: PolingRecord,
  selectedId: string | null
) {
  const overlaps = getOrderedPolingOverlaps(visibleRecords, clickedRecord);
  const selectedIndex = overlaps.findIndex((record) => record.id === selectedId);

  if (selectedIndex < 0) return clickedRecord;
  return overlaps[(selectedIndex + 1) % overlaps.length] ?? clickedRecord;
}

/**
 * Moves within an exact-coordinate stack without wrapping. Returning null at
 * a stack edge lets the graph continue with ordinary spatial navigation.
 */
export function getAdjacentPolingOverlapRecord(
  visibleRecords: readonly PolingRecord[],
  currentRecord: PolingRecord,
  direction: -1 | 1
) {
  const overlaps = getOrderedPolingOverlaps(visibleRecords, currentRecord);
  const currentIndex = overlaps.findIndex((record) => record.id === currentRecord.id);
  if (currentIndex < 0) return null;
  return overlaps[currentIndex + direction] ?? null;
}
