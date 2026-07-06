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
  ChevronRightIcon,
  FilterIcon
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

type ResultStatus = "best" | "good" | "review" | "fail" | "missing";

type ResultSample = {
  id: string;
  row: number;
  column: number;
  status: ResultStatus;
  imageCount: number;
  selectedImage: number;
  uniformityPercent: string;
};

type SampleNote = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
};

type SampleInspectionMap = Record<string, DieInspectionRecord[]>;

const RESULT_SAMPLE_SCOPE_TYPE = "wireframe:result_sample";
const RESULT_SAMPLE_NOTES_FIELD = "notes";
const RESULT_SAMPLE_UNIFORMITY_FIELD = "uniformity_percent";
const INSPECTION_BUCKET = "wafer-process-files";
const recipeCode = "TFA3.1M1R1";

const statusMeta: Record<ResultStatus, { label: string; dot: string; badge: string }> = {
  best: { label: "Best", dot: "bg-[#2aa866]", badge: "border-[#8fcba8] bg-[#eaf7ef] text-[#207a49]" },
  good: { label: "Good", dot: "bg-[#3e8edb]", badge: "border-[#b9d7ef] bg-[#edf6ff] text-[#286da8]" },
  review: { label: "Review", dot: "bg-[#f2b632]", badge: "border-[#f1d58f] bg-[#fff8e7] text-[#90640d]" },
  fail: { label: "Fail", dot: "bg-[#c93535]", badge: "border-[#efb9b9] bg-[#fff0ef] text-[#9b2727]" },
  missing: { label: "No image", dot: "bg-[#bbbbb2]", badge: "border-[#ddddda] bg-[#f7f7f3] text-[#777770]" }
};

function buildSamples() {
  const reviewColumns = new Set(["1:14", "2:12", "2:13", "3:10"]);
  const failedColumns = new Set(["2:13", "2:14", "3:14"]);
  const missingColumns = new Set(["3:12", "3:13", "3:15"]);

  return chipRowSections.flatMap((section) => {
    const row = Number(section.id.replace("R", ""));
    return chipColumns.map((columnLabel): ResultSample => {
      const column = Number(columnLabel.replace("C", ""));
      const key = `${row}:${column}`;
      const status: ResultStatus =
        row === 2 && column === 7
          ? "best"
          : missingColumns.has(key)
            ? "missing"
            : failedColumns.has(key)
              ? "fail"
              : reviewColumns.has(key)
                ? "review"
                : column % 6 === 0
                  ? "good"
                  : "good";

      return {
        id: `R${row}C${column}`,
        row,
        column,
        status,
        imageCount: status === "missing" ? 0 : column % 4 === 0 ? 2 : column === 12 ? 3 : 1,
        selectedImage: status === "missing" ? 0 : column === 12 ? 3 : 1,
        uniformityPercent: status === "missing" ? "" : `${Math.min(99.9, 86 + row * 1.2 + column * 0.45).toFixed(1)}`
      };
    });
  });
}

const resultSamples = buildSamples();

function getSampleKey(tile: WaferStatusTileModel, sample: ResultSample, imageKey: string) {
  const dieCode = tile.dieLabel || tile.code;
  return `${tile.waferId}:${dieCode}:R${sample.row}:C${sample.column}:${imageKey}`;
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

function getMicroscopyBackground(sample: ResultSample, imageIndex = sample.selectedImage || 1) {
  const xShift = (sample.column * 9 + imageIndex * 17) % 100;
  const yShift = (sample.row * 21 + imageIndex * 11) % 100;
  return {
    backgroundImage: [
      "linear-gradient(90deg, rgba(45,31,99,0.94) 0 7%, transparent 7% 12%, rgba(33,122,124,0.76) 12% 18%, transparent 18% 26%, rgba(255,230,37,0.8) 26% 40%, transparent 40% 48%, rgba(37,89,122,0.82) 48% 54%, transparent 54% 66%, rgba(248,222,41,0.78) 66% 100%)",
      "repeating-linear-gradient(90deg, rgba(36,28,92,0.86) 0 5px, rgba(29,164,132,0.62) 5px 12px, rgba(241,232,45,0.72) 12px 18px)",
      "linear-gradient(180deg, rgba(48,8,74,0.92) 0 13%, rgba(54,198,142,0.65) 13% 48%, rgba(244,225,45,0.78) 48% 72%, rgba(47,28,92,0.9) 72% 100%)"
    ].join(", "),
    backgroundBlendMode: "multiply, screen, normal",
    backgroundPosition: `${xShift}% ${yShift}%`
  };
}

function ResultImage({
  sample,
  imageUrl,
  imageIndex,
  className = ""
}: {
  sample: ResultSample;
  imageUrl?: string | null;
  imageIndex?: number;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <div
        className={["rounded-md border border-[#d8d8d2] bg-cover bg-center bg-no-repeat shadow-inner", className].join(" ")}
        style={{ backgroundImage: `url("${imageUrl}")` }}
      />
    );
  }

  if (sample.status === "missing") {
    return (
      <div className={["grid place-items-center rounded-md border border-dashed border-[#d8d8d2] bg-[#f7f7f3] text-[#777770]", className].join(" ")}>
        <span className="text-[18px]">+</span>
      </div>
    );
  }

  return (
    <div
      className={["rounded-md border border-[#d8d8d2] bg-[#1e275f] shadow-inner", className].join(" ")}
      style={getMicroscopyBackground(sample, imageIndex)}
    />
  );
}

function SampleTile({
  sample,
  imageUrl,
  selected,
  onSelect
}: {
  sample: ResultSample;
  imageUrl?: string | null;
  selected: boolean;
  onSelect: (sample: ResultSample) => void;
}) {
  const meta = statusMeta[sample.status];
  return (
    <button
      type="button"
      onClick={() => onSelect(sample)}
      className={[
        "relative grid gap-1 rounded-lg border bg-white p-1.5 text-left transition-colors",
        selected ? "border-[#111111] shadow-[0_0_0_1px_#111111]" : "border-[#e4e4df] hover:border-[#c8c8c0]",
        sample.status === "missing" ? "text-[#777770]" : "text-[#111111]"
      ].join(" ")}
      aria-pressed={selected}
      aria-label={`Select ${sample.id} result sample`}
    >
      <span className={["absolute left-2 top-2 z-10 h-2.5 w-2.5 rounded-full", meta.dot].join(" ")} />
      <ResultImage sample={sample} imageUrl={imageUrl} className="h-[88px] w-full" />
      {sample.status === "best" ? (
        <span className="absolute -right-1 -top-2 rounded-md bg-[#2aa866] px-2 py-0.5 text-[10px] font-semibold text-white">
          Best
        </span>
      ) : null}
    </button>
  );
}

function ResultsGrid({
  inspectionsBySample,
  selectedSample,
  onSelectSample
}: {
  inspectionsBySample: SampleInspectionMap;
  selectedSample: ResultSample;
  onSelectSample: (sample: ResultSample) => void;
}) {
  return (
    <section className="grid gap-6">
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[1180px] gap-5">
          <div className="grid grid-cols-[62px_repeat(15,minmax(56px,1fr))] gap-2 text-center text-[12px] font-semibold text-[#55554f]">
            <span />
            {chipColumns.map((column) => (
              <span key={column}>{column}</span>
            ))}
          </div>
          {chipRowSections.map((section) => {
            const row = Number(section.id.replace("R", ""));
            return (
              <div key={row} className="grid grid-cols-[62px_repeat(15,minmax(56px,1fr))] gap-2">
                <div className="pt-1">
                  <p className="text-[16px] font-semibold text-[#111111]">{section.id}</p>
                  <p className="text-[12px] font-semibold text-[#777770]">{section.label}</p>
                  <p className="mt-3 text-[10px] font-semibold leading-4 text-[#777770]">
                    Period {section.period}
                    <br />
                    Gap {section.gap}
                    <br />
                    {section.variant}
                  </p>
                </div>
                {chipColumns.map((columnLabel) => {
                  const column = Number(columnLabel.replace("C", ""));
                  const sample = resultSamples.find((candidate) => candidate.row === row && candidate.column === column);
                  if (!sample) return null;
                  return (
                    <SampleTile
                      key={sample.id}
                      sample={sample}
                      imageUrl={inspectionsBySample[sample.id]?.[0]?.imageUrl}
                      selected={sample.id === selectedSample.id}
                      onSelect={onSelectSample}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ParameterContext({
  tile,
  selectedSample,
  contextRow,
  onContextRowChange
}: {
  tile: WaferStatusTileModel;
  selectedSample: ResultSample;
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
          <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#eeeeea] text-[#777770]">
                <th className="w-[150px] px-4 py-2 font-semibold">Parameter</th>
                {chipColumns.map((columnLabel) => {
                  const column = Number(columnLabel.replace("C", ""));
                  return (
                    <th
                      key={columnLabel}
                      className={[
                        "px-2 py-2 text-center font-semibold",
                        column === selectedSample.column ? "border-x border-t border-[#111111] text-[#111111]" : ""
                      ].join(" ")}
                    >
                      {columnLabel}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {parameterRows.map((row) => (
                <tr key={row.field} className="border-b border-[#eeeeea] last:border-b-0">
                  <th className="px-4 py-2 text-[12px] font-semibold text-[#55554f]">{row.label}</th>
                  {chipColumns.map((columnLabel) => {
                    const column = Number(columnLabel.replace("C", ""));
                    const value = getDisplayParameterValue(tile, contextRow, column, row.field);
                    const toneClass = getParameterToneClass(toneMaps, row.field, value);
                    return (
                      <td
                        key={`${row.field}-${columnLabel}`}
                        className={[
                          "px-2 py-2 text-center text-[12px] font-semibold text-[#4a483f]",
                          toneClass,
                          column === selectedSample.column ? "border-x border-[#111111] text-[#111111]" : ""
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

function SelectedSamplePanel({
  tile,
  selectedSample,
  selectedInspections,
  selectedInspection,
  selectedImageOrdinal,
  isImageBusy,
  imageError,
  uniformityValue,
  isSavingUniformity,
  uniformityError,
  notes,
  draftNote,
  isSavingNote,
  noteError,
  onDraftNoteChange,
  onAddNote,
  onFilesAdd,
  onDeleteImage,
  onNavigateImage,
  onUniformityChange,
  onUniformityBlur,
  onNavigateSample
}: {
  tile: WaferStatusTileModel;
  selectedSample: ResultSample;
  selectedInspections: readonly DieInspectionRecord[];
  selectedInspection: DieInspectionRecord | null;
  selectedImageOrdinal: number;
  isImageBusy: boolean;
  imageError: string | null;
  uniformityValue: string;
  isSavingUniformity: boolean;
  uniformityError: string | null;
  notes: readonly SampleNote[];
  draftNote: string;
  isSavingNote: boolean;
  noteError: string | null;
  onDraftNoteChange: (value: string) => void;
  onAddNote: () => void;
  onFilesAdd: (files: readonly File[]) => void;
  onDeleteImage: () => void;
  onNavigateImage: (direction: -1 | 1) => void;
  onUniformityChange: (value: string) => void;
  onUniformityBlur: () => void;
  onNavigateSample: (direction: -1 | 1) => void;
}) {
  const sampleTitle = `${recipeCode} ${selectedSample.id}`;
  const realImageCount = selectedInspections.length;
  const displayImageCount = realImageCount || selectedSample.imageCount;
  const displayImageOrdinal = realImageCount ? selectedImageOrdinal : selectedSample.selectedImage;
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
    <aside className="grid content-start gap-4 rounded-lg border border-[#e8e8e3] bg-white p-4 xl:sticky xl:top-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold text-[#111111]">{selectedSample.id}</h2>
          <p className="mt-1 text-[13px] font-semibold text-[#777770]">{sampleTitle}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNavigateSample(-1)}
            className="grid h-8 w-8 place-items-center rounded-md border border-[#e1e1dc] bg-white text-[#55554f] hover:bg-[#fafafa]"
            aria-label="Previous sample"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            onClick={() => onNavigateSample(1)}
            className="grid h-8 w-8 place-items-center rounded-md border border-[#e1e1dc] bg-white text-[#55554f] hover:bg-[#fafafa]"
            aria-label="Next sample"
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <div className="border-t border-[#eeeeea] pt-4">
        <div className="mb-3 flex items-center justify-between text-[13px] font-semibold">
          <span className="text-[#44443f]">Best image</span>
          <span className="text-[#777770]">
            {displayImageCount ? `${displayImageOrdinal} of ${displayImageCount}` : "0 of 0"}
          </span>
        </div>
        <div
          {...getRootProps({
            className: [
              "relative rounded-lg border border-dashed p-2 outline-none transition-colors",
              isDragActive ? "border-[#111111] bg-[#f7f7f3]" : "border-[#deded8] bg-white"
            ].join(" "),
            onPaste: handlePaste
          })}
          tabIndex={0}
        >
          <input {...getInputProps()} />
          <ResultImage
            sample={selectedSample}
            imageUrl={selectedInspection?.imageUrl}
            imageIndex={realImageCount ? selectedImageOrdinal : undefined}
            className="h-[210px] w-full"
          />
          {isDragActive ? (
            <div className="absolute inset-x-4 bottom-4 rounded-md bg-white/90 px-3 py-2 text-center text-[12px] font-semibold text-[#55554f] shadow-sm">
              Release to upload
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-md border border-[#e1e1dc] bg-white text-[#55554f] hover:bg-[#fafafa] disabled:opacity-40"
              onClick={() => onNavigateImage(-1)}
              disabled={realImageCount < 2}
              aria-label="Previous image"
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-md border border-[#e1e1dc] bg-white text-[#55554f] hover:bg-[#fafafa] disabled:opacity-40"
              onClick={() => onNavigateImage(1)}
              disabled={realImageCount < 2}
              aria-label="Next image"
            >
              <ChevronRightIcon />
            </button>
          </div>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-[#55554f]">
            <button
              type="button"
              className="rounded-md border border-[#e1e1dc] px-2 py-1 hover:bg-[#fafafa] disabled:opacity-40"
              onClick={open}
              disabled={isImageBusy}
            >
              {isImageBusy ? "Uploading..." : "Add images"}
            </button>
            <button
              type="button"
              className="rounded-md border border-[#e1e1dc] px-2 py-1 text-[#9b2727] hover:bg-[#fff0ef] disabled:text-[#aaa] disabled:hover:bg-transparent"
              onClick={onDeleteImage}
              disabled={!selectedInspection || isImageBusy}
            >
              Delete
            </button>
          </div>
        </div>
        {imageError ? <p className="mt-2 text-[12px] font-semibold text-[#a33a2b]">{imageError}</p> : null}
      </div>

      <div className="border-t border-[#eeeeea] pt-4">
        <label className="grid gap-2">
          <span className="text-[14px] font-semibold text-[#111111]">Uniformity</span>
          <span className="flex items-center rounded-lg border border-[#e1e1dc] bg-white px-3 focus-within:border-[#111111]">
            <input
              type="text"
              inputMode="decimal"
              value={uniformityValue}
              onChange={(event) => onUniformityChange(event.target.value)}
              onBlur={onUniformityBlur}
              className="min-w-0 flex-1 bg-transparent py-3 text-[28px] font-semibold text-[#111111] outline-none"
              aria-label="Uniformity percentage"
            />
            <span className="text-[22px] font-semibold text-[#777770]">%</span>
          </span>
        </label>
        <p className={["mt-2 text-[12px] font-semibold", uniformityError ? "text-[#a33a2b]" : "text-[#777770]"].join(" ")}>
          {uniformityError ?? (isSavingUniformity ? "Saving uniformity..." : "Saved")}
        </p>
      </div>

      <div className="border-t border-[#eeeeea] pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[#111111]">Notes</h3>
          <span className="text-[12px] font-semibold text-[#777770]">{notes.length} linked</span>
        </div>
        {notes.length ? (
          <div className="mb-3 grid gap-2">
            {notes.map((note) => (
              <article key={note.id} className="rounded-lg border border-[#eeeeea] bg-[#fafafa] px-3 py-2">
                <p className="text-[12px] font-semibold text-[#777770]">
                  {note.author} / {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
                <p className="mt-1 text-[13px] leading-5 text-[#44443f]">{note.body}</p>
              </article>
            ))}
          </div>
        ) : null}
        <textarea
          value={draftNote}
          onChange={(event) => onDraftNoteChange(event.target.value)}
          placeholder={`Add a note linked to ${tile.dieLabel || tile.code} ${selectedSample.id} image ${displayImageOrdinal || 0}...`}
          className="min-h-[86px] w-full resize-none rounded-lg border border-[#e1e1dc] bg-white px-3 py-2 text-[13px] leading-5 text-[#111111] outline-none focus:border-[#111111]"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className={["text-[12px] font-semibold", noteError ? "text-[#a33a2b]" : "text-[#777770]"].join(" ")}>
            {noteError ?? (isSavingNote ? "Saving sample note..." : "Saved to this image sample")}
          </span>
          <button
            type="button"
            onClick={onAddNote}
            disabled={!draftNote.trim() || isSavingNote}
            className="h-9 rounded-lg bg-[#111111] px-3 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add note
          </button>
        </div>
      </div>
    </aside>
  );
}

export function ResultsReviewBoard({ tile }: { tile: WaferStatusTileModel }) {
  const [selectedSampleId, setSelectedSampleId] = useState("R1C12");
  const [contextRow, setContextRow] = useState(1);
  const [inspectionsBySample, setInspectionsBySample] = useState<SampleInspectionMap>({});
  const [selectedImageIndexBySample, setSelectedImageIndexBySample] = useState<Record<string, number>>({});
  const [isImageBusy, setIsImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uniformityBySample, setUniformityBySample] = useState<Record<string, string>>({});
  const [savedUniformityBySample, setSavedUniformityBySample] = useState<Record<string, string>>({});
  const [isSavingUniformity, setIsSavingUniformity] = useState(false);
  const [uniformityError, setUniformityError] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [notesBySample, setNotesBySample] = useState<Record<string, SampleNote[]>>({});
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const selectedSample = useMemo(
    () => resultSamples.find((sample) => sample.id === selectedSampleId) ?? resultSamples[0],
    [selectedSampleId]
  );
  const dieCode = useMemo(() => getPersistenceDieCode(tile), [tile]);
  const selectedInspections = inspectionsBySample[selectedSample.id] ?? [];
  const selectedImageIndex = Math.min(
    selectedImageIndexBySample[selectedSample.id] ?? 0,
    Math.max(selectedInspections.length - 1, 0)
  );
  const selectedInspection = selectedInspections[selectedImageIndex] ?? null;
  const selectedImageOrdinal = selectedInspections.length ? selectedImageIndex + 1 : selectedSample.selectedImage || 0;
  const selectedImageKey = selectedInspection ? `inspection-${selectedInspection.id}` : `image-${selectedImageOrdinal}`;
  const sampleMetricScopeKey = useMemo(() => getSampleMetricKey(tile, selectedSample), [selectedSample, tile]);
  const sampleScopeKey = useMemo(
    () => getSampleKey(tile, selectedSample, selectedImageKey),
    [selectedImageKey, selectedSample, tile]
  );
  const selectedNotes = useMemo(() => notesBySample[sampleScopeKey] ?? [], [notesBySample, sampleScopeKey]);
  const uniformityValue = uniformityBySample[sampleMetricScopeKey] ?? selectedSample.uniformityPercent;

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
    setDraftNote("");
    setNoteError(null);
    setImageError(null);
    setUniformityError(null);
  }, []);

  const navigateSample = useCallback((direction: -1 | 1) => {
    const currentIndex = resultSamples.findIndex((sample) => sample.id === selectedSampleId);
    const nextIndex = (currentIndex + direction + resultSamples.length) % resultSamples.length;
    selectSample(resultSamples[nextIndex]);
  }, [selectSample, selectedSampleId]);

  const addSampleNote = useCallback(async () => {
    const body = draftNote.trim();
    if (!body || isSavingNote) {
      return;
    }

    const timestamp = new Date().toISOString();
    const nextNotes = [
      ...selectedNotes,
      {
        id: crypto.randomUUID(),
        author: "You",
        body: body.slice(0, 1600),
        createdAt: timestamp
      }
    ];
    const previousNotes = selectedNotes;

    setDraftNote("");
    setIsSavingNote(true);
    setNoteError(null);
    setNotesBySample((current) => ({
      ...current,
      [sampleScopeKey]: nextNotes
    }));

    const result = await upsertTextSurface({
      projectId: tile.projectId,
      scopeType: RESULT_SAMPLE_SCOPE_TYPE,
      scopeKey: sampleScopeKey,
      fieldKey: RESULT_SAMPLE_NOTES_FIELD,
      value: JSON.stringify(nextNotes)
    });

    setIsSavingNote(false);
    if (!result.ok) {
      setNotesBySample((current) => ({
        ...current,
        [sampleScopeKey]: previousNotes
      }));
      setNoteError(result.error);
    }
  }, [draftNote, isSavingNote, sampleScopeKey, selectedNotes, tile.projectId]);

  const saveUniformity = useCallback(async () => {
    const value = uniformityValue.trim();
    const savedValue = savedUniformityBySample[sampleMetricScopeKey] ?? selectedSample.uniformityPercent;
    if (value === savedValue || isSavingUniformity) {
      return;
    }

    setIsSavingUniformity(true);
    setUniformityError(null);

    const result = await upsertTextSurface({
      projectId: tile.projectId,
      scopeType: RESULT_SAMPLE_SCOPE_TYPE,
      scopeKey: sampleMetricScopeKey,
      fieldKey: RESULT_SAMPLE_UNIFORMITY_FIELD,
      value
    });

    setIsSavingUniformity(false);
    if (result.ok) {
      setUniformityBySample((current) => ({
        ...current,
        [sampleMetricScopeKey]: result.data.value
      }));
      setSavedUniformityBySample((current) => ({
        ...current,
        [sampleMetricScopeKey]: result.data.value
      }));
    } else {
      setUniformityError(result.error);
    }
  }, [
    isSavingUniformity,
    sampleMetricScopeKey,
    savedUniformityBySample,
    selectedSample.uniformityPercent,
    tile.projectId,
    uniformityValue
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

  const navigateImage = useCallback((direction: -1 | 1) => {
    const count = selectedInspections.length;
    if (count < 2) {
      return;
    }

    setSelectedImageIndexBySample((current) => ({
      ...current,
      [selectedSample.id]: ((current[selectedSample.id] ?? 0) + direction + count) % count
    }));
    setDraftNote("");
    setNoteError(null);
  }, [selectedInspections.length, selectedSample.id]);

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

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="text-[18px] font-semibold text-[#111111]">Result images</h2>
            <span className="text-[13px] font-semibold text-[#777770]">45 samples / grid review</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e1e1dc] bg-white px-3 text-[13px] font-semibold text-[#44443f] hover:bg-[#fafafa]">
              <FilterIcon />
              Filters
            </button>
            <button type="button" className="h-9 rounded-lg bg-[#111111] px-4 text-[13px] font-semibold text-white">
              Export
            </button>
          </div>
        </div>

        <ResultsGrid
          inspectionsBySample={inspectionsBySample}
          selectedSample={selectedSample}
          onSelectSample={selectSample}
        />
        <ParameterContext
          tile={tile}
          selectedSample={selectedSample}
          contextRow={contextRow}
          onContextRowChange={setContextRow}
        />
      </div>

      <SelectedSamplePanel
        tile={tile}
        selectedSample={selectedSample}
        selectedInspections={selectedInspections}
        selectedInspection={selectedInspection}
        selectedImageOrdinal={selectedImageOrdinal}
        isImageBusy={isImageBusy}
        imageError={imageError}
        uniformityValue={uniformityValue}
        isSavingUniformity={isSavingUniformity}
        uniformityError={uniformityError}
        notes={selectedNotes}
        draftNote={draftNote}
        isSavingNote={isSavingNote}
        noteError={noteError}
        onDraftNoteChange={setDraftNote}
        onAddNote={addSampleNote}
        onFilesAdd={(files) => void uploadResultFiles(files)}
        onDeleteImage={deleteSelectedImage}
        onNavigateImage={navigateImage}
        onUniformityChange={(value) => {
          setUniformityError(null);
          setUniformityBySample((current) => ({
            ...current,
            [sampleMetricScopeKey]: value
          }));
        }}
        onUniformityBlur={() => void saveUniformity()}
        onNavigateSample={navigateSample}
      />
    </div>
  );
}
