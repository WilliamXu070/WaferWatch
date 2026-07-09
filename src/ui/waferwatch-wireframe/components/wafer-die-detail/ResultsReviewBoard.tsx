"use client";

import {
  type ClipboardEvent as ReactClipboardEvent,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
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
type ImageSizeMap = Record<string, { width: number; height: number }>;

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
const MAX_GALLERY_VISIBLE_COUNT = 5;
const DELETE_UNDO_DELAY_MS = 3500;
const COMPACT_RESULTS_BREAKPOINT = 900;

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

function getMaxGalleryStartColumn(visibleCount: number) {
  return Math.max(1, chipColumns.length - visibleCount + 1);
}

function getResponsiveGalleryVisibleCount(width: number) {
  if (width < 560) return 3;
  if (width < 820) return 4;
  if (width < 1080) return 3;
  if (width < 1320) return 4;
  return MAX_GALLERY_VISIBLE_COUNT;
}

function getGalleryWindowStartForColumn(column: number, visibleCount: number) {
  const maxGalleryStartColumn = getMaxGalleryStartColumn(visibleCount);
  return Math.min(maxGalleryStartColumn, Math.max(1, column - Math.floor(visibleCount / 2)));
}

function ensureColumnInGalleryWindow(currentStart: number, column: number, visibleCount: number) {
  if (column < currentStart) {
    return column;
  }

  if (column >= currentStart + visibleCount) {
    return Math.min(getMaxGalleryStartColumn(visibleCount), column - visibleCount + 1);
  }

  return currentStart;
}

function getImageAspectRatio(size: { width: number; height: number } | undefined) {
  if (!size || size.width <= 0 || size.height <= 0) {
    return "4 / 3";
  }

  const ratio = size.width / size.height;
  if (ratio < 0.62) {
    return "3 / 4";
  }

  if (ratio > 1.9) {
    return "16 / 9";
  }

  return `${size.width} / ${size.height}`;
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

function SelectedParameterOverlay({
  tile,
  sample
}: {
  tile: WaferStatusTileModel;
  sample: ResultSample;
}) {
  const toneMaps = useMemo(() => buildDisplayToneMaps(tile), [tile]);
  const primaryRows = parameterRows.slice(0, 4);

  return (
    <aside className="pointer-events-auto absolute bottom-3 right-3 z-20 w-[min(268px,calc(100vw-32px))] rounded-xl border border-[#d8d8d2] bg-white/95 p-3 shadow-[0_16px_40px_rgba(17,17,17,0.16)] backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-[#eeeeea] pb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#777770]">Selected</p>
          <h3 className="mt-0.5 text-[15px] font-semibold text-[#111111]">R{sample.row} C{sample.column}</h3>
        </div>
        <span className="rounded-md bg-[#f4f4ef] px-2 py-1 text-[12px] font-semibold text-[#55554f]">
          {sample.uniformityPercent}%
        </span>
      </div>
      <dl className="mt-2 grid gap-1.5">
        {primaryRows.map((row) => {
          const value = getDisplayParameterValue(tile, sample.row, sample.column, row.field);
          const toneClass = getParameterToneClass(toneMaps, row.field, value);
          return (
            <div key={row.field} className={["grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5", toneClass || "bg-[#fbfbf8]"].join(" ")}>
              <dt className="truncate text-[11px] font-semibold text-[#66665f]">{row.label}</dt>
              <dd className="text-[12px] font-semibold tabular-nums text-[#111111]">{value}</dd>
            </div>
          );
        })}
      </dl>
    </aside>
  );
}

const ResultImage = memo(function ResultImage({
  inspectionId,
  imageUrl,
  isActive = true,
  className = "",
  onImageSize
}: {
  inspectionId?: string;
  imageUrl?: string | null;
  isActive?: boolean;
  className?: string;
  onImageSize?: (inspectionId: string, size: { width: number; height: number }) => void;
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
          onLoad={(event) => {
            if (!inspectionId || !onImageSize) {
              return;
            }

            const image = event.currentTarget;
            if (image.naturalWidth > 0 && image.naturalHeight > 0) {
              onImageSize(inspectionId, {
                width: image.naturalWidth,
                height: image.naturalHeight
              });
            }
          }}
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
  imageSizes,
  className = "",
  onImageSize
}: {
  inspections: readonly DieInspectionRecord[];
  activeIndex: number;
  imageSizes: ImageSizeMap;
  className?: string;
  onImageSize: (inspectionId: string, size: { width: number; height: number }) => void;
}) {
  if (inspections.length === 0) {
    return (
      <div className={className} style={{ aspectRatio: "4 / 3" }}>
        <ResultImage className="h-full w-full" />
      </div>
    );
  }

  const activeInspection = inspections[activeIndex] ?? inspections[0];
  const aspectRatio = getImageAspectRatio(activeInspection ? imageSizes[activeInspection.id] : undefined);

  return (
    <div className={["relative", className].join(" ")} style={{ aspectRatio }}>
      {inspections.map((inspection, index) => (
        <ResultImage
          key={inspection.id}
          inspectionId={inspection.id}
          imageUrl={inspection.imageUrl}
          isActive={index === activeIndex}
          className="h-full w-full"
          onImageSize={onImageSize}
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
  selectEmptySamples,
  imageSizes,
  onSelect,
  onAddImages,
  onImageSize,
  onUniformityChange,
  onUniformityBlur,
  style
}: {
  sample: ResultSample;
  inspections: readonly DieInspectionRecord[];
  imageIndex: number;
  imageOrdinal: number;
  imageCount: number;
  uniformityValue: string;
  selected: boolean;
  canEdit: boolean;
  selectEmptySamples?: boolean;
  imageSizes: ImageSizeMap;
  onSelect: (sample: ResultSample) => void;
  onAddImages: (sample: ResultSample) => void;
  onImageSize: (inspectionId: string, size: { width: number; height: number }) => void;
  onUniformityChange: (sample: ResultSample, value: string) => void;
  onUniformityBlur: (sample: ResultSample) => void;
  style?: CSSProperties;
}) {
  const handleImageKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (inspections.length === 0) {
        if (selectEmptySamples) {
          onSelect(sample);
        } else if (canEdit) {
          onAddImages(sample);
        }
      } else {
        onSelect(sample);
      }
    }
  };

  return (
    <article
      data-result-sample-id={sample.id}
      style={style}
      className={[
        "grid w-full max-w-full min-w-0 snap-start grid-cols-[minmax(0,1fr)] overflow-hidden rounded-lg border bg-white transition-colors",
        selected ? "border-[#111111] shadow-[0_0_0_1px_#111111]" : "border-[#e4e4df]"
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => {
          if (inspections.length === 0) {
            if (selectEmptySamples) {
              onSelect(sample);
            } else if (canEdit) {
              onAddImages(sample);
            }
          } else {
            onSelect(sample);
          }
        }}
        onKeyDown={handleImageKeyDown}
        className="block min-h-0 bg-white p-1.5 text-left"
        aria-pressed={selected}
        aria-label={inspections.length === 0 ? `Add result images to ${sample.id}` : `Select ${sample.id} result sample`}
      >
        <ResultImageStack
          inspections={inspections}
          activeIndex={imageIndex}
          imageSizes={imageSizes}
          className="w-full"
          onImageSize={onImageSize}
        />
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
  imageSizes,
  uniformityBySample,
  row,
  visibleSamples,
  isCompactMatrix,
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
  onImageSize,
  onFilesAdd,
  onDeleteImage,
  onNavigateWindow,
  onUniformityChange,
  onUniformityBlur
}: {
  tile: WaferStatusTileModel;
  inspectionsBySample: SampleInspectionMap;
  imageIndexBySample: Record<string, number>;
  imageSizes: ImageSizeMap;
  uniformityBySample: Record<string, string>;
  row: number;
  visibleSamples: readonly ResultSample[];
  isCompactMatrix: boolean;
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
  onImageSize: (inspectionId: string, size: { width: number; height: number }) => void;
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
    <section className="grid w-full max-w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[18px] font-semibold text-[#111111]">
            {isCompactMatrix ? "Result surface" : `Row ${row} result images`}
          </h2>
          <p className="mt-1 text-[12px] font-semibold text-[#777770]">
            {selectedSample.id} / image {selectedInspection ? selectedImageIndex + 1 : 0}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-[12px] font-semibold text-[#55554f]">
          {!isCompactMatrix ? (
            <>
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
            </>
          ) : null}
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
            "relative grid grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border border-[#e8e8e3] bg-white p-2 outline-none",
            "w-full max-w-full min-w-0",
            isDragActive ? "border-[#111111]" : ""
          ].join(" "),
          onPaste: handlePaste
        })}
        tabIndex={0}
      >
        <input {...getInputProps()} />
        <div
          className={[
            "results-gallery-grid grid w-full max-w-full min-w-0 gap-2 scroll-smooth pb-1",
            isCompactMatrix
              ? "max-h-[62vh] overflow-auto overscroll-contain pr-2"
              : "snap-x snap-mandatory grid-flow-col auto-cols-[minmax(252px,86vw)] overflow-x-auto sm:grid-flow-row sm:auto-cols-auto sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3 xl:grid-cols-5"
          ].join(" ")}
          style={isCompactMatrix ? {
            gridTemplateColumns: `repeat(${chipColumns.length}, minmax(236px, 72vw))`,
            gridTemplateRows: `repeat(${chipRowSections.length}, auto)`
          } : undefined}
        >
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
                selectEmptySamples={isCompactMatrix}
                imageSizes={imageSizes}
                onSelect={onSelectSample}
                onAddImages={(nextSample) => onAddImagesForSample(nextSample, open)}
                onImageSize={onImageSize}
                onUniformityChange={onUniformityChange}
                onUniformityBlur={onUniformityBlur}
                style={isCompactMatrix ? { gridColumn: sample.column, gridRow: sample.row } : undefined}
              />
            );
          })}
        </div>
        {isCompactMatrix ? (
          <SelectedParameterOverlay
            tile={tile}
            sample={selectedSample}
          />
        ) : null}
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
          <table className="w-full min-w-full table-fixed border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#eeeeea] text-[#777770]">
                <th className="w-[116px] px-3 py-2 font-semibold sm:w-[150px] sm:px-4">Parameter</th>
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
                  <th className="px-3 py-2 text-[12px] font-semibold text-[#55554f] sm:px-4">{row.label}</th>
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
  const [isCompactResults, setIsCompactResults] = useState(false);
  const [galleryVisibleCount, setGalleryVisibleCount] = useState(MAX_GALLERY_VISIBLE_COUNT);
  const [galleryStartColumn, setGalleryStartColumn] = useState(() => getGalleryWindowStartForColumn(12, MAX_GALLERY_VISIBLE_COUNT));
  const [inspectionsBySample, setInspectionsBySample] = useState<SampleInspectionMap>({});
  const [selectedImageIndexBySample, setSelectedImageIndexBySample] = useState<Record<string, number>>({});
  const [imageSizes, setImageSizes] = useState<ImageSizeMap>({});
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
    () => {
      if (isCompactResults) {
        return resultSamples;
      }

      return resultSamples
        .filter((sample) => sample.row === selectedSample.row)
        .slice(galleryStartColumn - 1, galleryStartColumn - 1 + galleryVisibleCount);
    },
    [galleryStartColumn, galleryVisibleCount, isCompactResults, selectedSample.row]
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
    const warmColumnEnd = Math.min(chipColumns.length, galleryStartColumn + galleryVisibleCount);
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
  }, [galleryStartColumn, galleryVisibleCount, inspectionsBySample, selectedSample]);

  useEffect(() => {
    const syncVisibleCount = () => {
      setIsCompactResults(window.innerWidth < COMPACT_RESULTS_BREAKPOINT);
      const nextVisibleCount = getResponsiveGalleryVisibleCount(window.innerWidth);
      setGalleryVisibleCount(nextVisibleCount);
      setGalleryStartColumn((current) => {
        const clampedStart = Math.min(getMaxGalleryStartColumn(nextVisibleCount), current);
        return ensureColumnInGalleryWindow(clampedStart, selectedSample.column, nextVisibleCount);
      });
    };

    syncVisibleCount();
    window.addEventListener("resize", syncVisibleCount);
    return () => window.removeEventListener("resize", syncVisibleCount);
  }, [selectedSample.column]);

  useEffect(() => {
    if (!isCompactResults) {
      return;
    }

    const selectedElement = document.querySelector<HTMLElement>(`[data-result-sample-id="${selectedSample.id}"]`);
    selectedElement?.scrollIntoView({
      block: "nearest",
      inline: "center"
    });
  }, [isCompactResults, selectedSample.id]);

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
    setGalleryStartColumn((current) => ensureColumnInGalleryWindow(current, sample.column, galleryVisibleCount));
    setImageError(null);
    setUniformityError(null);
  }, [galleryVisibleCount]);

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
      setGalleryStartColumn((current) => ensureColumnInGalleryWindow(current, restoredSample.column, galleryVisibleCount));
    }
    setSelectedImageIndexBySample((current) => ({
      ...current,
      [deletion.sampleId]: deletion.imageIndex
    }));
  }, [galleryVisibleCount]);

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
    setGalleryStartColumn((current) => Math.min(getMaxGalleryStartColumn(galleryVisibleCount), Math.max(1, current + direction)));
  }, [galleryVisibleCount]);

  const updateImageSize = useCallback((inspectionId: string, size: { width: number; height: number }) => {
    setImageSizes((current) => {
      const existing = current[inspectionId];
      if (existing?.width === size.width && existing.height === size.height) {
        return current;
      }

      return {
        ...current,
        [inspectionId]: size
      };
    });
  }, []);

  return (
    <div className="grid w-full max-w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <ResultsGalleryViewport
        tile={tile}
        inspectionsBySample={inspectionsBySample}
        imageIndexBySample={selectedImageIndexBySample}
        imageSizes={imageSizes}
        uniformityBySample={uniformityBySample}
        row={selectedSample.row}
        visibleSamples={visibleSamples}
        isCompactMatrix={isCompactResults}
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
        onImageSize={updateImageSize}
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
      {!isCompactResults ? (
        <ParameterContext
          tile={tile}
          selectedSample={selectedSample}
          visibleSamples={visibleSamples}
          contextRow={contextRow}
        />
      ) : null}
    </div>
  );
}
