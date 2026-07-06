"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { updateWaferDiePolingParameters } from "@/features/wafers/actions";
import type { DiePolingParameterField, WaferStatusTileModel } from "../../types";
import { DetailCard } from "./DetailCard";

const recipeDetails = [
  ["Recipe", "TFA3 .1M 1R1"],
  ["Performed by", "Saeed / Lai / William"],
  ["Fabricated by", "Saeed"],
  ["Stack", "1 mm PPLN on TFLN-3"],
  ["Electrode", "sharp-sharp"],
  ["Wafer EBL", "May 28"],
  ["Poling date", "Pending"],
  ["Wafer ID", "TFLN-3"]
] as const;

const parameterRows = [
  { label: "Voltage (mV)", field: "voltage" },
  { label: "Pulse Width (ms)", field: "width" },
  { label: "# of Pulses", field: "pulseCount" },
  { label: "Post-pulse voltage", field: "postPulseVoltage" },
  { label: "Post-pulse width", field: "postPulseWidth" }
] as const;

type VisibleParameterField = (typeof parameterRows)[number]["field"];
type ParameterCellKey = `R${number}:C${number}:${VisibleParameterField}`;
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const chipColumns = Array.from({ length: 15 }, (_, index) => `C${index + 1}`);
const PARAMETER_SAVE_DEBOUNCE_MS = 1100;
const DIE_CODE_PATTERN = /^[A-Z][1-8]-V\d+$/;
const SHORT_DIE_CODE_PATTERN = /^[A-Z][1-8]$/;

const chipRowSections = [
  {
    id: "R1",
    label: "Row 1",
    period: "2.5",
    gap: "20 micron",
    variant: "sharp-sharp LN 0.5 micron",
    note: "Ramp check pending before poling.",
    values: {
      voltage: ["520", "520", "520", "520", "510", "510", "510", "510", "500", "500", "500", "500", "490", "490", "490"],
      width: ["10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10"],
      pulseCount: ["5", "10", "15", "20", "25", "30", "35", "40", "5", "10", "15", "20", "25", "30", "35"],
      postPulseVoltage: ["300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300"],
      postPulseWidth: ["250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250"]
    }
  },
  {
    id: "R2",
    label: "Row 2",
    period: "2.5",
    gap: "20 micron",
    variant: "sharp-sharp LN 0.5 micron",
    note: "R2C7 selected for measurement review.",
    values: {
      voltage: ["510", "510", "510", "510", "510", "510", "510", "510", "500", "500", "500", "500", "500", "500", "500"],
      width: ["10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10"],
      pulseCount: ["5", "10", "15", "20", "25", "30", "35", "40", "5", "10", "15", "20", "25", "30", "35"],
      postPulseVoltage: ["300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300"],
      postPulseWidth: ["250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250"]
    }
  },
  {
    id: "R3",
    label: "Row 3",
    period: "2.5",
    gap: "20 micron",
    variant: "sharp-sharp LN 0.5 micron",
    note: "No row notes yet.",
    values: {
      voltage: ["500", "500", "500", "500", "490", "490", "490", "490", "480", "480", "480", "480", "470", "470", "470"],
      width: ["10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10"],
      pulseCount: ["5", "10", "15", "20", "25", "30", "35", "40", "5", "10", "15", "20", "25", "30", "35"],
      postPulseVoltage: ["300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300"],
      postPulseWidth: ["250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250"]
    }
  }
] as const;

function getCellKey(row: number, column: number, field: VisibleParameterField): ParameterCellKey {
  return `R${row}:C${column}:${field}`;
}

function isVisibleParameterField(value: string): value is VisibleParameterField {
  return parameterRows.some((row) => row.field === value);
}

function parseCellKey(key: string) {
  const match = key.match(/^R(\d+):C(\d+):([^:]+)$/);
  if (!match || !isVisibleParameterField(match[3])) {
    return null;
  }

  return {
    row: Number(match[1]),
    column: Number(match[2]),
    field: match[3]
  };
}

function getPersistenceDieCode(tile?: WaferStatusTileModel) {
  const candidate = (tile?.dieLabel || tile?.code || "").trim().toUpperCase();
  if (DIE_CODE_PATTERN.test(candidate)) {
    return candidate;
  }

  if (SHORT_DIE_CODE_PATTERN.test(candidate)) {
    return `${candidate}-V1`;
  }

  return null;
}

function getDefaultValue(row: number, column: number, field: VisibleParameterField) {
  const section = chipRowSections.find((candidate) => candidate.id === `R${row}`);
  return section?.values[field][column - 1] ?? "";
}

function getSavedValue(
  tile: WaferStatusTileModel | undefined,
  dieCode: string | null,
  row: number,
  column: number,
  field: DiePolingParameterField
) {
  if (!tile || !dieCode) {
    return undefined;
  }

  return tile.diePolingParameters?.[dieCode]?.[`R${row}`]?.[`C${column}`]?.[field];
}

function getSaveLabel(saveState: SaveState, canPersist: boolean) {
  if (!canPersist) return "Read only";
  if (saveState === "pending") return "Pending changes";
  if (saveState === "saving") return "Saving...";
  if (saveState === "saved") return "Saved";
  if (saveState === "error") return "Save failed";
  return "Editable";
}

export function ParametersTableCard({ tile }: { tile?: WaferStatusTileModel }) {
  const dieCode = useMemo(() => getPersistenceDieCode(tile), [tile]);
  const canPersist = Boolean(tile?.waferId && dieCode);
  const [draftValues, setDraftValues] = useState<Record<ParameterCellKey, string>>({});
  const [savedOverrides, setSavedOverrides] = useState<Record<ParameterCellKey, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const pendingCellsRef = useRef<Map<ParameterCellKey, string>>(new Map());
  const saveTimerRef = useRef<number | null>(null);

  const getPersistedOrDefaultValue = useCallback(
    (key: ParameterCellKey) => {
      const parsed = parseCellKey(key);
      if (!parsed) {
        return "";
      }

      return (
        savedOverrides[key] ??
        getSavedValue(tile, dieCode, parsed.row, parsed.column, parsed.field) ??
        getDefaultValue(parsed.row, parsed.column, parsed.field)
      );
    },
    [dieCode, savedOverrides, tile]
  );

  const flushPendingCells = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const queuedEntries = [...pendingCellsRef.current.entries()];
    pendingCellsRef.current.clear();

    if (!canPersist || !tile?.waferId || !dieCode || queuedEntries.length === 0) {
      setSaveState(canPersist ? "idle" : "error");
      return;
    }

    const updates = queuedEntries
      .map(([key, value]) => {
        const parsed = parseCellKey(key);
        if (!parsed || value === getPersistedOrDefaultValue(key)) {
          return null;
        }

        return { key, value, ...parsed };
      })
      .filter((update): update is {
        key: ParameterCellKey;
        value: string;
        row: number;
        column: number;
        field: VisibleParameterField;
      } => update !== null);

    if (updates.length === 0) {
      setSaveState("idle");
      return;
    }

    setSaveState("saving");
    const result = await updateWaferDiePolingParameters({
      waferId: tile.waferId,
      dieCode,
      updates: updates.map(({ row, column, field, value }) => ({
        row,
        column,
        field,
        value
      }))
    });

    if (result.ok) {
      setSavedOverrides((current) => {
        const next = { ...current };
        for (const update of updates) {
          next[update.key] = update.value;
        }
        return next;
      });
      setSaveState("saved");
    } else {
      for (const update of updates) {
        pendingCellsRef.current.set(update.key, update.value);
      }
      setSaveState("error");
    }
  }, [canPersist, dieCode, getPersistedOrDefaultValue, tile]);

  const queueCellSave = useCallback(
    (key: ParameterCellKey, value: string) => {
      if (!canPersist) {
        setSaveState("error");
        return;
      }

      pendingCellsRef.current.set(key, value);
      setSaveState("pending");

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = window.setTimeout(() => {
        void flushPendingCells();
      }, PARAMETER_SAVE_DEBOUNCE_MS);
    },
    [canPersist, flushPendingCells]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const getCellValue = (
    row: number,
    column: number,
    field: VisibleParameterField
  ) => {
    const key = getCellKey(row, column, field);
    return draftValues[key] ?? getPersistedOrDefaultValue(key);
  };

  const handleCellChange = (
    row: number,
    column: number,
    field: VisibleParameterField,
    value: string
  ) => {
    const key = getCellKey(row, column, field);
    setDraftValues((current) => ({
      ...current,
      [key]: value
    }));
    queueCellSave(key, value);
  };

  return (
    <DetailCard title="Fabrication parameters" className="lg:col-span-3">
      <div className="grid gap-5">
        <div className="grid gap-y-4 border-y border-[#eeeeea] py-4 sm:grid-cols-2 lg:grid-cols-4">
          {recipeDetails.map(([label, value]) => (
            <div key={label} className="min-w-0 pr-5">
              <p className="text-[12px] font-semibold text-[#8a887b]">{label}</p>
              <p className="mt-1 truncate text-[14px] font-semibold leading-5 text-[#44443f]">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-8">
          {chipRowSections.map((section) => (
            <section key={section.id} className="grid gap-2">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex min-w-0 items-baseline gap-3">
                  <h4 className="text-[15px] font-semibold text-[#111111]">{section.id} chip row</h4>
                  <p className="text-[13px] font-semibold text-[#8a887b]">{section.label}</p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold text-[#777770]">
                  <span>Period {section.period}</span>
                  <span>Gap {section.gap}</span>
                  <span>{section.variant}</span>
                  <span>{getSaveLabel(saveState, canPersist)}</span>
                </div>
              </div>

              <div className="overflow-hidden">
                <table className="w-full table-fixed border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[#e7e7dc] text-[#8a887b]">
                      <th className="w-[132px] bg-white py-2 pr-3 font-semibold">
                        Parameter
                      </th>
                      {chipColumns.map((column) => {
                        const chipId = `${section.id}${column}`;
                        return (
                          <th
                            key={chipId}
                            className={[
                              "px-1 py-2 text-center text-[11px] font-semibold",
                              chipId === "R2C7" ? "border-b border-[#111111] text-[#111111]" : ""
                            ].join(" ")}
                          >
                            {chipId}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {parameterRows.map((row) => (
                      <tr key={`${section.id}-${row.label}`} className="border-b border-[#e7e7e2] last:border-b-0">
                        <th className="bg-white py-2 pr-3 text-[12px] font-semibold leading-4 text-[#4a483f]">
                          {row.label}
                        </th>
                        {section.values[row.field].map((_, index) => {
                          const rowNumber = Number(section.id.replace("R", ""));
                          const columnNumber = index + 1;
                          const chipId = `${section.id}${chipColumns[index]}`;
                          const isSelected = chipId === "R2C7" && row.label === "# of Pulses";
                          return (
                            <td
                              key={`${section.id}-${row.label}-${chipColumns[index]}`}
                              className="px-1 py-1.5 text-center"
                            >
                              <input
                                type="text"
                                inputMode={row.field === "pulseCount" ? "numeric" : "decimal"}
                                aria-label={`${chipId}, ${row.label}`}
                                value={getCellValue(rowNumber, columnNumber, row.field)}
                                disabled={!canPersist}
                                onChange={(event) => handleCellChange(rowNumber, columnNumber, row.field, event.target.value)}
                                onBlur={() => {
                                  if (pendingCellsRef.current.size > 0) {
                                    void flushPendingCells();
                                  }
                                }}
                                className={[
                                  "h-7 w-full rounded-sm border border-transparent bg-transparent px-0.5 text-center text-[13px] font-semibold outline-none transition-colors",
                                  "text-[#4a483f] hover:border-[#e1e1dc] hover:bg-[#fafafa] focus:border-[#111111] focus:bg-white",
                                  "disabled:cursor-not-allowed disabled:text-[#777770]",
                                  isSelected ? "text-[#111111]" : ""
                                ].join(" ")}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eeeeea] pb-5 pt-1">
                <p className="text-[13px] font-medium leading-5 text-[#66665f]">
                  <span className="font-semibold text-[#44443f]">Row notes:</span> {section.note}
                </p>
                <button
                  type="button"
                  className="h-9 rounded-lg border border-[#e1e1dc] bg-white px-3 text-[13px] font-semibold text-[#44443f] hover:bg-[#fafafa]"
                >
                  + Add row note
                </button>
              </div>
            </section>
          ))}
        </div>
      </div>
    </DetailCard>
  );
}
