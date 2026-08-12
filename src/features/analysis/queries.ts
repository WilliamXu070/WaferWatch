import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import {
  type AnalysisDataSource,
  type PolingRecord,
  type PolingSourceAppearance
} from "./polingData";

const ANALYSIS_PAGE_SIZE = 500;

export type PolingAnalysisLoadResult = {
  records: readonly PolingRecord[];
  dataSource: AnalysisDataSource;
};

function unavailableResult(
  reason: NonNullable<Extract<AnalysisDataSource, { kind: "unavailable" }>["reason"]>
): PolingAnalysisLoadResult {
  return {
    records: [],
    dataSource: {
      kind: "unavailable",
      reason
    }
  };
}

function isMissingAnalysisSchema(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "PGRST204" || error.code === "PGRST205" || error.code === "42P01";
}

function stringsFromJson(value: Json): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function objectFromJson(value: Json): Record<string, Json | undefined> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function sourceAppearancesFromJson(value: Json): PolingSourceAppearance[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate) => {
    const appearance = objectFromJson(candidate);
    if (!appearance || typeof appearance.fileName !== "string") return [];
    const slide = typeof appearance.slide === "number" ? appearance.slide : null;
    const label = typeof appearance.label === "string" ? appearance.label : null;
    return [{ fileName: appearance.fileName, slide, label }];
  });
}

type AnalysisRecordRow = {
  catalog_record_id: string;
  source_key: string;
  specimen_reference: string;
  die_label: string;
  voltage: number;
  pulse_count: number;
  pulse_width_ms: number;
  post_pulse_voltage: number;
  post_pulse_width_ms: number;
  image_path: string | null;
  image_sha256: string | null;
  source_file: string;
  source_slide: number | null;
  source_image_label: string | null;
  replicate_index: number;
  replicate_count: number;
  display_order: number;
  confidence: string;
  flags: Json;
  source_appearances: Json;
  parameter_source: Json;
  workbook_provenance: Json;
};

function mapAnalysisRecord(row: AnalysisRecordRow): PolingRecord {
  const flags = stringsFromJson(row.flags);
  return {
    id: row.catalog_record_id,
    sourceKey: row.source_key,
    specimenReference: row.specimen_reference,
    dieLabel: row.die_label,
    voltage: row.voltage,
    pulses: row.pulse_count,
    pulseWidthMs: row.pulse_width_ms,
    postPulseVoltage: row.post_pulse_voltage,
    postPulseWidthMs: row.post_pulse_width_ms,
    imagePath: row.image_path,
    imageSha256: row.image_sha256,
    sourceFile: row.source_file,
    slide: row.source_slide,
    sourceImageLabel: row.source_image_label,
    replicateIndex: row.replicate_index,
    replicateCount: row.replicate_count,
    displayOrder: row.display_order,
    confidence: row.confidence,
    flags,
    flag: flags.join(" ") || undefined,
    sourceAppearances: sourceAppearancesFromJson(row.source_appearances),
    parameterSource: objectFromJson(row.parameter_source),
    workbookProvenance: objectFromJson(row.workbook_provenance)
  };
}

export async function getPolingAnalysisData(
  processTemplateId: string | null
): Promise<PolingAnalysisLoadResult> {
  if (!processTemplateId) return unavailableResult("no-process");

  try {
    const supabase = await createServerSupabaseClient();
    const processResult = await supabase
      .from("process_templates")
      .select("owner_project_id")
      .eq("id", processTemplateId)
      .maybeSingle();

    if (processResult.error) return unavailableResult("read-failed");
    const projectId = processResult.data?.owner_project_id;
    if (!projectId) return unavailableResult("no-project");

    const importResult = await supabase
      .from("analysis_imports")
      .select("id, manifest_sha256, record_count, asset_count, completed_at, created_at")
      .eq("project_id", projectId)
      .eq("status", "ready")
      .order("completed_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (importResult.error) {
      return unavailableResult(
        isMissingAnalysisSchema(importResult.error) ? "schema-unavailable" : "read-failed"
      );
    }
    if (!importResult.data) return unavailableResult("no-ready-import");

    const rows: AnalysisRecordRow[] = [];
    for (let offset = 0; ; offset += ANALYSIS_PAGE_SIZE) {
      const page = await supabase
        .from("poling_analysis_records")
        .select(
          "catalog_record_id, source_key, specimen_reference, die_label, voltage, pulse_count, pulse_width_ms, post_pulse_voltage, post_pulse_width_ms, image_path, image_sha256, source_file, source_slide, source_image_label, replicate_index, replicate_count, display_order, confidence, flags, source_appearances, parameter_source, workbook_provenance"
        )
        .eq("import_id", importResult.data.id)
        .eq("project_id", projectId)
        .order("display_order", { ascending: true })
        .order("source_key", { ascending: true })
        .range(offset, offset + ANALYSIS_PAGE_SIZE - 1);

      if (page.error) {
        return unavailableResult(
          isMissingAnalysisSchema(page.error) ? "schema-unavailable" : "read-failed"
        );
      }

      const pageRows: AnalysisRecordRow[] = page.data ?? [];
      rows.push(...pageRows);
      if (pageRows.length < ANALYSIS_PAGE_SIZE) break;
    }

    if (rows.length !== importResult.data.record_count || rows.length === 0) {
      return unavailableResult("incomplete-import");
    }

    return {
      records: rows.map(mapAnalysisRecord),
      dataSource: {
        kind: "database",
        projectId,
        importId: importResult.data.id,
        manifestSha256: importResult.data.manifest_sha256,
        recordCount: importResult.data.record_count,
        assetCount: importResult.data.asset_count,
        importedAt: importResult.data.completed_at ?? importResult.data.created_at
      }
    };
  } catch {
    return unavailableResult("read-failed");
  }
}
