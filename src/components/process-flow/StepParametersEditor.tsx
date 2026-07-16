"use client";

import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import type { Json, ProcessStep } from "@/types/database";
import {
  normalizeStepParameterKey,
  readStepParameterDefinitions,
  writeStepParameterDefinitions,
  type StepParameterDefinition
} from "@/features/process-flows/stepParameters";

type UpdateStepParametersAction = (input: {
  stepId: string;
  expectedRevision: number;
  parametersSchema: Record<string, Json | undefined>;
}) => Promise<ActionResult<ProcessStep>>;

const cellInputClassName = "h-10 w-full min-w-0 border border-transparent bg-transparent px-3 text-[13px] text-[#1f1f1b] outline-none transition-colors placeholder:text-[#a1a199] hover:bg-[#f8f8f4] focus:border-[#77776f] focus:bg-[#fefefd] focus:ring-1 focus:ring-inset focus:ring-[#77776f] disabled:cursor-default disabled:text-[#686861]";

function makeParameter(): StepParameterDefinition {
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

function validateParameters(fields: readonly StepParameterDefinition[]) {
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const field of fields) {
    const key = field.key.trim();
    const label = field.label.trim();
    if (!key || !field.label.trim()) {
      return "Each parameter needs a name.";
    }
    if (!/^[a-z][a-z0-9_]{0,79}$/.test(key)) {
      return "A parameter has an invalid internal key. Remove that row and add it again.";
    }
    if (keys.has(key) || labels.has(label.toLocaleLowerCase())) {
      return "Each parameter name must be unique.";
    }
    keys.add(key);
    labels.add(label.toLocaleLowerCase());
  }
  return null;
}

function addGeneratedKeys(fields: readonly StepParameterDefinition[]) {
  const usedKeys = new Set(fields.map((field) => field.key.trim()).filter(Boolean));
  return fields.map((field) => {
    if (field.key.trim()) return field;

    const baseKey = normalizeStepParameterKey(field.label);
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey.slice(0, 76)}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);
    return { ...field, key };
  });
}

export function StepParametersEditor({
  step,
  processName,
  canEdit,
  onSave
}: {
  step: ProcessStep;
  processName: string;
  canEdit: boolean;
  onSave: UpdateStepParametersAction;
}) {
  const [schema, setSchema] = useState<Json>(step.parameters_schema);
  const [fields, setFields] = useState(() => readStepParameterDefinitions(step.parameters_schema));
  const [revision, setRevision] = useState(step.revision);
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const backHref = `/process-flow?${new URLSearchParams({ processId: step.template_id }).toString()}`;
  const parameterCountLabel = useMemo(
    () => `${fields.length} ${fields.length === 1 ? "parameter" : "parameters"}`,
    [fields.length]
  );

  const updateField = <Key extends keyof StepParameterDefinition>(
    id: string,
    key: Key,
    value: StepParameterDefinition[Key]
  ) => {
    setFields((current) => current.map((field) => field.id === id ? { ...field, [key]: value } : field));
    setIsDirty(true);
    setMessage(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || isPending || !isDirty) {
      return;
    }

    const normalizedFields = addGeneratedKeys(fields);
    const validationError = validateParameters(normalizedFields);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    const nextSchema = writeStepParameterDefinitions(schema, normalizedFields);
    startTransition(async () => {
      const result = await onSave({
        stepId: step.id,
        expectedRevision: revision,
        parametersSchema: nextSchema
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      setSchema(result.data.parameters_schema);
      setFields(readStepParameterDefinitions(result.data.parameters_schema));
      setRevision(result.data.revision);
      setIsDirty(false);
      setMessage("Step parameters saved.");
    });
  };

  return (
    <main className="mx-auto grid min-w-0 w-full max-w-7xl gap-5 p-4 md:p-8">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-2 text-[13px] font-semibold text-[#5f5f58] outline-none hover:text-[#151512] focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#151512]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Process Flow
      </Link>

      <header className="flex flex-col gap-4 border-b border-[#e5e5df] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#85857d]">{processName}</p>
          <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-0.03em] text-[#151512]">{step.name} parameters</h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-[#686861]">
            These fields appear whenever a wafer or die enters this step.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[12px] font-medium text-[#77776f] sm:pb-0.5">
          <span>{parameterCountLabel}</span>
          <span aria-hidden="true" className="text-[#c4c4bc]">·</span>
          <span>Revision {revision}</span>
        </div>
      </header>

      <form onSubmit={submit} className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[#151512]">Step template</h2>
            <p className="mt-0.5 text-[12px] text-[#85857d]">
              One row per field. Values remain specific to each wafer or die.
            </p>
          </div>
          {!canEdit ? <p className="text-[12px] font-medium text-[#77776f]">Read-only</p> : null}
        </div>

        <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#dcdcd5] bg-[#fefefd]" aria-label="Step parameter definitions">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
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
                {fields.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="h-28 px-5 text-center">
                      <p className="text-[13px] font-semibold text-[#4a4a44]">No parameter rows yet</p>
                      <p className="mt-1 text-[12px] text-[#85857d]">Add a row for each value operators should record.</p>
                    </td>
                  </tr>
                ) : fields.map((field, index) => (
                  <tr key={field.id} className="group border-b border-[#e5e5df] last:border-b-0 hover:bg-[#fbfbf8]">
                    <th scope="row" className="h-11 border-r border-[#e5e5df] bg-[#f7f7f3] text-center text-[11px] font-medium tabular-nums text-[#8b8b83]">
                      {index + 1}
                    </th>
                    <td className="border-r border-[#e5e5df] p-0">
                      <input
                        className={cellInputClassName}
                        aria-label={`Parameter ${index + 1} label`}
                        value={field.label}
                        disabled={!canEdit}
                        placeholder="Exposure time"
                        onChange={(event) => updateField(field.id, "label", event.currentTarget.value)}
                      />
                    </td>
                    <td className="border-r border-[#e5e5df] p-0">
                      <input
                        className={cellInputClassName}
                        aria-label={`${field.label || `Parameter ${index + 1}`} value`}
                        value={field.defaultValue ?? ""}
                        disabled={!canEdit}
                        placeholder="Enter default value"
                        onChange={(event) => updateField(field.id, "defaultValue", event.currentTarget.value)}
                      />
                    </td>
                    <td className="border-r border-[#e5e5df] p-0">
                      <input
                        className={cellInputClassName}
                        aria-label={`${field.label || `Parameter ${index + 1}`} notes`}
                        value={field.description}
                        disabled={!canEdit}
                        placeholder="Add a note"
                        onChange={(event) => updateField(field.id, "description", event.currentTarget.value)}
                      />
                    </td>
                    <td className="p-0 text-center">
                      {canEdit ? (
                        <button
                          type="button"
                          className="grid size-10 place-items-center text-[#8a8a82] transition-colors hover:bg-[#f2e8e6] hover:text-[#9c3028] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#151512]"
                          aria-label={`Delete parameter ${field.label || index + 1}`}
                          onClick={() => {
                            setFields((current) => current.filter((candidate) => candidate.id !== field.id));
                            setIsDirty(true);
                            setMessage(null);
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit ? (
            <button
              type="button"
              className="flex h-10 w-full items-center gap-2 border-t border-[#dcdcd5] bg-[#f8f8f4] px-3 text-left text-[12px] font-semibold text-[#55554f] transition-colors hover:bg-[#f1f1eb] hover:text-[#1f1f1b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#151512]"
              onClick={() => {
                setFields((current) => [...current, makeParameter()]);
                setIsDirty(true);
                setMessage(null);
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add row
            </button>
          ) : null}
        </section>

        <div className="flex min-h-10 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-[13px] ${message === "Step parameters saved." ? "text-[#397146]" : "text-[#9c3028]"}`} role="status">
            {message}
          </p>
          {canEdit ? (
            <button
              type="submit"
              disabled={!isDirty || isPending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#151512] px-4 text-[13px] font-semibold text-[#f8fafc] hover:bg-[#30302b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#151512] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save className="size-4" aria-hidden="true" />
              {isPending ? "Saving…" : "Save parameters"}
            </button>
          ) : null}
        </div>
      </form>
    </main>
  );
}
