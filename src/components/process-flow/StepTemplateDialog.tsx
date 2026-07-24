"use client";

import { Plus, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  readStepParameterDefinitions,
  writeStepParameterDefinitions,
  type StepParameterDefinition
} from "@/features/process-flows/stepParameters";
import type { Json } from "@/types/database";
import { WaferWatchPortal } from "@/ui/waferwatch-wireframe/components/WaferWatchPortal";

export type StepTemplateDialogDraft = {
  mode: "create" | "edit";
  name: string;
  processArea: string;
  parametersSchema: Json;
  canEdit: boolean;
};

export type PreparedStepTemplate = {
  name: string;
  processArea: string;
  parametersSchema: Record<string, Json | undefined>;
};

const keyPattern = /^[a-z][a-z0-9_]{0,79}$/;

function newParameter(): StepParameterDefinition {
  return {
    id: crypto.randomUUID(),
    key: "",
    label: "",
    type: "text",
    unit: "",
    required: false,
    description: "",
    defaultValue: null
  };
}

function isBlankNewParameter(field: StepParameterDefinition) {
  return !field.key.trim() && !field.label.trim() && field.type === "text" &&
    !field.unit.trim() && !field.required && !field.description.trim() &&
    !(field.defaultValue ?? "").trim();
}

export function prepareStepTemplate(
  draft: Pick<StepTemplateDialogDraft, "name" | "processArea" | "parametersSchema">,
  fields: readonly StepParameterDefinition[]
): { ok: true; data: PreparedStepTemplate; fields: StepParameterDefinition[] } | { ok: false; error: string } {
  const name = draft.name.trim();
  const processArea = draft.processArea.trim();
  if (name.length < 2 || name.length > 180) {
    return { ok: false, error: "Step name must be between 2 and 180 characters." };
  }
  if (processArea.length < 2 || processArea.length > 120) {
    return { ok: false, error: "Process area must be between 2 and 120 characters." };
  }

  const activeFields = fields.filter((field) => !isBlankNewParameter(field));
  if (activeFields.length > 100) {
    return { ok: false, error: "A step template can contain at most 100 parameters." };
  }

  const usedKeys = new Set(activeFields.map((field) => field.key.trim()).filter(Boolean));
  const normalizedFields = activeFields.map((field) => {
    if (field.key.trim()) return { ...field, key: field.key.trim() };
    const normalized = field.label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 80) || "parameter";
    let key = normalized;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${normalized.slice(0, 76)}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);
    return { ...field, key };
  });

  const labels = new Set<string>();
  const keys = new Set<string>();
  for (const field of normalizedFields) {
    const label = field.label.trim();
    const defaultValue = field.defaultValue?.trim() || null;
    if (!label) return { ok: false, error: "Name each parameter before saving." };
    if (label.length > 160) return { ok: false, error: `${label.slice(0, 24)}… is longer than 160 characters.` };
    if (!keyPattern.test(field.key)) return { ok: false, error: `${label} has an invalid internal key.` };
    if (field.unit.trim().length > 40) return { ok: false, error: `${label} has a unit longer than 40 characters.` };
    if (field.description.trim().length > 4000) return { ok: false, error: `${label} guidance is longer than 4000 characters.` };
    if ((defaultValue?.length ?? 0) > 4000) return { ok: false, error: `${label} has a default longer than 4000 characters.` };
    if (field.type === "number" && defaultValue !== null && !Number.isFinite(Number(defaultValue))) {
      return { ok: false, error: `${label} needs a valid numeric default.` };
    }
    if (field.type === "boolean" && defaultValue !== null && defaultValue !== "true" && defaultValue !== "false") {
      return { ok: false, error: `${label} needs a Yes, No, or blank default.` };
    }
    const normalizedLabel = label.toLocaleLowerCase();
    if (labels.has(normalizedLabel) || keys.has(field.key)) {
      return { ok: false, error: "Each parameter name must be unique." };
    }
    labels.add(normalizedLabel);
    keys.add(field.key);
  }

  const preparedFields = normalizedFields.map((field) => ({
    ...field,
    label: field.label.trim(),
    unit: field.unit.trim(),
    description: field.description.trim(),
    defaultValue: field.defaultValue?.trim() || null
  }));
  return {
    ok: true,
    data: {
      name,
      processArea,
      parametersSchema: writeStepParameterDefinitions(draft.parametersSchema, preparedFields)
    },
    fields: preparedFields
  };
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

function defaultValueControl(
  field: StepParameterDefinition,
  disabled: boolean,
  onChange: (value: string | null) => void
) {
  const label = field.label || "Parameter";
  if (field.type === "boolean") {
    return (
      <select aria-label={`${label} default value`} disabled={disabled} value={field.defaultValue ?? ""} onChange={(event) => onChange(event.currentTarget.value || null)}>
        <option value="">No default</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  return (
    <input
      aria-label={`${label} default value`}
      disabled={disabled}
      inputMode={field.type === "number" ? "decimal" : undefined}
      maxLength={4000}
      onChange={(event) => onChange(event.currentTarget.value || null)}
      placeholder="No default"
      type={field.type === "number" ? "number" : "text"}
      value={field.defaultValue ?? ""}
    />
  );
}

export function StepTemplateDialog({
  draft,
  errorMessage,
  isPending,
  returnFocusTo,
  onCancel,
  onChange,
  onSubmit
}: {
  draft: StepTemplateDialogDraft;
  errorMessage?: string | null;
  isPending: boolean;
  returnFocusTo?: HTMLElement | SVGElement | null;
  onCancel: () => void;
  onChange: (draft: StepTemplateDialogDraft) => void;
  onSubmit: (template: PreparedStepTemplate) => void;
}) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const restoreFocusRef = useRef<HTMLElement | SVGElement | null>(null);
  const suppliedReturnFocusRef = useRef(returnFocusTo);
  const requestCloseRef = useRef<() => void>(() => undefined);
  const [initialSignature] = useState(() => JSON.stringify({
    name: draft.name,
    processArea: draft.processArea,
    parametersSchema: draft.parametersSchema
  }));
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const fields = useMemo(() => readStepParameterDefinitions(draft.parametersSchema), [draft.parametersSchema]);
  const currentSignature = JSON.stringify({
    name: draft.name,
    processArea: draft.processArea,
    parametersSchema: draft.parametersSchema
  });
  const isDirty = currentSignature !== initialSignature;
  const canMutate = draft.canEdit && !isPending;

  const updateFields = (nextFields: StepParameterDefinition[]) => {
    onChange({
      ...draft,
      parametersSchema: writeStepParameterDefinitions(draft.parametersSchema, nextFields)
    });
    setLocalMessage(null);
  };

  const requestClose = useCallback(() => {
    if (isPending) return;
    if (isDirty && typeof window !== "undefined" && !window.confirm("Discard unsaved step template changes?")) return;
    onCancel();
  }, [isDirty, isPending, onCancel]);

  useEffect(() => {
    requestCloseRef.current = requestClose;
  }, [requestClose]);

  useEffect(() => {
    restoreFocusRef.current = suppliedReturnFocusRef.current
      ?? (document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement
        ? document.activeElement
        : null);
    const dialog = dialogRef.current;
    const focusable = dialog ? getFocusableElements(dialog) : [];
    focusable[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = getFocusableElements(dialog);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutate) return;
    const prepared = prepareStepTemplate(draft, fields);
    if (!prepared.ok) {
      setLocalMessage(prepared.error);
      return;
    }
    setLocalMessage(null);
    onSubmit(prepared.data);
  };

  const message = localMessage ?? errorMessage ?? null;
  const dialog = (
    <div
      className="flow-wafer-move-dialog-backdrop step-template-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <form
        ref={dialogRef}
        aria-labelledby="step-template-dialog-title"
        aria-modal="true"
        className="flow-wafer-move-dialog process-flow-parameter-dialog step-template-dialog"
        onSubmit={submit}
        role="dialog"
      >
        <header className="step-template-dialog__header">
          <div className="min-w-0">
            <p className="eyebrow">{draft.mode === "create" ? "New process step" : "Step template"}</p>
            <h2 id="step-template-dialog-title">{draft.mode === "create" ? "Create step" : draft.name}</h2>
          </div>
          <button aria-label="Close step template" className="step-template-dialog__close" disabled={isPending} onClick={requestClose} type="button">
            <X aria-hidden className="size-4" />
          </button>
        </header>

        <div className="step-template-dialog__body">
          {draft.mode === "create" ? (
            <section className="step-template-dialog__details" aria-label="Step details">
              <label className="field" htmlFor="step-template-name">
                <span>Step name</span>
                <input
                  autoComplete="off"
                  disabled={!canMutate}
                  id="step-template-name"
                  maxLength={180}
                  onChange={(event) => onChange({ ...draft, name: event.currentTarget.value })}
                  placeholder="Photolithography"
                  required
                  value={draft.name}
                />
              </label>
              <label className="field" htmlFor="step-template-process-area">
                <span>Process area</span>
                <input
                  autoComplete="off"
                  disabled={!canMutate}
                  id="step-template-process-area"
                  maxLength={120}
                  onChange={(event) => onChange({ ...draft, processArea: event.currentTarget.value })}
                  placeholder="Lithography"
                  required
                  value={draft.processArea}
                />
              </label>
            </section>
          ) : null}

          <section className="step-template-dialog__parameters" aria-label="Step parameter definitions">
            {!draft.canEdit ? <span className="step-template-dialog__read-only">Read-only</span> : null}
            <div className="step-template-table-wrap">
              <table className="step-template-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Parameter</th>
                    <th>Type</th>
                    <th>Default</th>
                    <th>Unit</th>
                    <th>Required</th>
                    <th>Operator guidance</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.length === 0 ? (
                    <tr className="step-template-table__empty-row">
                      <td colSpan={8}>
                        <strong>No parameters yet</strong>
                        <span>Add fields for the values operators should record at this step.</span>
                      </td>
                    </tr>
                  ) : fields.map((field, index) => {
                    const update = <Key extends keyof StepParameterDefinition>(key: Key, value: StepParameterDefinition[Key]) => {
                      updateFields(fields.map((candidate) => candidate.id === field.id ? { ...candidate, [key]: value } : candidate));
                    };
                    return (
                      <tr key={field.id}>
                        <th scope="row">{index + 1}</th>
                        <td data-mobile-label="Parameter">
                          <input aria-label={`Parameter ${index + 1} name`} disabled={!canMutate} maxLength={160} onChange={(event) => update("label", event.currentTarget.value)} placeholder="Exposure time" value={field.label} />
                        </td>
                        <td data-mobile-label="Type">
                          <select
                            aria-label={`${field.label || `Parameter ${index + 1}`} type`}
                            disabled={!canMutate}
                            onChange={(event) => {
                              const type = event.currentTarget.value as StepParameterDefinition["type"];
                              const nextDefault = type === "boolean" && !["true", "false"].includes(field.defaultValue ?? "")
                                ? null
                                : type === "number" && field.defaultValue && !Number.isFinite(Number(field.defaultValue)) ? null : field.defaultValue;
                              updateFields(fields.map((candidate) => candidate.id === field.id ? { ...candidate, type, defaultValue: nextDefault } : candidate));
                            }}
                            value={field.type}
                          >
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="boolean">Yes / No</option>
                            {field.type === "select" ? <option value="select">Select (legacy)</option> : null}
                          </select>
                        </td>
                        <td data-mobile-label="Default">{defaultValueControl(field, !canMutate, (value) => update("defaultValue", value))}</td>
                        <td data-mobile-label="Unit">
                          <input aria-label={`${field.label || `Parameter ${index + 1}`} unit`} disabled={!canMutate} maxLength={40} onChange={(event) => update("unit", event.currentTarget.value)} placeholder="nm" value={field.unit} />
                        </td>
                        <td data-mobile-label="Required" className="step-template-table__required">
                          <input aria-label={`${field.label || `Parameter ${index + 1}`} required`} checked={field.required} disabled={!canMutate} onChange={(event) => update("required", event.currentTarget.checked)} type="checkbox" />
                        </td>
                        <td data-mobile-label="Guidance">
                          <input aria-label={`${field.label || `Parameter ${index + 1}`} operator guidance`} disabled={!canMutate} maxLength={4000} onChange={(event) => update("description", event.currentTarget.value)} placeholder="What should be recorded" value={field.description} />
                        </td>
                        <td className="step-template-table__actions">
                          {draft.canEdit ? (
                            <button aria-label={`Delete ${field.label || `parameter ${index + 1}`}`} disabled={isPending} onClick={() => updateFields(fields.filter((candidate) => candidate.id !== field.id))} type="button">
                              <Trash2 aria-hidden className="size-3.5" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {draft.canEdit ? (
                <button className="step-template-dialog__add" disabled={isPending || fields.length >= 100} onClick={() => updateFields([...fields, newParameter()])} type="button">
                  <Plus aria-hidden className="size-3.5" />
                  Add parameter
                </button>
              ) : null}
            </div>
          </section>
        </div>

        <footer className="step-template-dialog__footer">
          <p className={message ? "step-template-dialog__message" : ""} role={message ? "alert" : undefined}>{message}</p>
          <div>
            <button className="button ghost-button" disabled={isPending} onClick={requestClose} type="button">{draft.canEdit ? "Cancel" : "Close"}</button>
            {draft.canEdit ? (
              <button className="button primary-button" disabled={isPending} type="submit">
                {isPending ? "Saving…" : draft.mode === "create" ? "Create step" : "Save template"}
              </button>
            ) : null}
          </div>
        </footer>
      </form>
    </div>
  );
  return <WaferWatchPortal>{dialog}</WaferWatchPortal>;
}
