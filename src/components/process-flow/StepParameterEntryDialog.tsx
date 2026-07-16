"use client";

import { Plus, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState, useTransition } from "react";
import {
  normalizeStepParameterKey,
  readStepParameterDefinitions,
  type RecordedLocalStepParameter,
  type StepParameterDefinition,
  type StepParameterValue
} from "@/features/process-flows/stepParameters";
import type { Json } from "@/types/database";
import type { SaveStepParameterRecordAction } from "./types";

export type PendingStepParameterEntry = {
  assignmentId: string;
  movementMutationId: string;
  waferLabel: string;
  stepId: string;
  stepName: string;
  parametersSchema: Json;
};

type DraftParameter = RecordedLocalStepParameter & { valueText: string };

const inputClassName = "h-10 w-full min-w-0 border border-transparent bg-transparent px-3 text-[13px] text-[#171714] outline-none hover:bg-[#f8f8f4] focus:border-[#77776f] focus:bg-white focus:ring-1 focus:ring-inset focus:ring-[#77776f]";

function makeLocalParameter(): DraftParameter {
  return {
    id: crypto.randomUUID(),
    key: "parameter",
    label: "",
    type: "text",
    unit: "",
    value: "",
    valueText: "",
    notes: "",
    scope: "local"
  };
}

function parseValue(type: StepParameterDefinition["type"], raw: string): StepParameterValue {
  if (raw === "") return null;
  if (type === "number") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  if (type === "boolean") return raw === "true";
  return raw;
}

function ParameterValueInput({
  definition,
  value,
  onChange
}: {
  definition: Pick<StepParameterDefinition, "type" | "label">;
  value: string;
  onChange: (value: string) => void;
}) {
  if (definition.type === "boolean") {
    return (
      <select className={inputClassName} aria-label={`${definition.label} value`} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        <option value="">Not recorded</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  return (
    <input
      className={inputClassName}
      aria-label={`${definition.label} value`}
      type={definition.type === "number" ? "number" : "text"}
      inputMode={definition.type === "number" ? "decimal" : undefined}
      value={value}
      placeholder="Enter value"
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

export function StepParameterEntryDialog({
  entry,
  total,
  onSave,
  onComplete,
  onSkipAll
}: {
  entry: PendingStepParameterEntry;
  total: number;
  onSave: SaveStepParameterRecordAction;
  onComplete: (message: string) => void;
  onSkipAll: () => void;
}) {
  const definitions = useMemo(() => readStepParameterDefinitions(entry.parametersSchema), [entry.parametersSchema]);
  const [globalValues, setGlobalValues] = useState<Record<string, string>>(() => Object.fromEntries(
    definitions.map((definition) => [definition.key, definition.defaultValue ?? ""])
  ));
  const [localParameters, setLocalParameters] = useState<DraftParameter[]>([]);
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    const missingRequired = definitions.find((definition) => definition.required && !globalValues[definition.key]?.trim());
    if (missingRequired) {
      setMessage(`${missingRequired.label} is required.`);
      return;
    }
    const emptyLocal = localParameters.find((parameter) => !parameter.label.trim() || !parameter.key.trim());
    if (emptyLocal) {
      setMessage("Each added parameter needs a label and database key.");
      return;
    }
    const keys = [...definitions.map((definition) => definition.key), ...localParameters.map((parameter) => parameter.key)];
    if (new Set(keys).size !== keys.length) {
      setMessage("Each parameter needs a unique database key.");
      return;
    }

    startTransition(async () => {
      const result = await onSave({
        assignmentId: entry.assignmentId,
        stepId: entry.stepId,
        movementMutationId: entry.movementMutationId,
        notes: additionalNotes.trim() || null,
        globalValues: Object.fromEntries(
          definitions.map((definition) => [definition.key, parseValue(definition.type, globalValues[definition.key] ?? "")])
        ),
        localParameters: localParameters.map(({ valueText, ...parameter }) => ({
          ...parameter,
          value: parseValue(parameter.type, valueText)
        }))
      });

      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      onComplete(`Parameters saved for ${entry.waferLabel}.`);
    });
  };

  return (
    <div className="flow-wafer-move-dialog-backdrop" role="presentation">
      <form className="flow-wafer-move-dialog process-flow-parameter-dialog" role="dialog" aria-modal="true" aria-labelledby="step-parameter-entry-title" onSubmit={submit}>
        <header className="border-b border-[#e8e8e1] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#85857d]">
            {total > 1 ? `${total} moved items remaining` : "Step parameters"}
          </p>
          <h2 id="step-parameter-entry-title" className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#171714]">
            {entry.stepName}
          </h2>
          <p className="mt-1 text-[13px] text-[#6f6f68]">Record the values for {entry.waferLabel}.</p>
        </header>

        <div className="grid max-h-[min(68vh,650px)] gap-4 overflow-y-auto px-5 py-4">
          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#dcdcd5] bg-white" aria-label="Wafer step parameters">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[680px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-10" />
                  <col className="w-[28%]" />
                  <col className="w-[28%]" />
                  <col />
                  <col className="w-12" />
                </colgroup>
                <thead className="bg-[#f2f2ed] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6e6e67]">
                  <tr>
                    <th scope="col" className="h-9 border-b border-r border-[#dcdcd5] text-center font-medium">#</th>
                    <th scope="col" className="h-9 border-b border-r border-[#dcdcd5] px-3">Parameter</th>
                    <th scope="col" className="h-9 border-b border-r border-[#dcdcd5] px-3">Value</th>
                    <th scope="col" className="h-9 border-b border-r border-[#dcdcd5] px-3">Notes</th>
                    <th scope="col" className="h-9 border-b border-[#dcdcd5]"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {definitions.map((definition, index) => (
                    <tr key={definition.id} className="border-b border-[#e5e5df] last:border-b-0">
                      <th scope="row" className="h-11 border-r border-[#e5e5df] bg-[#f7f7f3] text-center text-[11px] font-medium text-[#8b8b83]">{index + 1}</th>
                      <td className="border-r border-[#e5e5df] px-3 text-[13px] font-semibold text-[#2d2d29]">
                        {definition.label}{definition.required ? <span className="text-[#9f493f]"> *</span> : null}
                      </td>
                      <td className="border-r border-[#e5e5df] p-0">
                        <ParameterValueInput
                          definition={definition}
                          value={globalValues[definition.key] ?? ""}
                          onChange={(value) => setGlobalValues((current) => ({ ...current, [definition.key]: value }))}
                        />
                      </td>
                      <td className="border-r border-[#e5e5df] px-3 text-[12px] text-[#777770]">{definition.description || "—"}</td>
                      <td />
                    </tr>
                  ))}
                  {localParameters.map((parameter, index) => {
                    const rowNumber = definitions.length + index + 1;
                    return (
                      <tr key={parameter.id} className="border-b border-[#e5e5df] last:border-b-0">
                        <th scope="row" className="h-11 border-r border-[#e5e5df] bg-[#f7f7f3] text-center text-[11px] font-medium text-[#8b8b83]">{rowNumber}</th>
                        <td className="border-r border-[#e5e5df] p-0">
                          <input
                            className={inputClassName}
                            aria-label={`Additional parameter ${index + 1} label`}
                            placeholder="Parameter name"
                            value={parameter.label}
                            onChange={(event) => {
                              const label = event.currentTarget.value;
                              setLocalParameters((current) => current.map((candidate) => candidate.id === parameter.id
                                ? { ...candidate, label, key: normalizeStepParameterKey(label) }
                                : candidate));
                            }}
                          />
                        </td>
                        <td className="border-r border-[#e5e5df] p-0">
                          <input
                            className={inputClassName}
                            aria-label={`${parameter.label || `Parameter ${index + 1}`} value`}
                            placeholder="Enter value"
                            value={parameter.valueText}
                            onChange={(event) => setLocalParameters((current) => current.map((candidate) => candidate.id === parameter.id
                              ? { ...candidate, valueText: event.currentTarget.value }
                              : candidate))}
                          />
                        </td>
                        <td className="border-r border-[#e5e5df] p-0">
                          <input
                            className={inputClassName}
                            aria-label={`${parameter.label || `Parameter ${index + 1}`} notes`}
                            placeholder="Add a note"
                            value={parameter.notes}
                            onChange={(event) => setLocalParameters((current) => current.map((candidate) => candidate.id === parameter.id
                              ? { ...candidate, notes: event.currentTarget.value }
                              : candidate))}
                          />
                        </td>
                        <td className="p-0 text-center">
                          <button
                            type="button"
                            className="grid size-10 place-items-center text-[#8a8a82] hover:bg-[#f2e8e6] hover:text-[#9c3028]"
                            aria-label={`Remove ${parameter.label || `parameter ${index + 1}`}`}
                            onClick={() => setLocalParameters((current) => current.filter((candidate) => candidate.id !== parameter.id))}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!definitions.length && !localParameters.length ? (
                    <tr><td colSpan={5} className="h-20 px-4 text-center text-[13px] text-[#777770]">No template parameters are configured for this step.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="flex h-10 w-full items-center gap-2 border-t border-[#dcdcd5] bg-[#f8f8f4] px-3 text-left text-[12px] font-semibold text-[#55554f] hover:bg-[#f1f1eb] hover:text-[#1f1f1b]"
              onClick={() => setLocalParameters((current) => [...current, makeLocalParameter()])}
            >
              <Plus className="size-3.5" aria-hidden /> Add row
            </button>
          </section>

          <label className="grid gap-1.5 text-[12px] font-semibold text-[#5f5f58]">
            Additional notes <span className="font-normal text-[#92928a]">Optional</span>
            <textarea
              className="min-h-20 resize-y rounded-lg border border-[#dcdcd5] bg-white px-3 py-2.5 text-[14px] font-normal text-[#171714] outline-none focus:border-[#171714]"
              maxLength={4000}
              placeholder="Add any context for this wafer or die"
              value={additionalNotes}
              onChange={(event) => setAdditionalNotes(event.currentTarget.value)}
            />
          </label>

          {message ? <p className="text-[13px] font-semibold text-[#9c3028]" role="status">{message}</p> : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8e8e1] px-5 py-4">
          <button type="button" className="h-10 px-1 text-[13px] font-semibold text-[#6f6f68] hover:text-[#171714]" disabled={isPending} onClick={onSkipAll}>
            Skip for now
          </button>
          <button type="submit" className="h-10 rounded-lg bg-[#171714] px-4 text-[13px] font-semibold text-white hover:bg-[#30302b] disabled:opacity-50" disabled={isPending}>
            {isPending ? "Saving…" : total > 1 ? "Save and continue" : "Save parameters"}
          </button>
        </footer>
      </form>
    </div>
  );
}
