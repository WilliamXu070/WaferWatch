"use client";

import {
  type ClipboardEvent as ReactClipboardEvent,
  useCallback,
  useEffect,
  useMemo,
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

const RESULT_SAMPLE_SCOPE_TYPE = "wireframe:result_sample";
const RESULT_SAMPLE_UNIFORMITY_FIELD = "uniformity_percent";
const INSPECTION_BUCKET = "wafer-process-files";
const recipeCode = "TFA3.1M1R1";
const GALLERY_VISIBLE_COUNT = 8;
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

function ResultImage({
  imageUrl,
  className = ""
}: {
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <div className={["overflow-hidden rounded-md border border-[#d8d8d2] bg-[#f7f7f3] shadow-inner", className].join(" ")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }

  return (
    <div className={["grid place-items-center rounded-md border border-dashed border-[#d8d8d2] bg-[#f7f7f3] text-[#777770]", className].join(" ")}>
      <span className="text-[18px]">+</span>
    </div>
  );
}

function GalleryTile({
  sample,
  inspection,
  imageOrdinal,
  imageCount,
  uniformityValue,
  selected,
  onSelect,
  onUniformityChange,
  onUniformityBlur
}: {
  sample: ResultSample;
  inspection?: DieInspectionRecord;
  imageOrdinal: number;
  imageCount: number;
  uniformityValue: string;
  selected: boolean;
  onSelect: (sample: ResultSample) => void;
  onUniformityChange: (sample: ResultSample, value: string) => void;
  onUniformityBlur: (sample: ResultSample) => void;
}) {
  return (
    <article
      className={[
        "grid min-w-0 grid-rows-[minmax(260px,42vh)_auto] overflow-hidden rounded-lg border bg-white transition-colors",
        selected ? "border-[#111111] shadow-[0_0_0_1px_#111111]" : "border-[#e4e4df]"
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => onSelect(sample)}
        className="block min-h-0 bg-white p-1.5 text-left"
        aria-pressed={selected}
        aria-label={`Select ${sample.id} result sample`}
      >
        <ResultImage imageUrl={inspection?.imageUrl} className="h-full w-full" />
      </button>
      <div className="grid gap-2 border-t border-[#eeeeea] px-2 py-2">
        <div className="flex min-w-0 items-center justify-between gap-2 text-[12px] font-semibold">
          <span className="truncate text-[#111111]">{recipeCode} {sample.id}</span>
          <span className="shrink-0 text-[#777770]">{imageCount ? `${imageOrdinal} / ${imageCount}` : "0 / 0"}</span>
        </div>
        <label className="flex min-w-0 items-center gap-1 rounded-md border border-[#e1e1dc] bg-white px-2 focus-within:border-[#111111]">
          <span className="text-[11px] font-semibold text-[#777770]">Uniformity</span>
          <input
            type="text"
            inputMode="decimal"
            value={uniformityValue}
            onChange={(event) => onUniformityChange(sample, event.target.value)}
            onBlur={() => onUniformityBlur(sample)}
            className="min-w-0 flex-1 bg-transparent py-1 text-right text-[13px] font-semibold text-[#111111] outline-none"
            aria-label={`${sample.id} uniformity percentage`}
          />
          <span className="text-[12px] font-semibold text-[#777770]">%</span>
        </label>
      </div>
    </article>
  );
}

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
  isImageBusy,
  imageError,
  isSavingUniformity,
  uniformityError,
  onSelectSample,
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
  isImageBusy: boolean;
  imageError: string | null;
  isSavingUniformity: boolean;
  uniformityError: string | null;
  onSelectSample: (sample: ResultSample) => void;
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
    disabled: isImageBusy,
    onDrop: (acceptedFiles) => onFilesAdd(acceptedFiles)
  });

  const handlePaste = (event: ReactClipboardEvent<HTMLElement>) => {
    const files = getClipboardImageFiles(event);
    if (files.length === 0) {
      return;
    }

    event.preventDefault();
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
            onClick={open}
            disabled={isImageBusy}
            className="h-9 rounded-md border border-[#e1e1dc] bg-white px-3 hover:bg-[#fafafa] disabled:opacity-40"
          >
            {isImageBusy ? "Uploading..." : "Add images"}
          </button>
          <button
            type="button"
            onClick={onDeleteImage}
            disabled={!selectedInspection || isImageBusy}
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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          {visibleSamples.map((sample) => {
            const inspections = inspectionsBySample[sample.id] ?? [];
            const imageIndex = Math.min(imageIndexBySample[sample.id] ?? 0, Math.max(inspections.length - 1, 0));
            return (
              <GalleryTile
                key={sample.id}
                sample={sample}
                inspection={inspections[imageIndex]}
                imageOrdinal={inspections.length ? imageIndex + 1 : 0}
                imageCount={inspections.length}
                uniformityValue={uniformityBySample[getSampleMetricKey(tile, sample)] ?? sample.uniformityPercent}
                selected={sample.id === selectedSample.id}
                onSelect={onSelectSample}
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
  contextRow,
  onContextRowChange
}: {
  tile: WaferStatusTileModel;
  selectedSample: ResultSample;
  visibleSamples: readonly ResultSample[];
  contextRow: number;
  onContextRowChange: (row: number) => void;
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
        <select
          aria-label="Parameter row"
          value={contextRow}
          onChange={(event) => onContextRowChange(Number(event.target.value))}
          className="h-9 rounded-lg border border-[#e1e1dc] bg-white px-3 text-[13px] font-semibold text-[#44443f] outline-none hover:bg-[#fafafa] focus:border-[#111111]"
        >
          {chipRowSections.map((section) => {
            const row = Number(section.id.replace("R", ""));
            return (
              <option key={section.id} value={row}>
                Row {row}
              </option>
            );
          })}
        </select>
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

export function ResultsReviewBoard({ tile }: { tile: WaferStatusTileModel }) {
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
          nextBySample[key] = [...(nextBySample[key] ?? []), inspection];
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
    const warmedImages = Object.values(inspectionsBySample)
      .flat()
      .map((inspection) => inspection.imageUrl)
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl))
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
  }, [inspectionsBySample]);

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

  const navigateSampleByKey = useCallback((key: string) => {
    const rowCount = chipRowSections.length;
    const columnCount = chipColumns.length;
    const rowIndex = selectedSample.row - 1;
    const columnIndex = selectedSample.column - 1;

    if (key === "ArrowLeft" && selectedImageIndex > 0) {
      setSelectedImageIndexBySample((current) => ({
        ...current,
        [selectedSample.id]: selectedImageIndex - 1
      }));
      return;
    }

    if (key === "ArrowRight" && selectedImageIndex < selectedInspections.length - 1) {
      setSelectedImageIndexBySample((current) => ({
        ...current,
        [selectedSample.id]: selectedImageIndex + 1
      }));
      return;
    }

    const nextRowIndex =
      key === "ArrowUp"
        ? (rowIndex - 1 + rowCount) % rowCount
        : key === "ArrowDown"
          ? (rowIndex + 1) % rowCount
          : rowIndex;
    const nextColumnIndex =
      key === "ArrowLeft"
        ? (columnIndex - 1 + columnCount) % columnCount
        : key === "ArrowRight"
          ? (columnIndex + 1) % columnCount
          : columnIndex;
    const nextSample = resultSamples.find(
      (sample) => sample.row === nextRowIndex + 1 && sample.column === nextColumnIndex + 1
    );

    if (nextSample) {
      selectSample(nextSample);
    }
  }, [selectSample, selectedImageIndex, selectedInspections.length, selectedSample]);

  const saveUniformity = useCallback(async (sample: ResultSample) => {
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
    savedUniformityBySample,
    tile,
    uniformityBySample
  ]);

  const uploadResultFiles = useCallback(async (files: readonly File[]) => {
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
          return {
            ...current,
            [selectedSample.id]: [...existing, ...uploaded]
          };
        });
        setSelectedImageIndexBySample((current) => ({
          ...current,
          [selectedSample.id]: (inspectionsBySample[selectedSample.id]?.length ?? 0) + uploaded.length - 1
        }));
      }
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Result image upload failed.");
    } finally {
      setIsImageBusy(false);
    }
  }, [dieCode, inspectionsBySample, selectedSample, tile.projectId, tile.waferId]);

  const deleteSelectedImage = useCallback(async () => {
    if (!selectedInspection || isImageBusy) {
      return;
    }

    setIsImageBusy(true);
    setImageError(null);

    const result = await deleteDieInspection({ inspectionId: selectedInspection.id });
    if (!result.ok) {
      setImageError(result.error);
      setIsImageBusy(false);
      return;
    }

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
    setIsImageBusy(false);
  }, [isImageBusy, selectedImageIndex, selectedInspection, selectedSample.id]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      const files = getClipboardImageFiles(event);
      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      void uploadResultFiles(files);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [uploadResultFiles]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      event.preventDefault();
      navigateSampleByKey(event.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateSampleByKey]);

  const navigateGalleryWindow = useCallback((direction: -1 | 1) => {
    setGalleryStartColumn((current) => Math.min(maxGalleryStartColumn, Math.max(1, current + direction)));
  }, []);

  const handleContextRowChange = useCallback((row: number) => {
    const nextSample = resultSamples.find((sample) => sample.row === row && sample.column === selectedSample.column);
    if (nextSample) {
      selectSample(nextSample);
    } else {
      setContextRow(row);
    }
  }, [selectSample, selectedSample.column]);

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
        isImageBusy={isImageBusy}
        imageError={imageError}
        isSavingUniformity={isSavingUniformity}
        uniformityError={uniformityError}
        onFilesAdd={(files) => void uploadResultFiles(files)}
        onDeleteImage={deleteSelectedImage}
        onNavigateWindow={navigateGalleryWindow}
        onSelectSample={selectOrCycleSample}
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
        onContextRowChange={handleContextRowChange}
      />
    </div>
  );
}
