"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent, PointerEvent } from "react";
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
type CellUpdate = { key: ParameterCellKey; value: string };

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

function getFieldIndex(field: VisibleParameterField) {
  return parameterRows.findIndex((row) => row.field === field);
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

function getCellCoordinates(key: ParameterCellKey) {
  const parsed = parseCellKey(key);
  if (!parsed) {
    return null;
  }

  return {
    ...parsed,
    fieldIndex: getFieldIndex(parsed.field)
  };
}

function getRectangularSelection(startKey: ParameterCellKey, endKey: ParameterCellKey) {
  const start = getCellCoordinates(startKey);
  const end = getCellCoordinates(endKey);
  if (!start || !end || start.fieldIndex < 0 || end.fieldIndex < 0) {
    return [endKey];
  }

  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minColumn = Math.min(start.column, end.column);
  const maxColumn = Math.max(start.column, end.column);
  const minFieldIndex = Math.min(start.fieldIndex, end.fieldIndex);
  const maxFieldIndex = Math.max(start.fieldIndex, end.fieldIndex);
  const selectedKeys: ParameterCellKey[] = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let fieldIndex = minFieldIndex; fieldIndex <= maxFieldIndex; fieldIndex += 1) {
      const field = parameterRows[fieldIndex]?.field;
      if (!field) {
        continue;
      }

      for (let column = minColumn; column <= maxColumn; column += 1) {
        selectedKeys.push(getCellKey(row, column, field));
      }
    }
  }

  return selectedKeys;
}

function getRowSectionSelection(row: number) {
  const selectedKeys: ParameterCellKey[] = [];
  for (const parameterRow of parameterRows) {
    for (let column = 1; column <= chipColumns.length; column += 1) {
      selectedKeys.push(getCellKey(row, column, parameterRow.field));
    }
  }
  return selectedKeys;
}

function getSelectionBounds(keys: ParameterCellKey[]) {
  const coordinates = keys
    .map((key) => getCellCoordinates(key))
    .filter((coordinate): coordinate is NonNullable<typeof coordinate> => Boolean(coordinate));

  if (coordinates.length === 0) {
    return null;
  }

  return {
    minRow: Math.min(...coordinates.map((coordinate) => coordinate.row)),
    maxRow: Math.max(...coordinates.map((coordinate) => coordinate.row)),
    minColumn: Math.min(...coordinates.map((coordinate) => coordinate.column)),
    maxColumn: Math.max(...coordinates.map((coordinate) => coordinate.column)),
    minFieldIndex: Math.min(...coordinates.map((coordinate) => coordinate.fieldIndex)),
    maxFieldIndex: Math.max(...coordinates.map((coordinate) => coordinate.fieldIndex))
  };
}

function parseClipboardTable(text: string) {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
  if (!normalizedText) {
    return [];
  }

  return normalizedText.split("\n").map((line) => line.split("\t"));
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
  const [selectedCellKeys, setSelectedCellKeys] = useState<ParameterCellKey[]>([]);
  const [anchorCellKey, setAnchorCellKey] = useState<ParameterCellKey | null>(null);
  const [activeCellKey, setActiveCellKey] = useState<ParameterCellKey | null>(null);
  const pendingCellsRef = useRef<Map<ParameterCellKey, string>>(new Map());
  const saveTimerRef = useRef<number | null>(null);
  const isDraggingSelectionRef = useRef(false);
  const selectedCellSet = useMemo(() => new Set(selectedCellKeys), [selectedCellKeys]);

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

  const queueCellSaves = useCallback(
    (updates: CellUpdate[]) => {
      if (!canPersist) {
        setSaveState("error");
        return;
      }

      for (const update of updates) {
        pendingCellsRef.current.set(update.key, update.value);
      }

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

  useEffect(() => {
    const endSelectionDrag = () => {
      isDraggingSelectionRef.current = false;
    };

    window.addEventListener("pointerup", endSelectionDrag);
    window.addEventListener("pointercancel", endSelectionDrag);

    return () => {
      window.removeEventListener("pointerup", endSelectionDrag);
      window.removeEventListener("pointercancel", endSelectionDrag);
    };
  }, []);

  const getCellValue = useCallback(
    (row: number, column: number, field: VisibleParameterField) => {
      const key = getCellKey(row, column, field);
      return draftValues[key] ?? getPersistedOrDefaultValue(key);
    },
    [draftValues, getPersistedOrDefaultValue]
  );

  const applyCellUpdates = useCallback(
    (updates: CellUpdate[]) => {
      if (updates.length === 0) {
        return;
      }

      if (!canPersist) {
        setSaveState("error");
        return;
      }

      setDraftValues((current) => {
        const next = { ...current };
        for (const update of updates) {
          next[update.key] = update.value;
        }
        return next;
      });
      queueCellSaves(updates);
    },
    [canPersist, queueCellSaves]
  );

  const handleCellChange = (
    row: number,
    column: number,
    field: VisibleParameterField,
    value: string
  ) => {
    const key = getCellKey(row, column, field);
    applyCellUpdates([{ key, value }]);
  };

  const selectCellRange = useCallback((startKey: ParameterCellKey, endKey: ParameterCellKey) => {
    setSelectedCellKeys(getRectangularSelection(startKey, endKey));
    setActiveCellKey(endKey);
  }, []);

  const selectRowSection = useCallback((row: number) => {
    const rowSelection = getRowSectionSelection(row);
    setSelectedCellKeys(rowSelection);
    setAnchorCellKey(rowSelection[0] ?? null);
    setActiveCellKey(rowSelection[0] ?? null);
  }, []);

  const getClipboardText = useCallback(
    (keys: ParameterCellKey[]) => {
      const bounds = getSelectionBounds(keys);
      if (!bounds) {
        return "";
      }

      const lines: string[] = [];
      for (let row = bounds.minRow; row <= bounds.maxRow; row += 1) {
        for (let fieldIndex = bounds.minFieldIndex; fieldIndex <= bounds.maxFieldIndex; fieldIndex += 1) {
          const field = parameterRows[fieldIndex]?.field;
          if (!field) {
            continue;
          }

          const values: string[] = [];
          for (let column = bounds.minColumn; column <= bounds.maxColumn; column += 1) {
            values.push(getCellValue(row, column, field));
          }
          lines.push(values.join("\t"));
        }
      }

      return lines.join("\n");
    },
    [getCellValue]
  );

  const getPasteOrigin = useCallback(() => {
    if (activeCellKey) {
      return getCellCoordinates(activeCellKey);
    }

    const bounds = getSelectionBounds(selectedCellKeys);
    if (!bounds) {
      return null;
    }

    const field = parameterRows[bounds.minFieldIndex]?.field;
    if (!field) {
      return null;
    }

    return {
      row: bounds.minRow,
      column: bounds.minColumn,
      field,
      fieldIndex: bounds.minFieldIndex
    };
  }, [activeCellKey, selectedCellKeys]);

  const handleCopy = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (selectedCellKeys.length <= 1) {
        return;
      }

      const clipboardText = getClipboardText(selectedCellKeys);
      if (!clipboardText) {
        return;
      }

      event.preventDefault();
      event.clipboardData.setData("text/plain", clipboardText);
    },
    [getClipboardText, selectedCellKeys]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const clipboardText = event.clipboardData.getData("text/plain");
      const pastedRows = parseClipboardTable(clipboardText);
      const isMatrixPaste = pastedRows.length > 1 || pastedRows.some((row) => row.length > 1);
      const shouldFillSelection = selectedCellKeys.length > 1 && pastedRows.length === 1 && pastedRows[0]?.length === 1;

      if (!isMatrixPaste && !shouldFillSelection) {
        return;
      }

      const origin = getPasteOrigin();
      if (!origin) {
        return;
      }

      event.preventDefault();

      const updates: CellUpdate[] = [];
      if (shouldFillSelection) {
        const value = pastedRows[0]?.[0] ?? "";
        for (const key of selectedCellKeys) {
          updates.push({ key, value });
        }
      } else {
        for (let pastedRowIndex = 0; pastedRowIndex < pastedRows.length; pastedRowIndex += 1) {
          const fieldIndex = origin.fieldIndex + pastedRowIndex;
          const field = parameterRows[fieldIndex]?.field;
          if (!field) {
            continue;
          }

          for (let pastedColumnIndex = 0; pastedColumnIndex < pastedRows[pastedRowIndex].length; pastedColumnIndex += 1) {
            const column = origin.column + pastedColumnIndex;
            if (column < 1 || column > chipColumns.length) {
              continue;
            }

            updates.push({
              key: getCellKey(origin.row, column, field),
              value: pastedRows[pastedRowIndex][pastedColumnIndex]
            });
          }
        }
      }

      applyCellUpdates(updates);
      setSelectedCellKeys(updates.map((update) => update.key));
      setAnchorCellKey(updates[0]?.key ?? activeCellKey);
      setActiveCellKey(updates[0]?.key ?? activeCellKey);
    },
    [activeCellKey, applyCellUpdates, getPasteOrigin, selectedCellKeys]
  );

  const handleCellPointerDown = useCallback(
    (event: PointerEvent<HTMLTableCellElement>, key: ParameterCellKey) => {
      isDraggingSelectionRef.current = true;

      if (event.shiftKey && anchorCellKey) {
        selectCellRange(anchorCellKey, key);
        return;
      }

      setSelectedCellKeys([key]);
      setAnchorCellKey(key);
      setActiveCellKey(key);
    },
    [anchorCellKey, selectCellRange]
  );

  const handleCellPointerEnter = useCallback(
    (key: ParameterCellKey) => {
      if (!isDraggingSelectionRef.current || !anchorCellKey) {
        return;
      }

      selectCellRange(anchorCellKey, key);
    },
    [anchorCellKey, selectCellRange]
  );

  const handleCellFocus = useCallback((key: ParameterCellKey) => {
    if (isDraggingSelectionRef.current) {
      return;
    }

    setSelectedCellKeys([key]);
    setAnchorCellKey(key);
    setActiveCellKey(key);
  }, []);

  const handleCellKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, key: ParameterCellKey) => {
      if (!event.shiftKey) {
        return;
      }

      const coordinates = getCellCoordinates(key);
      if (!coordinates) {
        return;
      }

      let nextKey: ParameterCellKey | null = null;
      if (event.key === "ArrowRight") {
        nextKey = getCellKey(coordinates.row, Math.min(chipColumns.length, coordinates.column + 1), coordinates.field);
      } else if (event.key === "ArrowLeft") {
        nextKey = getCellKey(coordinates.row, Math.max(1, coordinates.column - 1), coordinates.field);
      } else if (event.key === "ArrowDown") {
        const nextField = parameterRows[Math.min(parameterRows.length - 1, coordinates.fieldIndex + 1)]?.field;
        nextKey = nextField ? getCellKey(coordinates.row, coordinates.column, nextField) : null;
      } else if (event.key === "ArrowUp") {
        const nextField = parameterRows[Math.max(0, coordinates.fieldIndex - 1)]?.field;
        nextKey = nextField ? getCellKey(coordinates.row, coordinates.column, nextField) : null;
      }

      if (!nextKey) {
        return;
      }

      event.preventDefault();
      if (!anchorCellKey) {
        setAnchorCellKey(key);
      }
      selectCellRange(anchorCellKey ?? key, nextKey);
    },
    [anchorCellKey, selectCellRange]
  );

  const isWholeRowSectionSelected = (row: number) => {
    const rowSelection = getRowSectionSelection(row);
    return rowSelection.every((key) => selectedCellSet.has(key));
  };

  return (
    <DetailCard title="Fabrication parameters" className="lg:col-span-3">
      <div className="grid gap-5" onCopy={handleCopy} onPaste={handlePaste}>
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
                  <button
                    type="button"
                    aria-label={`Select all ${section.id} parameter cells`}
                    onClick={() => selectRowSection(Number(section.id.replace("R", "")))}
                    className={[
                      "rounded-sm text-[15px] font-semibold text-[#111111] outline-none transition-colors",
                      "hover:text-[#33332f] focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2",
                      isWholeRowSectionSelected(Number(section.id.replace("R", ""))) ? "bg-[#f2f2ee] px-1" : ""
                    ].join(" ")}
                  >
                    {section.id} chip row
                  </button>
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
                          const cellKey = getCellKey(rowNumber, columnNumber, row.field);
                          const isCellSelected = selectedCellSet.has(cellKey);
                          const isActiveCell = activeCellKey === cellKey;
                          return (
                            <td
                              key={cellKey}
                              onPointerDown={(event) => handleCellPointerDown(event, cellKey)}
                              onPointerEnter={() => handleCellPointerEnter(cellKey)}
                              className={[
                                "px-1 py-1.5 text-center",
                                isCellSelected ? "bg-[#f6f6f2]" : "",
                                isActiveCell ? "outline outline-2 -outline-offset-2 outline-[#111111]" : isCellSelected ? "outline outline-1 -outline-offset-1 outline-[#b6b6ad]" : ""
                              ].join(" ")}
                            >
                              <input
                                type="text"
                                inputMode={row.field === "pulseCount" ? "numeric" : "decimal"}
                                aria-label={`${chipId}, ${row.label}`}
                                value={getCellValue(rowNumber, columnNumber, row.field)}
                                disabled={!canPersist}
                                onFocus={() => handleCellFocus(cellKey)}
                                onKeyDown={(event) => handleCellKeyDown(event, cellKey)}
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
