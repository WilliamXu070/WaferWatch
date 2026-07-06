"use client";

import { useCallback, useMemo, useState } from "react";
import { upsertTextSurface } from "@/features/text-surfaces/actions";
import type { WaferStatusTileModel } from "../../types";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterIcon,
  PlusIcon
} from "../../icons";
import {
  buildToneMap,
  chipColumns,
  chipRowSections,
  getDisplayParameterValue,
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
  metric: string;
  imageCount: number;
  selectedImage: number;
  uniformity: string;
  loss: string;
};

type SampleNote = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
};

const RESULT_SAMPLE_SCOPE_TYPE = "wireframe:result_sample";
const RESULT_SAMPLE_NOTES_FIELD = "notes";
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
      const base = 17.2 + row * 0.35 + column * 0.18;
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
        metric: status === "missing" ? "No image" : `${(base + (status === "best" ? 1.5 : 0)).toFixed(1)} dB`,
        imageCount: status === "missing" ? 0 : column % 4 === 0 ? 2 : column === 12 ? 3 : 1,
        selectedImage: status === "missing" ? 0 : column === 12 ? 3 : 1,
        uniformity: status === "missing" ? "Pending" : `${(base + 0.7).toFixed(1)} dB`,
        loss: status === "missing" ? "Pending" : status === "review" ? "Pending" : `${(1.8 + row * 0.1 + column * 0.03).toFixed(2)} dB`
      };
    });
  });
}

const resultSamples = buildSamples();

function getSampleKey(tile: WaferStatusTileModel, sample: ResultSample) {
  const dieCode = tile.dieLabel || tile.code;
  return `${tile.waferId}:${dieCode}:R${sample.row}:C${sample.column}:image-${sample.selectedImage || 0}`;
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
  imageIndex,
  className = ""
}: {
  sample: ResultSample;
  imageIndex?: number;
  className?: string;
}) {
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
  selected,
  onSelect
}: {
  sample: ResultSample;
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
      <ResultImage sample={sample} className="h-[72px] w-full" />
      <span className="flex items-center gap-1 text-[11px] font-semibold text-[#44443f]">
        <span className={["h-2 w-2 rounded-full", meta.dot].join(" ")} />
        {sample.metric}
      </span>
      {sample.status === "best" ? (
        <span className="absolute -right-1 -top-2 rounded-md bg-[#2aa866] px-2 py-0.5 text-[10px] font-semibold text-white">
          Best
        </span>
      ) : null}
    </button>
  );
}

function ResultMetadataBand() {
  const metadata = [
    ["Recipe", recipeCode],
    ["Performed by", "Saeed / Lai / William"],
    ["Fabricated by", "Saeed"],
    ["Stack", "1 mm PPLN on TFLN-3"],
    ["Electrode", "sharp-sharp"],
    ["Wafer EBL", "May 28"],
    ["Poling date", "Pending"],
    ["Wafer ID", "TFLN-3"]
  ];

  return (
    <section className="grid gap-y-5 rounded-lg border border-[#e8e8e3] bg-white px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
      {metadata.map(([label, value]) => (
        <div key={label} className="min-w-0 pr-5">
          <p className="text-[12px] font-semibold text-[#8a887b]">{label}</p>
          <p className="mt-1 truncate text-[14px] font-semibold text-[#33332f]">{value}</p>
        </div>
      ))}
    </section>
  );
}

function ViewControls() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[#777770]">
        <span>View</span>
        <div className="flex rounded-lg border border-[#e4e4df] bg-white p-1">
          {["Grid", "List", "Heatmap"].map((view) => (
            <button
              key={view}
              type="button"
              className={[
                "h-8 rounded-md px-3 text-[12px] font-semibold",
                view === "Grid" ? "bg-[#f1f1ed] text-[#111111]" : "text-[#66665f] hover:bg-[#fafafa]"
              ].join(" ")}
              aria-pressed={view === "Grid"}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[12px] font-semibold text-[#66665f]">
        {(Object.keys(statusMeta) as ResultStatus[]).map((status) => (
          <span key={status} className="inline-flex items-center gap-2">
            <span className={["h-2.5 w-2.5 rounded-full", statusMeta[status].dot].join(" ")} />
            {statusMeta[status].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResultsGrid({
  selectedSample,
  onSelectSample
}: {
  selectedSample: ResultSample;
  onSelectSample: (sample: ResultSample) => void;
}) {
  return (
    <section className="grid gap-6">
      <ViewControls />
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
  selectedSample
}: {
  tile: WaferStatusTileModel;
  selectedSample: ResultSample;
}) {
  const toneMaps = useMemo(() => buildDisplayToneMaps(tile), [tile]);

  return (
    <section className="rounded-lg border border-[#e8e8e3] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eeeeea] px-4 py-3">
        <div className="flex items-center gap-2">
          <ChevronRightIcon className="rotate-90 text-[#55554f]" />
          <h3 className="text-[14px] font-semibold text-[#111111]">Parameter context (Row {selectedSample.row})</h3>
        </div>
        <div className="flex items-center gap-3 text-[12px] font-semibold text-[#777770]">
          <span>Show:</span>
          <span className="rounded-md border border-[#e1e1dc] bg-white px-3 py-1.5 text-[#44443f]">Row {selectedSample.row}</span>
          <span>Units</span>
          <span className="h-5 w-9 rounded-full bg-[#777770] p-0.5">
            <span className="block h-4 w-4 translate-x-4 rounded-full bg-white" />
          </span>
        </div>
      </div>
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
                  const value = getDisplayParameterValue(tile, selectedSample.row, column, row.field);
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
    </section>
  );
}

function RelatedImages({
  selectedSample
}: {
  selectedSample: ResultSample;
}) {
  return (
    <section className="rounded-lg border border-[#e8e8e3] bg-white px-4 py-3">
      <h3 className="text-[14px] font-semibold text-[#111111]">
        All images for {selectedSample.id} ({selectedSample.imageCount})
      </h3>
      <div className="mt-3 flex flex-wrap gap-3">
        {selectedSample.imageCount > 0
          ? Array.from({ length: selectedSample.imageCount }, (_, index) => (
              <button
                key={index}
                type="button"
                className={[
                  "relative h-[88px] w-[150px] rounded-lg border bg-white p-1",
                  index + 1 === selectedSample.selectedImage ? "border-[#111111] shadow-[0_0_0_1px_#111111]" : "border-[#e4e4df]"
                ].join(" ")}
              >
                <span className="absolute left-2 top-2 z-10 grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] font-semibold text-[#44443f]">
                  {index + 1}
                </span>
                <ResultImage sample={selectedSample} imageIndex={index + 1} className="h-full w-full" />
              </button>
            ))
          : null}
        <button
          type="button"
          className="grid h-[88px] w-[118px] place-items-center rounded-lg border border-dashed border-[#d8d8d2] bg-white text-[12px] font-semibold text-[#777770]"
        >
          <span className="grid gap-1 place-items-center">
            <PlusIcon />
            Upload more
          </span>
        </button>
      </div>
    </section>
  );
}

function SelectedSamplePanel({
  tile,
  selectedSample,
  notes,
  draftNote,
  isSavingNote,
  noteError,
  onDraftNoteChange,
  onAddNote,
  onNavigateSample
}: {
  tile: WaferStatusTileModel;
  selectedSample: ResultSample;
  notes: readonly SampleNote[];
  draftNote: string;
  isSavingNote: boolean;
  noteError: string | null;
  onDraftNoteChange: (value: string) => void;
  onAddNote: () => void;
  onNavigateSample: (direction: -1 | 1) => void;
}) {
  const meta = statusMeta[selectedSample.status];
  const sampleTitle = `${recipeCode} ${selectedSample.id}`;

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
            {selectedSample.imageCount ? `${selectedSample.selectedImage} of ${selectedSample.imageCount}` : "0 of 0"}
          </span>
        </div>
        <ResultImage sample={selectedSample} className="h-[210px] w-full" />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-[#e1e1dc] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#44443f]">
            <span>-</span>
            <span>100%</span>
            <span>+</span>
          </div>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-[#55554f]">
            <button type="button" className="rounded-md border border-[#e1e1dc] px-2 py-1 hover:bg-[#fafafa]">Download</button>
            <button type="button" className="rounded-md border border-[#e1e1dc] px-2 py-1 hover:bg-[#fafafa]">Expand</button>
          </div>
        </div>
      </div>

      <div className="border-t border-[#eeeeea] pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[#111111]">Key results</h3>
          <span className={["rounded-md border px-2 py-1 text-[12px] font-semibold", meta.badge].join(" ")}>
            {meta.label}
          </span>
        </div>
        <dl className="grid gap-3 text-[13px]">
          <div>
            <dt className="text-[12px] font-semibold text-[#777770]">Uniformity</dt>
            <dd className="mt-1 text-[24px] font-semibold text-[#111111]">{selectedSample.uniformity}</dd>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-[#eeeeea] pt-3">
            <div>
              <dt className="text-[12px] font-semibold text-[#777770]">Loss (est.)</dt>
              <dd className="mt-1 font-semibold text-[#111111]">{selectedSample.loss}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-semibold text-[#777770]">Status</dt>
              <dd className="mt-1 font-semibold text-[#111111]">{meta.label}</dd>
            </div>
          </div>
        </dl>
      </div>

      <div className="border-t border-[#eeeeea] pt-4">
        <h3 className="text-[14px] font-semibold text-[#111111]">Source parameters</h3>
        <dl className="mt-3 grid gap-2 text-[13px]">
          {parameterRows.map((row) => (
            <div key={row.field} className="flex items-center justify-between gap-4">
              <dt className="text-[#777770]">{row.label}</dt>
              <dd className="font-semibold text-[#111111]">
                {getDisplayParameterValue(tile, selectedSample.row, selectedSample.column, row.field)}
              </dd>
            </div>
          ))}
        </dl>
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
          placeholder={`Add a note linked to ${tile.dieLabel || tile.code} ${selectedSample.id} image ${selectedSample.selectedImage || 0}...`}
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
  const [draftNote, setDraftNote] = useState("");
  const [notesBySample, setNotesBySample] = useState<Record<string, SampleNote[]>>({});
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const selectedSample = useMemo(
    () => resultSamples.find((sample) => sample.id === selectedSampleId) ?? resultSamples[0],
    [selectedSampleId]
  );
  const sampleScopeKey = useMemo(() => getSampleKey(tile, selectedSample), [selectedSample, tile]);
  const selectedNotes = useMemo(() => notesBySample[sampleScopeKey] ?? [], [notesBySample, sampleScopeKey]);

  const selectSample = useCallback((sample: ResultSample) => {
    setSelectedSampleId(sample.id);
    setDraftNote("");
    setNoteError(null);
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

        <ResultMetadataBand />
        <ResultsGrid selectedSample={selectedSample} onSelectSample={selectSample} />
        <ParameterContext tile={tile} selectedSample={selectedSample} />
        <RelatedImages selectedSample={selectedSample} />
      </div>

      <SelectedSamplePanel
        tile={tile}
        selectedSample={selectedSample}
        notes={selectedNotes}
        draftNote={draftNote}
        isSavingNote={isSavingNote}
        noteError={noteError}
        onDraftNoteChange={setDraftNote}
        onAddNote={addSampleNote}
        onNavigateSample={navigateSample}
      />
    </div>
  );
}
