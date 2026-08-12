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

/**
 * Spreads records that share the same condition across a small voltage window.
 * This is calculated once per dataset so rendering and keyboard navigation do
 * not repeatedly scan all records for every point.
 */
export function buildPolingPointPositions(records: readonly PolingRecord[]) {
  const groups = new Map<string, PolingRecord[]>();

  for (const record of records) {
    const key = `${record.voltage}\u0000${record.pulses}`;
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }

  const positions = new Map<string, PolingPointPosition>();
  for (const group of groups.values()) {
    const ordered = [...group].sort(
      (a, b) =>
        a.specimenReference.localeCompare(b.specimenReference, undefined, { numeric: true }) ||
        a.pulseWidthMs - b.pulseWidthMs ||
        a.dieLabel.localeCompare(b.dieLabel, undefined, { numeric: true }) ||
        a.id.localeCompare(b.id)
    );
    const step = ordered.length > 1 ? Math.min(0.72, 8 / (ordered.length - 1)) : 0;
    const center = (ordered.length - 1) / 2;

    ordered.forEach((record, index) => {
      positions.set(record.id, {
        voltage: record.voltage + (index - center) * step,
        pulses: record.pulses
      });
    });
  }

  return positions;
}
