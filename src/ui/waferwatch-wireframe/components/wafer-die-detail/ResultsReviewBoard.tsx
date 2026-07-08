"use client";

import {
  type ClipboardEvent as ReactClipboardEvent,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useDropzone } from "react-dropzone";
import {
  createDieInspection,
  deleteDieInspection,
  listDieInspectionsForDie,
  type DieInspectionRecord
} from "@/features/inspections/actions";
import { getTextSurface, upsertTextSurface } from "@/features/text-surfaces/actions";
import { createClient } from "@/lib/supabase/client";
import type { WaferStatusTileModel } from "../../types";
import {
  ChevronLeftIcon,
  ChevronRightIcon
} from "../../icons";
import {
  buildToneMap,
  chipColumns,
  chipRowSections,
  getDisplayParameterValue,
  getPersistenceDieCode,
  parameterRows,
  parameterTonePalettes,
  type VisibleParameterField
} from "./ParametersTableCard";

type ResultSample = {
  id: string;
  row: number;
  column: number;
  uniformityPercent: string;
};

type SampleInspectionMap = Record<string, DieInspectionRecord[]>;

type PendingDeletion = {
  inspection: DieInspectionRecord;
  sampleId: string;
  sampleIndex: number;
  imageIndex: number;
  timeoutId: number;
};

const RESULT_SAMPLE_SCOPE_TYPE = "wireframe:result_sample";
const RESULT_SAMPLE_UNIFORMITY_FIELD = "uniformity_percent";
const INSPECTION_BUCKET = "wafer-process-files";
const recipeCode = "TFA3.1M1R1";
const GALLERY_VISIBLE_COUNT = 5;
const DELETE_UNDO_DELAY_MS = 3500;
const maxGalleryStartColumn = Math.max(1, chipColumns.length - GALLERY_VISIBLE_COUNT + 1);

function buildSamples() {
  return chipRowSections.flatMap((section) => {
    const row = Number(section.id.replace("R", ""));
    return chipColumns.map((columnLabel): ResultSample => {
      const column = Number(columnLabel.replace("C", ""));

      return {
        id: `R${row}C${column}`,
        row,
        column,
        uniformityPercent: `${Math.min(99.9, 86 + row * 1.2 + column * 0.45).toFixed(1)}`
      };
    });
  });
}

const resultSamples = buildSamples();

function getGalleryWindowStartForColumn(column: number) {
  return Math.min(maxGalleryStartColumn, Math.max(1, column - Math.floor(GALLERY_VISIBLE_COUNT / 2)));
}

function ensureColumnInGalleryWindow(currentStart: number, column: number) {
  if (column < currentStart) {
    return column;
  }

  if (column >= currentStart + GALLERY_VISIBLE_COUNT) {
    return Math.min(maxGalleryStartColumn, column - GALLERY_VISIBLE_COUNT + 1);
  }

  return currentStart;
}

function getSampleMetricKey(tile: WaferStatusTileModel, sample: ResultSample) {
  const dieCode = tile.dieLabel || tile.code;
  return `${tile.waferId}:${dieCode}:R${sample.row}:C${sample.column}`;
}

function getSampleInspectionKey(row: number, column: number) {
  return `R${row}C${column}`;
}

function mergeUniqueInspections(
  existing: readonly DieInspectionRecord[],
  incoming: readonly DieInspectionRecord[]
) {
  const merged = new Map<string, DieInspectionRecord>();

  for (const inspection of [...existing, ...incoming]) {
    merged.set(inspection.id, inspection);
  }

  return Array.from(merged.values());
}

function getFileExtension(file: File) {
  return file.type === "image/jpeg" ? "jpg" : "png";
}

function normalizeImageFile(file: File) {
  if (file.type === "image/png" || file.type === "image/jpeg") {
    return file;
  }

  throw new Error("Use PNG or JPEG images for result uploads.");
}

function getClipboardImageFiles(event: ReactClipboardEvent<HTMLElement> | ClipboardEvent) {
  return Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function buildDisplayToneMaps(tile: WaferStatusTileModel) {
  return Object.fromEntries(
    parameterRows.map((parameterRow) => {
      const values = chipRowSections.flatMap((section) => {
        const row = Number(section.id.replace("R", ""));
        return chipColumns.map((columnLabel) =>
          getDisplayParameterValue(tile, row, Number(columnLabel.replace("C", "")), parameterRow.field)
        );
      });
      return [parameterRow.field, buildToneMap(values, parameterTonePalettes[parameterRow.field])];
    })
  ) as Record<VisibleParameterField, Map<string, string>>;
}

function getParameterToneClass(
  toneMaps: Record<VisibleParameterField, Map<string, string>>,
  field: VisibleParameterField,
  value: string
) {
  return toneMaps[field].get(value.trim()) ?? "";
}

const ResultImage = memo(function ResultImage({
  imageUrl,
  isActive = true,
  className = ""
}: {
  imageUrl?: string | null;
  isActive?: boolean;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <div
        className={[
          "overflow-hidden rounded-md border border-[#d8d8d2] bg-[#f7f7f3] shadow-inner",
          isActive ? "" : "pointer-events-none absolute inset-0 opacity-0",
          className
        ].join(" ")}
        aria-hidden={!isActive}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-contain"
          decoding="async"
          fetchPriority={isActive ? "high" : "low"}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className={["grid place-items-center rounded-md border border-dashed border-[#d8d8d2] bg-[#f7f7f3] text-[#777770]", className].join(" ")}>
      <span className="text-[18px]">+</span>
    </div>
  );
});

function ResultImageStack({
  inspections,
  activeIndex,
  className = ""
}: {
  inspections: readonly DieInspectionRecord[];
  activeIndex: number;
  className?: string;
}) {
  if (inspections.length === 0) {
    return <ResultImage className={className} />;
  }

  return (
    <div className={["relative", className].join(" ")}>
      {inspections.map((inspection, index) => (
        <ResultImage
          key={inspection.id}
          imageUrl={inspection.imageUrl}
          isActive={index === activeIndex}
          className="h-full w-full"
        />
      ))}
    </div>
  );
}

const GalleryTile = memo(function GalleryTile({
  sample,
  inspections,
  imageIndex,
  imageOrdinal,
  imageCount,
  uniformityValue,
  selected,
  canEdit,
  onSelect,
  onAddImages,
  onUniformityChange,
  onUniformityBlur
}: {
  sample: ResultSample;
  inspections: readonly DieInspectionRecord[];
  imageIndex: number;
  imageOrdinal: number;
  imageCount: number;
  uniformityValue: string;
  selected: boolean;
  canEdit: boolean;
  onSelect: (sample: ResultSample) => void;
  onAddImages: (sample: ResultSample) => void;
  onUniformityChange: (sample: ResultSample, value: string) => void;
  onUniformityBlur: (sample: ResultSample) => void;
}) {
  const handleImageKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (inspections.length === 0) {
        if (canEdit) {
          onAddImages(sample);
        }
      } else {
        onSelect(sample);
      }
    }
  };

  return (
    <article
      className={[
        "grid min-w-0 overflow-hidden rounded-lg border bg-white transition-colors",
        selected ? "border-[#111111] shadow-[0_0_0_1px_#111111]" : "border-[#e4e4df]"
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => {
          if (inspections.length === 0) {
            if (canEdit) {
              onAddImages(sample);
            }
          } else {
            onSelect(sample);
          }
        }}
        onKeyDown={handleImageKeyDown}
        className="block aspect-[4/3] min-h-0 bg-white p-1.5 text-left"
        aria-pressed={selected}
        aria-label={inspections.length === 0 ? `Add result images to ${sample.id}` : `Select ${sample.id} result sample`}
      >
        <ResultImageStack inspections={inspections} activeIndex={imageIndex} className="h-full w-full" />
      </button>
      <div className="grid gap-2 border-t border-[#eeeeea] px-2 py-2">
        <div className="flex min-w-0 items-center justify-between gap-2 text-[12px] font-semibold">
          <span className="truncate text-[#111111]">{recipeCode} {sample.id}</span>
          <span className="shrink-0 text-[#777770]">{imageCount ? `${imageOrdinal} / ${imageCount}` : "0 / 0"}</span>
        </div>
        <label className="flex h-10 min-w-0 items-center rounded-md border border-[#deded8] bg-[#fbfbf8] px-2.5 shadow-[inset_0_1px_0_rgba(17,17,17,0.03)] transition-colors focus-within:border-[#111111] focus-within:bg-white">
          <span className="select-none text-[11px] font-semibold uppercase tracking-[0.02em] text-[#777770]">Uniformity</span>
          <span className="mx-2 h-4 w-px shrink-0 bg-[#d8d8d2]" aria-hidden="true" />
          <input
            type="text"
            inputMode="decimal"
            value={uniformityValue}
            disabled={!canEdit}
            onChange={(event) => onUniformityChange(sample, event.target.value)}
            onBlur={() => onUniformityBlur(sample)}
            className="min-w-0 flex-1 bg-transparent text-right text-[18px] font-semibold tabular-nums text-[#111111] outline-none selection:bg-[#d8ecff] disabled:text-[#777770]"
            aria-label={`${sample.id} uniformity percentage`}
          />
          <span className="ml-1 select-none text-[15px] font-semibold text-[#777770]">%</span>
        </label>
      </div>
    </article>
  );
});

function ResultsGalleryViewport({
  tile,
  inspectionsBySample,
  imageIndexBySample,
  uniformityBySample,
  row,
  visibleSamples,
  selectedSample,
  selectedImageIndex,
  selectedInspection,
  canEdit,
  isImageBusy,
  imageError,
  isSavingUniformity,
  uniformityError,
  onSelectSample,
  onAddImagesForSample,
  onFilesAdd,
  onDeleteImage,
  onNavigateWindow,
  onUniformityChange,
  onUniformityBlur
}: {
  tile: WaferStatusTileModel;
  inspectionsBySample: SampleInspectionMap;
  imageIndexBySample: Record<string, number>;
  uniformityBySample: Record<string, string>;
  row: number;
  visibleSamples: readonly ResultSample[];
  selectedSample: ResultSample;
  selectedImageIndex: number;
  selectedInspection: DieInspectionRecord | null;
  canEdit: boolean;
  isImageBusy: boolean;
  imageError: string | null;
  isSavingUniformity: boolean;
  uniformityError: string | null;
  onSelectSample: (sample: ResultSample) => void;
  onAddImagesForSample: (sample: ResultSample, openPicker: () => void) => void;
  onFilesAdd: (files: readonly File[]) => void;
  onDeleteImage: () => void;
  onNavigateWindow: (direction: -1 | 1) => void;
  onUniformityChange: (sample: ResultSample, value: string) => void;
  onUniformityBlur: (sample: ResultSample) => void;
}) {
  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"]
    },
    multiple: true,
    noClick: true,
    noKeyboard: true,
    disabled: isImageBusy || !canEdit,
    onDrop: (acceptedFiles) => onFilesAdd(acceptedFiles)
  });

  const handlePaste = (event: ReactClipboardEvent<HTMLElement>) => {
    const files = getClipboardImageFiles(event);
    if (!canEdit || files.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onFilesAdd(files);
  };

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold text-[#111111]">Row {row} result images</h2>
          <p className="mt-1 text-[12px] font-semibold text-[#777770]">
            {selectedSample.id} / image {selectedInspection ? selectedImageIndex + 1 : 0}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-[12px] font-semibold text-[#55554f]">
          <button
            type="button"
            onClick={() => onNavigateWindow(-1)}
            className="grid h-9 w-9 place-items-center rounded-md border border-[#e1e1dc] bg-white hover:bg-[#fafafa]"
            aria-label="Previous image window"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            onClick={() => onNavigateWindow(1)}
            className="grid h-9 w-9 place-items-center rounded-md border border-[#e1e1dc] bg-white hover:bg-[#fafafa]"
            aria-label="Next image window"
          >
            <ChevronRightIcon />
          </button>
          <button
            type="button"
            onClick={onDeleteImage}
            disabled={!canEdit || !selectedInspection}
            className="h-9 rounded-md border border-[#e1e1dc] bg-white px-3 text-[#9b2727] hover:bg-[#fff0ef] disabled:text-[#aaa] disabled:hover:bg-transparent"
          >
            Delete
          </button>
        </div>
      </div>
      <div
        {...getRootProps({
          className: [
            "relative grid gap-2 rounded-lg border border-[#e8e8e3] bg-white p-2 outline-none",
            isDragActive ? "border-[#111111]" : ""
          ].join(" "),
          onPaste: handlePaste
        })}
        tabIndex={0}
      >
        <input {...getInputProps()} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {visibleSamples.map((sample) => {
            const inspections = inspectionsBySample[sample.id] ?? [];
            const imageIndex = Math.min(imageIndexBySample[sample.id] ?? 0, Math.max(inspections.length - 1, 0));
            return (
              <GalleryTile
                key={sample.id}
                sample={sample}
                inspections={inspections}
                imageIndex={imageIndex}
                imageOrdinal={inspections.length ? imageIndex + 1 : 0}
                imageCount={inspections.length}
                uniformityValue={uniformityBySample[getSampleMetricKey(tile, sample)] ?? sample.uniformityPercent}
                selected={sample.id === selectedSample.id}
                canEdit={canEdit}
                onSelect={onSelectSample}
                onAddImages={(nextSample) => onAddImagesForSample(nextSample, open)}
                onUniformityChange={onUniformityChange}
                onUniformityBlur={onUniformityBlur}
              />
            );
          })}
        </div>
        {isDragActive ? (
          <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-md bg-white/80 text-[13px] font-semibold text-[#111111]">
            Release to upload to {selectedSample.id}
          </div>
        ) : null}
      </div>
      {(imageError || uniformityError || isSavingUniformity) ? (
        <p className={["text-[12px] font-semibold", imageError || uniformityError ? "text-[#a33a2b]" : "text-[#777770]"].join(" ")}>
          {imageError ?? uniformityError ?? "Saving uniformity..."}
        </p>
      ) : null}
    </section>
  );
}

function ParameterContext({
  tile,
  selectedSample,
  visibleSamples,
  contextRow
}: {
  tile: WaferStatusTileModel;
  selectedSample: ResultSample;
  visibleSamples: readonly ResultSample[];
  contextRow: number;
}) {
  const toneMaps = useMemo(() => buildDisplayToneMaps(tile), [tile]);
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="rounded-lg border border-[#e8e8e3] bg-white">
      <div className={["flex flex-wrap items-center justify-between gap-3 px-4 py-3", isExpanded ? "border-b border-[#eeeeea]" : ""].join(" ")}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="grid h-7 w-7 place-items-center rounded-md text-[#55554f] hover:bg-[#f4f4f0] focus:outline-none focus:ring-2 focus:ring-[#111111]/20"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse parameter row" : "Expand parameter row"}
          >
            <ChevronRightIcon className={isExpanded ? "rotate-90" : ""} />
          </button>
          <h3 className="text-[14px] font-semibold text-[#111111]">Row {contextRow}</h3>
        </div>
      </div>
      {isExpanded ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#eeeeea] text-[#777770]">
                <th className="w-[150px] px-4 py-2 font-semibold">Parameter</th>
                {visibleSamples.map((sample) => {
                  return (
                    <th
                      key={sample.id}
                      className={[
                        "px-2 py-2 text-center font-semibold",
                        sample.column === selectedSample.column ? "border-x border-t border-[#111111] text-[#111111]" : ""
                      ].join(" ")}
                    >
                      C{sample.column}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {parameterRows.map((row) => (
                <tr key={row.field} className="border-b border-[#eeeeea] last:border-b-0">
                  <th className="px-4 py-2 text-[12px] font-semibold text-[#55554f]">{row.label}</th>
                  {visibleSamples.map((sample) => {
                    const value = getDisplayParameterValue(tile, contextRow, sample.column, row.field);
                    const toneClass = getParameterToneClass(toneMaps, row.field, value);
                    return (
                      <td
                        key={`${row.field}-${sample.id}`}
                        className={[
                          "px-2 py-2 text-center text-[12px] font-semibold text-[#4a483f]",
                          toneClass,
                          sample.column === selectedSample.column ? "border-x border-[#111111] text-[#111111]" : ""
                        ].join(" ")}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export function ResultsReviewBoard({ tile, canEdit = true }: { tile: WaferStatusTileModel; canEdit?: boolean }) {
  const [selectedSampleId, setSelectedSampleId] = useState("R1C12");
  const [contextRow, setContextRow] = useState(1);
  const [galleryStartColumn, setGalleryStartColumn] = useState(() => getGalleryWindowStartForColumn(12));
  const [inspectionsBySample, setInspectionsBySample] = useState<SampleInspectionMap>({});
  const [selectedImageIndexBySample, setSelectedImageIndexBySample] = useState<Record<string, number>>({});
  const [isImageBusy, setIsImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uniformityBySample, setUniformityBySample] = useState<Record<string, string>>({});
  const [savedUniformityBySample, setSavedUniformityBySample] = useState<Record<string, string>>({});
  const [isSavingUniformity, setIsSavingUniformity] = useState(false);
  const [uniformityError, setUniformityError] = useState<string | null>(null);
  const pendingDeletionRef = useRef<PendingDeletion | null>(null);
  const selectedSample = useMemo(
    () => resultSamples.find((sample) => sample.id === selectedSampleId) ?? resultSamples[0],
    [selectedSampleId]
  );
  const visibleSamples = useMemo(
    () => resultSamples
      .filter((sample) => sample.row === selectedSample.row)
      .slice(galleryStartColumn - 1, galleryStartColumn - 1 + GALLERY_VISIBLE_COUNT),
    [galleryStartColumn, selectedSample.row]
  );
  const dieCode = useMemo(() => getPersistenceDieCode(tile), [tile]);
  const selectedInspections = inspectionsBySample[selectedSample.id] ?? [];
  const selectedImageIndex = Math.min(
    selectedImageIndexBySample[selectedSample.id] ?? 0,
    Math.max(selectedInspections.length - 1, 0)
  );
  const selectedInspection = selectedInspections[selectedImageIndex] ?? null;
  const sampleMetricScopeKey = useMemo(() => getSampleMetricKey(tile, selectedSample), [selectedSample, tile]);
  const warmImageUrls = useMemo(() => {
    const warmColumnStart = Math.max(1, galleryStartColumn - 1);
    const warmColumnEnd = Math.min(chipColumns.length, galleryStartColumn + GALLERY_VISIBLE_COUNT);
    const warmSampleIds = new Set(
      resultSamples
        .filter((sample) =>
          sample.row === selectedSample.row &&
          sample.column >= warmColumnStart &&
          sample.column <= warmColumnEnd
        )
        .map((sample) => sample.id)
    );

    warmSampleIds.add(selectedSample.id);

    return Array.from(warmSampleIds)
      .flatMap((sampleId) => inspectionsBySample[sampleId] ?? [])
      .map((inspection) => inspection.imageUrl)
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
  }, [galleryStartColumn, inspectionsBySample, selectedSample]);

  useEffect(() => {
    if (sampleMetricScopeKey in uniformityBySample) {
      return;
    }

    let isStale = false;
    void getTextSurface({
      projectId: tile.projectId,
      scopeType: RESULT_SAMPLE_SCOPE_TYPE,
      scopeKey: sampleMetricScopeKey,
      fieldKey: RESULT_SAMPLE_UNIFORMITY_FIELD
    }).then((result) => {
      if (isStale) {
        return;
      }

      if (result.ok) {
        const value = result.data?.value ?? selectedSample.uniformityPercent;
        setUniformityBySample((current) => ({
          ...current,
          [sampleMetricScopeKey]: value
        }));
        setSavedUniformityBySample((current) => ({
          ...current,
          [sampleMetricScopeKey]: value
        }));
      } else {
        setUniformityError(result.error);
      }
    });

    return () => {
      isStale = true;
    };
  }, [sampleMetricScopeKey, selectedSample.uniformityPercent, tile.projectId, uniformityBySample]);

  useEffect(() => {
    if (!tile.waferId || !dieCode) {
      return;
    }

    let isStale = false;

    void listDieInspectionsForDie({
      waferId: tile.waferId,
      dieCode
    }).then((result) => {
      if (isStale) {
        return;
      }

      if (result.ok) {
        const nextBySample: SampleInspectionMap = {};
        for (const inspection of result.data) {
          const key = getSampleInspectionKey(inspection.row, inspection.column);
          nextBySample[key] = mergeUniqueInspections(nextBySample[key] ?? [], [inspection]);
        }
        setInspectionsBySample(nextBySample);
      } else {
        setImageError(result.error);
      }
    });

    return () => {
      isStale = true;
    };
  }, [dieCode, tile.waferId]);

  useEffect(() => {
    const warmedImages = warmImageUrls
      .map((imageUrl) => {
        const image = new window.Image();
        image.decoding = "async";
        image.src = imageUrl;
        return image;
      });

    return () => {
      for (const image of warmedImages) {
        image.src = "";
      }
    };
  }, [warmImageUrls]);

  const selectSample = useCallback((sample: ResultSample) => {
    setSelectedSampleId(sample.id);
    setContextRow(sample.row);
    setGalleryStartColumn((current) => ensureColumnInGalleryWindow(current, sample.column));
    setImageError(null);
    setUniformityError(null);
  }, []);

  const selectOrCycleSample = useCallback((sample: ResultSample) => {
    if (sample.id === selectedSample.id) {
      const count = inspectionsBySample[sample.id]?.length ?? 0;
      if (count > 1) {
        setSelectedImageIndexBySample((current) => ({
          ...current,
          [sample.id]: ((current[sample.id] ?? 0) + 1) % count
        }));
      }
      return;
    }

    selectSample(sample);
  }, [inspectionsBySample, selectSample, selectedSample.id]);

  const addImagesForSample = useCallback((sample: ResultSample, openPicker: () => void) => {
    selectSample(sample);
    if (canEdit) {
      window.setTimeout(openPicker, 0);
    }
  }, [canEdit, selectSample]);

  const navigateSampleByKey = useCallback((key: string) => {
    const rowCount = chipRowSections.length;
    const columnCount = chipColumns.length;
    const rowIndex = selectedSample.row - 1;
    const columnIndex = selectedSample.column - 1;

    if (key === "ArrowLeft" && columnIndex === 0) {
      return;
    }

    if (key === "ArrowRight" && columnIndex === columnCount - 1) {
      return;
    }

    if (key === "ArrowUp" && rowIndex === 0) {
      return;
    }

    if (key === "ArrowDown" && rowIndex === rowCount - 1) {
      return;
    }

    const nextRowIndex =
      key === "ArrowUp"
        ? rowIndex - 1
        : key === "ArrowDown"
          ? rowIndex + 1
          : rowIndex;
    const nextColumnIndex =
      key === "ArrowLeft"
        ? columnIndex - 1
        : key === "ArrowRight"
          ? columnIndex + 1
          : columnIndex;
    const nextSample = resultSamples.find(
      (sample) => sample.row === nextRowIndex + 1 && sample.column === nextColumnIndex + 1
    );

    if (nextSample) {
      selectSample(nextSample);
    }
  }, [selectSample, selectedSample]);

  const saveUniformity = useCallback(async (sample: ResultSample) => {
    if (!canEdit) {
      return;
    }

    const scopeKey = getSampleMetricKey(tile, sample);
    const value = (uniformityBySample[scopeKey] ?? sample.uniformityPercent).trim();
    const savedValue = savedUniformityBySample[scopeKey] ?? sample.uniformityPercent;
    if (value === savedValue || isSavingUniformity) {
      return;
    }

    setIsSavingUniformity(true);
    setUniformityError(null);

    const result = await upsertTextSurface({
      projectId: tile.projectId,
      scopeType: RESULT_SAMPLE_SCOPE_TYPE,
      scopeKey,
      fieldKey: RESULT_SAMPLE_UNIFORMITY_FIELD,
      value
    });

    setIsSavingUniformity(false);
    if (result.ok) {
      setUniformityBySample((current) => ({
        ...current,
        [scopeKey]: result.data.value
      }));
      setSavedUniformityBySample((current) => ({
        ...current,
        [scopeKey]: result.data.value
      }));
    } else {
      setUniformityError(result.error);
    }
  }, [
    isSavingUniformity,
    canEdit,
    savedUniformityBySample,
    tile,
    uniformityBySample
  ]);

  const uploadResultFiles = useCallback(async (files: readonly File[]) => {
    if (!canEdit) {
      return;
    }

    if (!tile.projectId || !tile.waferId || !dieCode) {
      setImageError("Select a persisted wafer die before attaching result images.");
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setImageError("Use PNG or JPEG images for result uploads.");
      return;
    }

    setIsImageBusy(true);
    setImageError(null);

    try {
      const uploaded: DieInspectionRecord[] = [];

      for (const rawFile of imageFiles) {
        const file = normalizeImageFile(rawFile);
        const inspectionId = crypto.randomUUID();
        const extension = getFileExtension(file);
        const imagePath =
          `${tile.projectId}/wafers/${tile.waferId}/dies/${dieCode}/results/${selectedSample.id}/${inspectionId}.${extension}`;

        const signedResponse = await fetch("/api/storage/signed-upload", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            projectId: tile.projectId,
            bucketName: INSPECTION_BUCKET,
            objectPath: imagePath
          })
        });

        if (!signedResponse.ok) {
          const payload = await signedResponse.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error ?? "Unable to create result image upload.");
        }

        const signedUpload = await signedResponse.json() as { path: string; token: string };
        const supabase = createClient();
        const { error: uploadErrorResult } = await supabase.storage
          .from(INSPECTION_BUCKET)
          .uploadToSignedUrl(signedUpload.path, signedUpload.token, file, {
            contentType: file.type
          });

        if (uploadErrorResult) {
          throw new Error(uploadErrorResult.message);
        }

        const result = await createDieInspection({
          id: inspectionId,
          projectId: tile.projectId,
          waferId: tile.waferId,
          dieCode,
          row: selectedSample.row,
          column: selectedSample.column,
          xRatio: 0.5,
          yRatio: 0.5,
          imageBucket: INSPECTION_BUCKET,
          imagePath,
          imageMimeType: file.type,
          imageSizeBytes: file.size,
          imageFileName: file.name || `result-${selectedSample.id}-${inspectionId}.${extension}`
        });

        if (!result.ok) {
          throw new Error(result.error);
        }

        uploaded.push(result.data);
      }

      if (uploaded.length > 0) {
        setInspectionsBySample((current) => {
          const existing = current[selectedSample.id] ?? [];
          const merged = mergeUniqueInspections(existing, uploaded);
          const lastUploadedId = uploaded.at(-1)?.id;
          const nextIndex = lastUploadedId
            ? Math.max(0, merged.findIndex((inspection) => inspection.id === lastUploadedId))
            : Math.max(0, merged.length - 1);

          setSelectedImageIndexBySample((imageIndexes) => ({
            ...imageIndexes,
            [selectedSample.id]: nextIndex
          }));

          return {
            ...current,
            [selectedSample.id]: merged
          };
        });
      }
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Result image upload failed.");
    } finally {
      setIsImageBusy(false);
    }
  }, [canEdit, dieCode, selectedSample, tile.projectId, tile.waferId]);

  const restoreDeletedInspection = useCallback((deletion: PendingDeletion) => {
    setInspectionsBySample((current) => {
      const existing = current[deletion.sampleId] ?? [];
      if (existing.some((inspection) => inspection.id === deletion.inspection.id)) {
        return current;
      }

      const restored = [...existing];
      restored.splice(Math.min(deletion.sampleIndex, restored.length), 0, deletion.inspection);

      return {
        ...current,
        [deletion.sampleId]: restored
      };
    });
    setSelectedSampleId(deletion.sampleId);
    const restoredSample = resultSamples.find((sample) => sample.id === deletion.sampleId);
    if (restoredSample) {
      setContextRow(restoredSample.row);
      setGalleryStartColumn((current) => ensureColumnInGalleryWindow(current, restoredSample.column));
    }
    setSelectedImageIndexBySample((current) => ({
      ...current,
      [deletion.sampleId]: deletion.imageIndex
    }));
  }, []);

  const commitDeletionInBackground = useCallback((deletion: PendingDeletion, restoreOnFailure: boolean) => {
    void deleteDieInspection({ inspectionId: deletion.inspection.id }).then((result) => {
      if (!result.ok) {
        setImageError(result.error);
        if (restoreOnFailure) {
          restoreDeletedInspection(deletion);
        }
      }
    });
  }, [restoreDeletedInspection]);

  const undoLastDeletion = useCallback(() => {
    const deletion = pendingDeletionRef.current;
    if (!deletion) {
      return;
    }

    window.clearTimeout(deletion.timeoutId);
    pendingDeletionRef.current = null;
    restoreDeletedInspection(deletion);
    setImageError(null);
  }, [restoreDeletedInspection]);

  const deleteSelectedImage = useCallback(() => {
    if (!canEdit || !selectedInspection) {
      return;
    }

    const previousDeletion = pendingDeletionRef.current;
    if (previousDeletion) {
      window.clearTimeout(previousDeletion.timeoutId);
      pendingDeletionRef.current = null;
      commitDeletionInBackground(previousDeletion, false);
    }

    const sampleId = selectedSample.id;
    const sampleInspections = inspectionsBySample[sampleId] ?? [];
    const sampleIndex = sampleInspections.findIndex((inspection) => inspection.id === selectedInspection.id);
    const deletion: PendingDeletion = {
      inspection: selectedInspection,
      sampleId,
      sampleIndex: Math.max(0, sampleIndex),
      imageIndex: selectedImageIndex,
      timeoutId: window.setTimeout(() => {
        const pending = pendingDeletionRef.current;
        if (!pending || pending.inspection.id !== selectedInspection.id) {
          return;
        }

        pendingDeletionRef.current = null;
        commitDeletionInBackground(pending, true);
      }, DELETE_UNDO_DELAY_MS)
    };

    pendingDeletionRef.current = deletion;
    setImageError(null);

    setInspectionsBySample((current) => {
      const remaining = (current[selectedSample.id] ?? []).filter((inspection) => inspection.id !== selectedInspection.id);
      return {
        ...current,
        [selectedSample.id]: remaining
      };
    });
    setSelectedImageIndexBySample((current) => ({
      ...current,
      [selectedSample.id]: Math.max(0, selectedImageIndex - 1)
    }));
  }, [
    canEdit,
    commitDeletionInBackground,
    inspectionsBySample,
    selectedImageIndex,
    selectedInspection,
    selectedSample.id
  ]);

  useEffect(() => {
    return () => {
      const deletion = pendingDeletionRef.current;
      if (deletion) {
        window.clearTimeout(deletion.timeoutId);
        commitDeletionInBackground(deletion, false);
      }
    };
  }, [commitDeletionInBackground]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      if (event.defaultPrevented) {
        return;
      }

      const files = getClipboardImageFiles(event);
      if (!canEdit || files.length === 0) {
        return;
      }

      event.preventDefault();
      void uploadResultFiles(files);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [canEdit, uploadResultFiles]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      const isCommandShortcut = event.metaKey || event.ctrlKey;
      if (isCommandShortcut && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoLastDeletion();
        return;
      }

      if (
        canEdit &&
        isCommandShortcut &&
        (event.key === "Backspace" || event.key === "Delete")
      ) {
        event.preventDefault();
        deleteSelectedImage();
        return;
      }

      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      navigateSampleByKey(event.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canEdit, deleteSelectedImage, navigateSampleByKey, undoLastDeletion]);

  const navigateGalleryWindow = useCallback((direction: -1 | 1) => {
    setGalleryStartColumn((current) => Math.min(maxGalleryStartColumn, Math.max(1, current + direction)));
  }, []);

  return (
    <div className="grid gap-4">
      <ResultsGalleryViewport
        tile={tile}
        inspectionsBySample={inspectionsBySample}
        imageIndexBySample={selectedImageIndexBySample}
        uniformityBySample={uniformityBySample}
        row={selectedSample.row}
        visibleSamples={visibleSamples}
        selectedSample={selectedSample}
        selectedImageIndex={selectedImageIndex}
        selectedInspection={selectedInspection}
        canEdit={canEdit}
        isImageBusy={isImageBusy}
        imageError={imageError}
        isSavingUniformity={isSavingUniformity}
        uniformityError={uniformityError}
        onFilesAdd={(files) => void uploadResultFiles(files)}
        onDeleteImage={deleteSelectedImage}
        onNavigateWindow={navigateGalleryWindow}
        onSelectSample={selectOrCycleSample}
        onAddImagesForSample={addImagesForSample}
        onUniformityChange={(sample, value) => {
          const scopeKey = getSampleMetricKey(tile, sample);
          setUniformityError(null);
          setUniformityBySample((current) => ({
            ...current,
            [scopeKey]: value
          }));
        }}
        onUniformityBlur={(sample) => void saveUniformity(sample)}
      />
      <ParameterContext
        tile={tile}
        selectedSample={selectedSample}
        visibleSamples={visibleSamples}
        contextRow={contextRow}
      />
    </div>
  );
}
