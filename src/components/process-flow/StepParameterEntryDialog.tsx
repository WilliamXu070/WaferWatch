"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  ClipboardEvent,
  FormEvent,
  useMemo,
  useState,
  useTransition,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction
} from "react";
import { PendingNoteAttachments } from "@/components/notes/PendingNoteAttachments";
import { getClipboardImageFiles } from "@/features/measurements/clipboardImages";
import {
  mergeNoteAttachmentFiles,
  prepareNoteAttachmentFiles
} from "@/features/measurements/noteAttachmentDraft";
import {
  normalizeStepParameterKey,
  readStepParameterDefinitions,
  type RecordedLocalStepParameter,
  type StepParameterDefinition,
  type StepParameterValue
} from "@/features/process-flows/stepParameters";
import type { Json, StepParameterRecord } from "@/types/database";
import type { SaveStepParameterRecordAction } from "./types";

export type PendingStepParameterEntry = {
  assignmentId: string;
  draftId?: string;
  movementMutationId: string;
  waferLabel: string;
  stepId: string;
  stepName: string;
  parametersSchema: Json;
  persistenceStatus?: "persisting" | "ready";
};

export function mergePendingStepParameterEntries(
  current: readonly PendingStepParameterEntry[],
  additions: readonly PendingStepParameterEntry[]
) {
  const entriesByMutationId = new Map(
    current.map((entry) => [entry.movementMutationId, entry])
  );
  additions.forEach((entry) => {
    if (!entriesByMutationId.has(entry.movementMutationId)) {
      entriesByMutationId.set(entry.movementMutationId, entry);
    }
  });
  return Array.from(entriesByMutationId.values());
}

export function settlePendingStepParameterEntries(
  current: readonly PendingStepParameterEntry[],
  successfulMutationIds: ReadonlySet<string>,
  failedMutationIds: ReadonlySet<string>
) {
  return current.flatMap((entry) => {
    if (failedMutationIds.has(entry.movementMutationId)) return [];
    if (!successfulMutationIds.has(entry.movementMutationId)) return [entry];
    return [{ ...entry, persistenceStatus: "ready" as const }];
  });
}

export type DraftParameter = RecordedLocalStepParameter & { valueText: string };

export type PersistStepParameterAttachment = (input: {
  projectId: string;
  waferId: string;
  dieLabel: string;
  stepId: string;
  stepName: string;
  stepExecutionId?: string | null;
  noteId: string;
  authorId?: string | null;
  author: string;
  body: string;
  files: readonly File[];
}) => Promise<unknown>;

type SharedStepParameterValues = Omit<
  Parameters<SaveStepParameterRecordAction>[0],
  "assignmentId" | "stepId" | "movementMutationId"
>;

export async function saveStepParametersForEntries(
  entries: PendingStepParameterEntry[],
  values: SharedStepParameterValues,
  onSave: SaveStepParameterRecordAction
) {
  const results = await Promise.all(entries.map((entry) => onSave({
    assignmentId: entry.assignmentId,
    stepId: entry.stepId,
    movementMutationId: entry.movementMutationId,
    ...values
  })));
  const failedResults = results.filter((result) => !result.ok);

  if (failedResults.length > 0) {
    return {
      ok: false as const,
      error: failedResults.length === 1
        ? failedResults[0].error
        : `${failedResults.length} moved items could not be saved. ${failedResults[0].error}`
    };
  }

  return {
    ok: true as const,
    data: results.flatMap((result) => result.ok ? [result.data] : [])
  };
}

export async function saveStepParameterAttachmentsForEntries(
  entries: readonly PendingStepParameterEntry[],
  records: readonly StepParameterRecord[],
  files: readonly File[],
  noteBody: string,
  currentUserName: string | undefined,
  persist: PersistStepParameterAttachment
) {
  if (entries.length !== records.length) {
    throw new Error("The saved parameter records do not match the moved items.");
  }

  await Promise.all(records.map((record, index) => persist({
    projectId: record.project_id,
    waferId: record.wafer_id,
    dieLabel: entries[index].waferLabel,
    stepId: record.process_step_id,
    stepName: entries[index].stepName,
    stepExecutionId: record.step_execution_id,
    noteId: `step-parameters:${record.id}`,
    authorId: record.recorded_by,
    author: currentUserName?.trim() || "Unknown user",
    body: noteBody.trim() || "Step parameter attachment",
    files
  })));
}

export function updateDraftParameterFromInput(
  setParameters: Dispatch<SetStateAction<DraftParameter[]>>,
  parameterId: string,
  key: "valueText" | "notes",
  event: Pick<ChangeEvent<HTMLInputElement>, "currentTarget">
) {
  const value = event.currentTarget.value;
  setParameters((current) => current.map((parameter) => parameter.id === parameterId
    ? { ...parameter, [key]: value }
    : parameter));
}

const inputClassName = "h-10 w-full min-w-0 border border-transparent bg-transparent px-3 text-[13px] text-[#171714] outline-none hover:bg-[#f8f8f4] focus:border-[#77776f] focus:bg-white focus:ring-1 focus:ring-inset focus:ring-[#77776f]";

function makeLocalParameter(): DraftParameter {
  return {
    id: crypto.randomUUID(),
    key: "",
    label: "",
    type: "text",
    unit: "",
    value: "",
    valueText: "",
    notes: "",
    scope: "local"
  };
}

export function prepareLocalParametersForSave(
  parameters: readonly DraftParameter[],
  reservedKeys: readonly string[]
) {
  const activeParameters = parameters.filter((parameter) =>
    parameter.label.trim() || parameter.valueText.trim() || parameter.notes.trim()
  );
  if (activeParameters.some((parameter) => !parameter.label.trim())) {
    return {
      ok: false as const,
      error: "Name each added parameter before saving."
    };
  }

  const usedKeys = new Set(reservedKeys.map((key) => key.trim()).filter(Boolean));
  const preparedParameters = activeParameters.map((parameter) => {
    const baseKey = normalizeStepParameterKey(parameter.label);
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey.slice(0, 76)}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);
    return { ...parameter, key };
  });

  return { ok: true as const, parameters: preparedParameters };
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
  entries,
  onSave,
  onComplete,
  onSkipAll,
  currentUserName,
  onPersistAttachment
}: {
  entries: PendingStepParameterEntry[];
  onSave: SaveStepParameterRecordAction;
  onComplete: (message: string) => void;
  onSkipAll: () => void;
  currentUserName?: string;
  onPersistAttachment?: PersistStepParameterAttachment;
}) {
  const entry = entries[0];
  const total = entries.length;
  const definitions = useMemo(() => readStepParameterDefinitions(entry.parametersSchema), [entry.parametersSchema]);
  const [globalValues, setGlobalValues] = useState<Record<string, string>>(() => Object.fromEntries(
    definitions.map((definition) => [definition.key, definition.defaultValue ?? ""])
  ));
  const [localParameters, setLocalParameters] = useState<DraftParameter[]>([]);
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isMovementPersisting = entries.some((candidate) => candidate.persistenceStatus === "persisting");

  const appendAttachmentFiles = async (files: readonly File[]) => {
    await prepareNoteAttachmentFiles(files);
    setAttachmentFiles((current) => {
      const merged = mergeNoteAttachmentFiles(current, files);
      setAttachmentError(
        merged.oversizedCount > 0
          ? "Files must be 50 MB or smaller."
          : merged.overflowCount > 0
            ? "You can attach up to 8 files."
            : null
      );
      return merged.files;
    });
  };

  const pasteAttachmentImages = (event: ClipboardEvent<HTMLElement>) => {
    const images = getClipboardImageFiles(event.clipboardData);
    if (!images.length) return;
    event.preventDefault();
    void appendAttachmentFiles(images);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending || isMovementPersisting) return;

    const missingRequired = definitions.find((definition) => definition.required && !globalValues[definition.key]?.trim());
    if (missingRequired) {
      setMessage(`${missingRequired.label} is required.`);
      return;
    }
    const preparedLocalParameters = prepareLocalParametersForSave(
      localParameters,
      definitions.map((definition) => definition.key)
    );
    if (!preparedLocalParameters.ok) {
      setMessage(preparedLocalParameters.error);
      return;
    }

    startTransition(async () => {
      const result = await saveStepParametersForEntries(entries, {
        notes: additionalNotes.trim() || null,
        globalValues: Object.fromEntries(
          definitions.map((definition) => [definition.key, parseValue(definition.type, globalValues[definition.key] ?? "")])
        ),
        localParameters: preparedLocalParameters.parameters.map(({ valueText, ...parameter }) => ({
          ...parameter,
          value: parseValue(parameter.type, valueText)
        }))
      }, onSave);

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      if (attachmentFiles.length > 0) {
        if (!onPersistAttachment) {
          setMessage("Attachments are unavailable for this process view.");
          return;
        }
        try {
          await saveStepParameterAttachmentsForEntries(
            entries,
            result.data,
            attachmentFiles,
            additionalNotes,
            currentUserName,
            onPersistAttachment
          );
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "The attachments could not be saved.");
          return;
        }
      }

      onComplete(total > 1
        ? `Parameters saved for all ${total} moved items.`
        : `Parameters saved for ${entry.waferLabel}.`);
    });
  };

  return (
    <div className="flow-wafer-move-dialog-backdrop" role="presentation">
      <form className="flow-wafer-move-dialog process-flow-parameter-dialog" role="dialog" aria-modal="true" aria-labelledby="step-parameter-entry-title" onPaste={pasteAttachmentImages} onSubmit={submit}>
        <header className="border-b border-[#e8e8e1] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#85857d]">
            {total > 1 ? `Applies to all ${total} moved items` : "Step parameters"}
          </p>
          <h2 id="step-parameter-entry-title" className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#171714]">
            {entry.stepName}
          </h2>
          <p className="mt-1 text-[13px] text-[#6f6f68]">
            {total > 1
              ? `Record once for ${entries.map((candidate) => candidate.waferLabel).join(", ")}.`
              : `Record the values for ${entry.waferLabel}.`}
          </p>
          {isMovementPersisting ? (
            <p className="mt-2 text-[12px] font-medium text-[#6f6f68]" role="status">
              Finishing the move… You can enter values now.
            </p>
          ) : null}
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
                              setMessage(null);
                            }}
                          />
                        </td>
                        <td className="border-r border-[#e5e5df] p-0">
                          <input
                            className={inputClassName}
                            aria-label={`${parameter.label || `Parameter ${index + 1}`} value`}
                            placeholder="Enter value"
                            value={parameter.valueText}
                            onChange={(event) => {
                              updateDraftParameterFromInput(
                                setLocalParameters,
                                parameter.id,
                                "valueText",
                                event
                              );
                              setMessage(null);
                            }}
                          />
                        </td>
                        <td className="border-r border-[#e5e5df] p-0">
                          <input
                            className={inputClassName}
                            aria-label={`${parameter.label || `Parameter ${index + 1}`} notes`}
                            placeholder="Add a note"
                            value={parameter.notes}
                            onChange={(event) => {
                              updateDraftParameterFromInput(
                                setLocalParameters,
                                parameter.id,
                                "notes",
                                event
                              );
                              setMessage(null);
                            }}
                          />
                        </td>
                        <td className="p-0 text-center">
                          <button
                            type="button"
                            className="grid size-10 place-items-center text-[#8a8a82] hover:bg-[#f2e8e6] hover:text-[#9c3028]"
                            aria-label={`Remove ${parameter.label || `parameter ${index + 1}`}`}
                            onClick={() => {
                              setLocalParameters((current) => current.filter((candidate) => candidate.id !== parameter.id));
                              setMessage(null);
                            }}
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
              onClick={() => {
                setLocalParameters((current) => [...current, makeLocalParameter()]);
                setMessage(null);
              }}
            >
              <Plus className="size-3.5" aria-hidden /> Add row
            </button>
          </section>

          <label className="grid gap-1.5 text-[12px] font-semibold text-[#5f5f58]">
            Additional notes <span className="font-normal text-[#92928a]">Optional</span>
            <textarea
              className="min-h-20 resize-y rounded-lg border border-[#dcdcd5] bg-white px-3 py-2.5 text-[14px] font-normal text-[#171714] outline-none focus:border-[#171714]"
              maxLength={4000}
              placeholder={total > 1 ? "Add context for all moved items" : "Add any context for this wafer or die"}
              value={additionalNotes}
              onChange={(event) => {
                setAdditionalNotes(event.currentTarget.value);
                setMessage(null);
              }}
            />
          </label>

          <PendingNoteAttachments
            files={attachmentFiles}
            disabled={isPending}
            error={attachmentError}
            description={total > 1
              ? `Paste images or attach files for all ${total} moved items.`
              : "Paste images or attach files for this step record."}
            onAddFiles={appendAttachmentFiles}
            onRemoveFile={(file) => setAttachmentFiles((current) => current.filter((candidate) => candidate !== file))}
          />

          {message ? <p className="text-[13px] font-semibold text-[#9c3028]" role="status">{message}</p> : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8e8e1] px-5 py-4">
          <button type="button" className="h-10 px-1 text-[13px] font-semibold text-[#6f6f68] hover:text-[#171714]" disabled={isPending} onClick={onSkipAll}>
            Skip for now
          </button>
          <button type="submit" className="h-10 rounded-lg bg-[#171714] px-4 text-[13px] font-semibold text-white hover:bg-[#30302b] disabled:opacity-50" disabled={isPending || isMovementPersisting}>
            {isPending
              ? "Saving…"
              : isMovementPersisting
                ? "Finishing move…"
                : total > 1
                  ? `Save for all ${total}`
                  : "Save parameters"}
          </button>
        </footer>
      </form>
    </div>
  );
}
