"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  normalizeStepParameterKey,
  readStepParameterDefinitions,
  type StepParameterType,
  type StepParameterValue
} from "@/features/process-flows/stepParameters";
import type { Json } from "@/types/database";
import type {
  WaferStatusStepParameterRecord,
  WaferStatusStepParameterValue
} from "../../types";

type DraftParameter = Omit<WaferStatusStepParameterValue, "value"> & {
  valueText: string;
};

type SaveStepParametersAction = (input: unknown) => Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: string }
>;

function formatRecordedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto"
  }).format(date);
}

function toValueText(value: StepParameterValue) {
  if (value === null) return "";
  return typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
}

function parseDraftValue(type: StepParameterType, valueText: string): StepParameterValue {
  const value = valueText.trim();
  if (!value) return null;
  if (type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (type === "boolean") {
    if (["yes", "true", "1"].includes(value.toLowerCase())) return true;
    if (["no", "false", "0"].includes(value.toLowerCase())) return false;
  }
  return value;
}

function getUniqueParameterKey(label: string, rows: readonly DraftParameter[], currentId: string) {
  const base = normalizeStepParameterKey(label);
  const taken = new Set(rows.filter((row) => row.id !== currentId).map((row) => row.key));
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base.slice(0, 76)}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 70)}_${currentId.slice(0, 8)}`;
}

function buildDraftParameters(
  record: WaferStatusStepParameterRecord | null,
  templateSchema: Json
): DraftParameter[] {
  if (record) {
    return record.values.map((parameter) => ({
      ...parameter,
      valueText: toValueText(parameter.value)
    }));
  }

  return readStepParameterDefinitions(templateSchema).map((definition) => ({
    id: definition.id,
    key: definition.key,
    label: definition.label,
    type: definition.type,
    valueText: definition.defaultValue ?? "",
    unit: definition.unit,
    notes: "",
    scope: "global"
  }));
}

export function StepParameterHistory({
  records,
  templateSchema = {},
  projectId,
  waferId,
  stepId,
  stepExecutionId,
  canEdit,
  onSave,
  onDirtyChange,
  onSaved,
  initiallyDirty,
  className = ""
}: {
  records: readonly WaferStatusStepParameterRecord[];
  templateSchema?: Json;
  projectId: string;
  waferId: string;
  stepId: string;
  stepExecutionId: string | null;
  canEdit: boolean;
  onSave: SaveStepParametersAction;
  onDirtyChange?: (isDirty: boolean) => void;
  onSaved?: () => void;
  initiallyDirty?: boolean;
  className?: string;
}) {
  const orderedRecords = useMemo(
    () => [...records].sort((first, second) => second.recordedAt.localeCompare(first.recordedAt)),
    [records]
  );
  const latestRecord = orderedRecords[0] ?? null;
  const [parameters, setParameters] = useState<DraftParameter[]>(() =>
    buildDraftParameters(latestRecord, templateSchema)
  );
  const [additionalNotes] = useState(latestRecord?.notes ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(initiallyDirty ?? (!latestRecord && parameters.length > 0));
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const updateParameter = (id: string, update: Partial<DraftParameter>) => {
    setParameters((current) => current.map((parameter) => {
      if (parameter.id !== id) return parameter;
      const next = { ...parameter, ...update };
      if (typeof update.label === "string" && parameter.scope === "local") {
        next.key = getUniqueParameterKey(update.label, current, id);
      }
      return next;
    }));
    setIsDirty(true);
    setMessage(null);
  };

  const addParameter = () => {
    const id = crypto.randomUUID();
    setParameters((current) => [
      ...current,
      {
        id,
        key: getUniqueParameterKey("parameter", current, id),
        label: "",
        type: "text",
        valueText: "",
        unit: "",
        notes: "",
        scope: "local"
      }
    ]);
    setIsDirty(true);
    setMessage(null);
  };

  const saveParameters = () => {
    if (!canEdit || isPending || !isDirty) return;
    const emptyParameter = parameters.find((parameter) => !parameter.label.trim());
    if (emptyParameter) {
      setMessage("Name each parameter before saving.");
      return;
    }

    startTransition(async () => {
      const result = await onSave({
        projectId,
        waferId,
        stepId,
        stepExecutionId,
        recordId: latestRecord?.id ?? null,
        expectedRevision: latestRecord?.revision ?? null,
        notes: additionalNotes.trim() || null,
        parameters: parameters.map((parameter) => ({
          id: parameter.id,
          key: parameter.key,
          label: parameter.label.trim(),
          type: parameter.type,
          unit: parameter.unit,
          value: parseDraftValue(parameter.type, parameter.valueText),
          notes: parameter.notes.trim(),
          scope: parameter.scope
        }))
      });

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      setIsDirty(false);
      setMessage("Parameters saved.");
      onSaved?.();
    });
  };

  return (
    <section
      className={["border-b border-[#e7e7e1] bg-white", className].join(" ")}
      aria-label="Selected step parameters"
    >
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 border-b border-[#ecece7] px-3 py-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#696963]">Parameters</h4>
            {latestRecord ? (
              <span className="truncate text-[11px] font-medium text-[#92928a]">
                {formatRecordedTime(latestRecord.recordedAt)}
              </span>
            ) : null}
          </div>
          {message ? (
            <p className={message === "Parameters saved." ? "text-[11px] font-medium text-[#3f7534]" : "text-[11px] font-medium text-[#9c3028]"} role="status">
              {message}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={saveParameters}
            disabled={!isDirty || isPending}
            className="h-7 rounded-md bg-[#171714] px-3 text-[11px] font-semibold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#c8c8c1]"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        ) : null}
      </div>

      <div className="wafer-step-parameter-sheet overflow-x-auto">
        <div className="wafer-step-parameter-sheet__content min-w-[560px]">
          <div className="wafer-step-parameter-sheet__row grid grid-cols-[36px_minmax(150px,0.9fr)_minmax(130px,0.75fr)_minmax(180px,1.1fr)_36px] border-b border-[#deded8] bg-[#f3f3ef] text-[10px] font-semibold uppercase tracking-[0.07em] text-[#696963]">
            <span className="grid h-8 place-items-center border-r border-[#deded8]">#</span>
            <span className="flex h-8 items-center border-r border-[#deded8] px-2.5">Parameter</span>
            <span className="flex h-8 items-center border-r border-[#deded8] px-2.5">Value</span>
            <span className="flex h-8 items-center border-r border-[#deded8] px-2.5">Notes</span>
            <span className="sr-only">Actions</span>
          </div>

          {parameters.length ? parameters.map((parameter, index) => (
            <div
              key={parameter.id}
              className="wafer-step-parameter-sheet__row grid grid-cols-[36px_minmax(150px,0.9fr)_minmax(130px,0.75fr)_minmax(180px,1.1fr)_36px] border-b border-[#e6e6e0] bg-white last:border-b-0"
            >
              <span className="grid min-h-10 place-items-center border-r border-[#e6e6e0] bg-[#fafaf7] text-[11px] font-medium text-[#8b8b83]">
                {index + 1}
              </span>
              <input
                aria-label={`Parameter ${index + 1} name`}
                value={parameter.label}
                disabled={!canEdit}
                placeholder="Parameter name"
                onChange={(event) => updateParameter(parameter.id, { label: event.currentTarget.value })}
                className="min-w-0 border-r border-[#e6e6e0] bg-transparent px-2.5 text-[12px] font-semibold text-[#252521] outline-none focus:bg-[#fffdf3] disabled:text-[#55554f]"
              />
              <input
                aria-label={`${parameter.label || `Parameter ${index + 1}`} value`}
                value={parameter.valueText}
                disabled={!canEdit}
                placeholder="Enter value"
                onChange={(event) => updateParameter(parameter.id, { valueText: event.currentTarget.value })}
                className="min-w-0 border-r border-[#e6e6e0] bg-transparent px-2.5 text-[12px] text-[#252521] outline-none focus:bg-[#fffdf3] disabled:text-[#55554f]"
              />
              <input
                aria-label={`${parameter.label || `Parameter ${index + 1}`} notes`}
                value={parameter.notes}
                disabled={!canEdit}
                placeholder="Optional note"
                onChange={(event) => updateParameter(parameter.id, { notes: event.currentTarget.value })}
                className="min-w-0 border-r border-[#e6e6e0] bg-transparent px-2.5 text-[12px] text-[#55554f] outline-none focus:bg-[#fffdf3] disabled:text-[#777770]"
              />
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Remove ${parameter.label || `parameter ${index + 1}`}`}
                  onClick={() => {
                    setParameters((current) => current.filter((candidate) => candidate.id !== parameter.id));
                    setIsDirty(true);
                    setMessage(null);
                  }}
                  className="grid min-h-10 place-items-center text-[#8a8a82] hover:bg-[#f6e9e7] hover:text-[#9c3028]"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              ) : <span />}
            </div>
          )) : (
            <div className="grid min-h-10 place-items-center border-b border-[#e6e6e0] px-4 text-[12px] font-medium text-[#85857d]">
              No parameters recorded for this visit.
            </div>
          )}

          {canEdit ? (
            <button
              type="button"
              onClick={addParameter}
              className="flex h-8 w-full items-center gap-2 bg-[#fafaf7] px-3 text-left text-[12px] font-semibold text-[#55554f] hover:bg-[#f2f2ed]"
            >
              <Plus size={14} aria-hidden /> Add parameter
            </button>
          ) : null}
        </div>
      </div>

    </section>
  );
}
