import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json, ProcessStep } from "@/types/database";

const DEFAULT_DIE_COUNT = 8;

function toJsonRecord(value: unknown): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

function normalizeProcessText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isDicingLikeStep(step: Pick<ProcessStep, "name" | "slug" | "process_area">) {
  const text = normalizeProcessText([step.name, step.slug, step.process_area].join(" "));
  const compact = text.replace(/\s+/g, "");
  if (/(pre|post|after|before)(dicing|diced|dice|singulation|singulate|sawing|sawcut|cutting)/.test(compact)) {
    return false;
  }
  return /(dicing|diced|dice|dicng|diciing|dicin|dicingg|singulation|singulate|sawing|sawcut|cutting)/.test(compact);
}

function getDieLabels(waferCode: string, metadata: Json) {
  const record = toJsonRecord(metadata);
  const configuredLabels = Array.isArray(record.die_labels)
    ? record.die_labels
        .filter((label): label is string => typeof label === "string" && Boolean(label.trim()))
        .map((label) => label.trim())
    : [];
  if (configuredLabels.length > 0) return [...new Set(configuredLabels)];

  const configuredCount = record.die_count;
  if (typeof configuredCount === "number" && Number.isFinite(configuredCount) && configuredCount > 0) {
    return Array.from({ length: Math.floor(configuredCount) }, (_, index) => `${waferCode.trim()}_${index + 1}`);
  }

  const explicitFamily = typeof record.wafer_family === "string" && record.wafer_family.trim()
    ? record.wafer_family.trim().toUpperCase()
    : waferCode.trim().toUpperCase();
  const prefix = explicitFamily.match(/[A-Z]/)?.[0] ?? "D";
  return Array.from({ length: DEFAULT_DIE_COUNT }, (_, index) => `${prefix}${index + 1}`);
}

export async function getDicingChildSpecsForCheckpoint({
  attemptId,
  supabase
}: {
  attemptId: string;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
}) {
  const { data: attempt, error: attemptError } = await supabase
    .from("process_step_attempts")
    .select("process_step_id, wafer_id")
    .eq("id", attemptId)
    .single();
  if (attemptError) throw attemptError;

  const [stepResult, waferResult] = await Promise.all([
    supabase
      .from("process_steps")
      .select("id, name, slug, process_area")
      .eq("id", attempt.process_step_id)
      .single(),
    supabase
      .from("wafers")
      .select("id, wafer_code, metadata")
      .eq("id", attempt.wafer_id)
      .single()
  ]);
  if (stepResult.error) throw stepResult.error;
  if (waferResult.error) throw waferResult.error;
  if (!isDicingLikeStep(stepResult.data)) return null;

  return getDieLabels(waferResult.data.wafer_code, waferResult.data.metadata as Json).map((dieLabel) => ({
    die_label: dieLabel,
    wafer_code: dieLabel.toUpperCase().startsWith(`${waferResult.data.wafer_code.trim().toUpperCase()}_`)
      ? dieLabel
      : `${waferResult.data.wafer_code}-${dieLabel}`
  }));
}
