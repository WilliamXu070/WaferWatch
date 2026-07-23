"use client";

import { useMemo, useState, useTransition } from "react";
import { readStepParameterDefinitions, type StepParameterType, type StepParameterValue } from "@/features/process-flows/stepParameters";
import type { ActionResult } from "@/lib/action-result";
import type { WaferStatusTileModel } from "../../types";
import type { StepVisitHistoryItem } from "./stepVisitHistoryModel";

type CorrectionInput =
  | {
      kind: "insert";
      mutationId: string;
      assignmentId: string;
      anchorVisitId: string;
      placement: "before" | "after";
      stepId: string;
      completedAt: string;
      reason: string;
      expectedHistoryRevision: number;
      parameterValues: Record<string, StepParameterValue>;
      parameterNotes: Record<string, string>;
    }
  | {
      kind: "remove";
      mutationId: string;
      assignmentId: string;
      visitId: string;
      reason: string;
      expectedHistoryRevision: number;
    };

function defaultDateTime() {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

function isBlank(value: string | undefined) {
  return !value?.trim();
}

function parseValue(type: StepParameterType, value: string): StepParameterValue {
  if (isBlank(value)) return null;
  if (type === "number") return Number(value);
  if (type === "boolean") return value === "true";
  return value;
}

export function HistoryCorrectionDialog({
  mode,
  tile,
  anchorVisit,
  onClose,
  onSubmit
}: {
  mode: "insert" | "remove";
  tile: WaferStatusTileModel;
  anchorVisit: StepVisitHistoryItem;
  onClose: () => void;
  onSubmit: (input: CorrectionInput) => Promise<ActionResult<unknown>>;
}) {
  const steps = tile.processSteps ?? [];
  const [stepId, setStepId] = useState(steps[0]?.id ?? "");
  const [placement, setPlacement] = useState<"before" | "after">("after");
  const [completedAt, setCompletedAt] = useState(defaultDateTime);
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const step = steps.find((candidate) => candidate.id === stepId) ?? null;
  const definitions = useMemo(
    () => step ? readStepParameterDefinitions(step.parametersSchema ?? {}) : [],
    [step]
  );
  const missingRequired = definitions.some((definition) => definition.required && isBlank(values[definition.key] ?? definition.defaultValue ?? ""));
  const invalidNumber = definitions.find(
    (definition) => definition.type === "number"
      && !isBlank(values[definition.key] ?? definition.defaultValue ?? "")
      && !Number.isFinite(Number(values[definition.key] ?? definition.defaultValue))
  );
  const saveBlocked = !tile.assignmentId
    || isPending
    || !reason.trim()
    || (mode === "insert" && (!step || !completedAt || missingRequired || Boolean(invalidNumber)));

  const submit = () => {
    if (!tile.assignmentId || isPending) return;
    if (!reason.trim()) {
      setMessage("Provide a correction reason.");
      return;
    }
    if (mode === "insert") {
      if (!step || !completedAt || missingRequired) {
        setMessage(!step ? "Choose a process step." : missingRequired ? "Complete every required parameter." : "Choose a completion time.");
        return;
      }
      if (invalidNumber) {
        setMessage(`${invalidNumber.label} needs a valid number.`);
        return;
      }
      const parameterValues = Object.fromEntries(definitions.map((definition) => [
        definition.key,
        parseValue(definition.type, values[definition.key] ?? definition.defaultValue ?? "")
      ]));
      startTransition(async () => {
        const result = await onSubmit({
          kind: "insert",
          mutationId: crypto.randomUUID(),
          assignmentId: tile.assignmentId!,
          anchorVisitId: anchorVisit.id,
          placement,
          stepId: step.id,
          completedAt: new Date(completedAt).toISOString(),
          reason: reason.trim(),
          expectedHistoryRevision: tile.historyRevision ?? 0,
          parameterValues,
          parameterNotes: Object.fromEntries(Object.entries(notes).filter(([, value]) => value.trim()))
        });
        if (!result.ok) return setMessage(result.error);
        onClose();
      });
      return;
    }
    startTransition(async () => {
      const result = await onSubmit({
        kind: "remove",
        mutationId: crypto.randomUUID(),
        assignmentId: tile.assignmentId!,
        visitId: anchorVisit.id,
        reason: reason.trim(),
        expectedHistoryRevision: tile.historyRevision ?? 0
      });
      if (!result.ok) return setMessage(result.error);
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#11111166] p-4" role="dialog" aria-modal="true" aria-label={mode === "insert" ? "Insert historical process step" : "Remove historical process step"}>
      <div className="max-h-[min(780px,calc(100vh-32px))] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e6e6e0] px-5 py-4">
          <div>
            <h3 className="text-[17px] font-semibold text-[#111111]">{mode === "insert" ? "Insert historical step" : "Remove historical step"}</h3>
            <p className="mt-1 text-[12px] leading-5 text-[#777770]">
              {mode === "insert"
                ? `This records a completed corrective visit. Its audit relation is ${placement} ${anchorVisit.stepName}; history is displayed by completion time.`
                : `This removes ${anchorVisit.stepName} from the effective history without deleting its audit evidence.`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[13px] font-semibold text-[#55554f] hover:bg-[#f2f2ee]">Close</button>
        </div>
        <div className="grid gap-4 p-5">
          {mode === "insert" ? (
            <>
              <label className="grid gap-1.5 text-[12px] font-semibold text-[#3f3f3a]">
                Process step
                <select value={stepId} onChange={(event) => { setStepId(event.target.value); setValues({}); setNotes({}); }} className="h-10 rounded-md border border-[#dcdcd5] bg-white px-3 text-[14px] font-medium">
                  {steps.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[12px] font-semibold text-[#3f3f3a]">
                  Audit relation
                  <select value={placement} onChange={(event) => setPlacement(event.target.value as "before" | "after")} className="h-10 rounded-md border border-[#dcdcd5] bg-white px-3 text-[14px] font-medium">
                    <option value="before">Before {anchorVisit.stepName}</option>
                    <option value="after">After {anchorVisit.stepName}</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-[12px] font-semibold text-[#3f3f3a]">
                  Completed at
                  <input type="datetime-local" value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} className="h-10 rounded-md border border-[#dcdcd5] px-3 text-[14px]" />
                </label>
              </div>
              {definitions.length ? (
                <section className="overflow-hidden rounded-lg border border-[#e2e2dc]">
                  <div className="border-b border-[#e2e2dc] bg-[#f6f6f2] px-3 py-2">
                    <h4 className="text-[12px] font-bold text-[#22221e]">{step?.name} parameters</h4>
                    <p className="mt-0.5 text-[11px] text-[#777770]">Required fields must be recorded with this historical visit.</p>
                  </div>
                  <div className="grid gap-3 p-3">
                    {definitions.map((definition) => (
                      <div key={definition.key} className="grid gap-1.5 sm:grid-cols-[minmax(150px,0.7fr)_minmax(0,1fr)] sm:items-start sm:gap-4">
                        <label className="pt-2 text-[12px] font-semibold text-[#3f3f3a]">
                          {definition.label}{definition.required ? <span className="ml-1 text-[#b23b2d]">*</span> : null}
                          {definition.unit ? <span className="ml-1 font-medium text-[#8a8a83]">{definition.unit}</span> : null}
                          {definition.description ? <span className="mt-0.5 block text-[11px] font-normal text-[#8a8a83]">{definition.description}</span> : null}
                        </label>
                        <div className="grid gap-1.5">
                          {definition.type === "boolean" ? (
                            <select value={values[definition.key] ?? definition.defaultValue ?? ""} onChange={(event) => setValues((current) => ({ ...current, [definition.key]: event.target.value }))} className="h-9 rounded-md border border-[#dcdcd5] bg-white px-2 text-[13px]">
                              <option value="">Not recorded</option><option value="true">Yes</option><option value="false">No</option>
                            </select>
                          ) : (
                            <input type={definition.type === "number" ? "number" : "text"} value={values[definition.key] ?? definition.defaultValue ?? ""} onChange={(event) => setValues((current) => ({ ...current, [definition.key]: event.target.value }))} className="h-9 rounded-md border border-[#dcdcd5] px-2 text-[13px]" />
                          )}
                          <input value={notes[definition.key] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [definition.key]: event.target.value }))} placeholder="Parameter note (optional)" className="h-8 rounded-md border border-[#e6e6e0] px-2 text-[12px]" />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
          <label className="grid gap-1.5 text-[12px] font-semibold text-[#3f3f3a]">
            Correction reason
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={4000} rows={3} placeholder="Why is this history being corrected?" className="resize-y rounded-md border border-[#dcdcd5] p-3 text-[14px]" />
          </label>
          {message ? <p role="status" className="text-[12px] font-semibold text-[#a33a2b]">{message}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e6e6e0] px-5 py-4">
          <button type="button" onClick={onClose} disabled={isPending} className="h-9 rounded-md border border-[#dcdcd5] px-4 text-[13px] font-semibold text-[#55554f]">Cancel</button>
          <button type="button" onClick={submit} disabled={saveBlocked} className="h-9 rounded-md bg-[#171714] px-4 text-[13px] font-semibold text-white disabled:bg-[#bdbdb5]">
            {isPending ? "Saving..." : mode === "insert" ? "Insert completed step" : "Remove from history"}
          </button>
        </div>
      </div>
    </div>
  );
}
