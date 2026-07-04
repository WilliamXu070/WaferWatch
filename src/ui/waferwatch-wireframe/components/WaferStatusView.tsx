"use client";

import { useMemo, useState } from "react";
import {
  ActivityIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DotsIcon,
  StackIcon,
  TargetIcon,
  WaferLogoIcon
} from "../icons";
import type {
  WaferFamilyModel,
  WaferStatusMetric,
  WaferStatusModel,
  WaferStatusTileModel,
  WaferTileStatus
} from "../types";
import { WaferGeometryPreview } from "./WaferGeometryPreview";

const statusDotColor: Record<WaferTileStatus, string> = {
  litho: "bg-[#161613]",
  etch: "bg-[#161613]",
  inspection: "bg-[#161613]",
  bond: "bg-[#8a887b]",
  test: "bg-[#8a887b]",
  dice: "bg-[#8a887b]",
  queued: "bg-[#c9c8ba]"
};

const metricIcons = {
  neutral: WaferLogoIcon,
  active: StackIcon,
  running: TargetIcon,
  yield: ActivityIcon
} as const;

const dieDetailTabs = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "Process history" },
  { id: "parameters", label: "Parameters" },
  { id: "results", label: "Results" },
  { id: "notes", label: "Notes" }
] as const;

type DieDetailTab = (typeof dieDetailTabs)[number]["id"];

const processTimeline = [
  { step: 1, title: "Wafer cleaning", time: "Jun 28, 9:10 AM", state: "complete" },
  { step: 2, title: "Lithography", time: "Jun 28, 11:05 AM", state: "complete" },
  { step: 3, title: "Etch - Waveguide", time: "Jun 28, 1:20 PM", state: "complete" },
  { step: 4, title: "Fixture poling", time: "In progress", state: "active" },
  { step: 5, title: "Anneal", time: "Pending", state: "pending" },
  { step: 6, title: "Metal deposition", time: "Pending", state: "pending" },
  { step: 7, title: "Passivation", time: "Pending", state: "pending" },
  { step: 8, title: "Test & Inspection", time: "Pending", state: "pending" }
] as const;

const parameterRows = [
  ["Poling voltage", "+4.5 kV"],
  ["Poling temperature", "85 °C"],
  ["Poling time", "30 min"],
  ["Ramp rate", "2 °C/min"],
  ["Electrode type", "Au"],
  ["Atmosphere", "N₂"],
  ["Fixture ID", "FIX-023"]
] as const;

const resultMetrics = [
  ["Center wavelength", "1550.12 nm"],
  ["Insertion loss", "0.32 dB"],
  ["Extinction ratio", "18.7 dB"],
  ["Sidewall angle", "86.2°"],
  ["Roughness (RMS)", "1.2 nm"],
  ["Yield impact", "Low risk"]
] as const;

const pulseResults = [
  "18.2 dB",
  "18.7 dB",
  "19.1 dB",
  "20.4 dB",
  "20.1 dB",
  "20.8 dB",
  "21.3 dB",
  "21.7 dB",
  "20.9 dB",
  "20.2 dB"
] as const;

const trendPoints = [
  [0, 70],
  [10, 64],
  [20, 60],
  [30, 56],
  [40, 49],
  [50, 45],
  [60, 38],
  [70, 34],
  [80, 42],
  [90, 48],
  [100, 58]
] as const;

const recentNotes = [
  {
    author: "adam",
    time: "Jul 1, 10:45 AM",
    body: "Using new poling fixture FIX-023. Stable temperature ramp observed.",
    tone: "green"
  },
  {
    author: "barbara",
    time: "Jun 28, 1:35 PM",
    body: "Etch profile looks good. Sidewall angle within spec.",
    tone: "amber"
  }
] as const;

function parseDieLabelIndex(value: string): number | undefined {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const codedMatches = normalized.match(/[A-Z]+[0-9]+/g);

  if (codedMatches?.length) {
    const bestMatch = [...codedMatches].reverse().find((match) => /^[A-Z]{1,3}[0-9]+$/.test(match));
    if (bestMatch) {
      const parsed = Number(bestMatch.replace(/^[A-Z]+/, ""));
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  const digitMatch = normalized.match(/\d+/);
  if (!digitMatch) {
    return undefined;
  }

  const parsed = Number(digitMatch[0]);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getSelectedDieLabel(tile: WaferStatusTileModel) {
  return parseDieLabelIndex(tile.dieLabel || tile.code);
}

function getWaferDisplayLabel(tile: WaferStatusTileModel, isUndiced: boolean) {
  return isUndiced ? tile.family : tile.code;
}

function isUndicedMode(tile: WaferStatusTileModel) {
  return tile.mode ? tile.mode === "undiced" : Boolean(tile.isUndiced);
}

function canOpenDieDetail(tile: WaferStatusTileModel) {
  return !isUndicedMode(tile) && tile.status !== "queued";
}

function getDieCodeParts(tile: WaferStatusTileModel) {
  const code = tile.dieLabel || tile.code;
  const match = code.toUpperCase().match(/^([A-Z]+)\s*([0-9]+)/);
  const row = match?.[1] ?? "A";
  const position = match?.[2] ?? String(getSelectedDieLabel(tile) ?? 1);

  return { code, row, position };
}

function getDieIdentity(tile: WaferStatusTileModel) {
  const parts = getDieCodeParts(tile);
  const paddedPosition = parts.position.padStart(2, "0");
  const familyCode = tile.family.replace(/[^A-Z0-9]+/gi, "").toUpperCase() || "DIE";

  return {
    ...parts,
    dieId: `${familyCode}-${parts.row}${paddedPosition}-2025-001`,
    material: "LiNbO₃ on SiO₂",
    dimensions: "5.0 mm × 5.0 mm",
    thickness: "600 µm",
    orientation: "X-cut"
  };
}

function statusLabel(tile: WaferStatusTileModel) {
  if (tile.status === "queued") return "Pending";
  return "In progress";
}

function ResultTrendChart() {
  const linePath = trendPoints
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const areaPath = `${linePath} L 100 100 L 0 100 Z`;

  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Performance trend" className="h-32 w-full overflow-visible">
      {[25, 50, 75].map((y) => (
        <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#e6e6da" strokeDasharray="2 3" strokeWidth="0.7" />
      ))}
      <path d={areaPath} fill="rgba(107,127,87,0.18)" />
      <path d={linePath} fill="none" stroke="#6b7f57" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      {trendPoints.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill="#f7fbf1" stroke="#6b7f57" strokeWidth="1.4" />
      ))}
    </svg>
  );
}

function MetricTile({ metric }: { metric: WaferStatusMetric }) {
  const Icon = metricIcons[metric.tone];

  return (
    <div className="grid min-h-[108px] grid-cols-[44px_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-[#e5e5db] bg-white px-5 shadow-[0_10px_24px_-20px_rgba(30,29,22,0.28)]">
      <span
        className={[
          "grid h-11 w-11 place-items-center rounded-lg border",
          metric.tone === "yield"
            ? "border-[#dcdbca] bg-[#f2f2e8] text-[#161613]"
            : "border-[#e5e4d8] bg-[#f7f7ef] text-[#55534a]"
        ].join(" ")}
      >
        <Icon />
      </span>
      <div className="min-w-0">
        <p className="text-[32px] font-semibold leading-none tracking-normal text-[#151512]">
          {metric.value}
        </p>
        <p className="mt-1 text-[13px] font-medium text-[#8a887b]">{metric.label}</p>
      </div>
    </div>
  );
}

function WaferTile({
  tile,
  selected,
  isUndiced,
  onSelect
}: {
  tile: WaferStatusTileModel;
  selected: boolean;
  isUndiced: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        "relative grid min-h-[132px] grid-cols-[minmax(82px,0.9fr)_minmax(112px,1.1fr)] gap-3 rounded-xl border bg-white p-4 text-left transition-all",
        selected
          ? "border-[#161613] shadow-[0_0_0_1px_rgba(22,22,19,0.28),0_14px_28px_-24px_rgba(30,29,22,0.4)]"
          : "border-[#e5e4d8] hover:-translate-y-px hover:border-[#cfcec0] hover:bg-[#fbfbf6]"
      ].join(" ")}
    >
      <span className="min-w-0">
        <span className="block text-[18px] font-semibold leading-none text-[#151512]">
          {getWaferDisplayLabel(tile, isUndiced)}
        </span>
        <span className="mt-4 flex items-center gap-2 text-[13px] font-medium text-[#6b6a5f]">
          <span className={["h-2.5 w-2.5 rounded-full", statusDotColor[tile.status]].join(" ")} />
          {tile.stepLabel}
        </span>
      </span>
      <span className="grid min-h-[86px] place-items-center rounded-lg border border-[#e7e6da] bg-[#f7f7ef] px-2 py-1">
        <WaferGeometryPreview
          modeKeyword={tile.waferStateName}
          selectedLabel={getSelectedDieLabel(tile)}
          selectedDieCode={isUndiced ? undefined : (tile.dieLabel || tile.code)}
          colorSeed={tile.family}
          showOnlySelectedDie={!isUndiced}
          showDieLabel={false}
          dimmed={tile.status === "queued"}
          className="max-h-[78px]"
        />
      </span>
      {selected ? (
        <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-[#161613] text-[12px] font-semibold text-white">
          ✓
        </span>
      ) : null}
    </button>
  );
}

function FamilySection({
  family,
  selectedTile,
  onSelect
}: {
  family: WaferFamilyModel;
  selectedTile: WaferStatusTileModel | null;
  onSelect: (tile: WaferStatusTileModel) => void;
}) {
  const [open, setOpen] = useState(true);
  const familyMuted = family.status === "setup";

  return (
    <section className="rounded-2xl border border-[#e5e5db] bg-white shadow-[0_12px_32px_-28px_rgba(30,29,22,0.3)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 px-6 py-4 text-left"
      >
        <span
          className={[
            "h-3.5 w-3.5 rounded-full",
            family.status === "active" ? "bg-[#161613]" : "bg-[#c9c8ba]"
          ].join(" ")}
        />
        <span className={["text-[24px] font-semibold leading-none tracking-normal", familyMuted ? "text-[#98968a]" : "text-[#151512]"].join(" ")}>
          {family.name}
        </span>
        <span className="rounded-md bg-[#efefe3] px-2 py-0.5 text-[12px] font-semibold text-[#55534a]">
          {family.tiles.length}
        </span>
        <ChevronRightIcon
          className={[
            "ml-auto text-[#8a887b] transition-transform",
            open ? "rotate-90" : "rotate-0"
          ].join(" ")}
        />
      </button>

      {open ? (
        <div className="grid grid-cols-1 gap-3 border-t border-[#eeeee4] p-4 md:grid-cols-2 xl:grid-cols-4">
          {family.tiles.map((tile) => (
            <WaferTile
              key={tile.id}
              tile={tile}
              isUndiced={isUndicedMode(tile)}
              selected={selectedTile?.id === tile.id}
              onSelect={() => onSelect(tile)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SelectedDiePanel({
  selectedTile,
  isUndiced
}: {
  selectedTile: WaferStatusTileModel;
  isUndiced: boolean;
}) {
  const displayLabel = getWaferDisplayLabel(selectedTile, isUndiced);

  return (
    <aside className="grid gap-4 rounded-2xl border border-[#e5e5db] bg-white p-5 shadow-[0_14px_36px_-28px_rgba(30,29,22,0.32)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-[#98968a]">
            {isUndiced ? "Selected wafer" : "Selected die"}
          </p>
          <h2 className="mt-1 text-[24px] font-semibold leading-none text-[#151512]">
            {displayLabel}
          </h2>
        </div>
        <span className="rounded-md border border-[#dcdbca] bg-[#f2f2e8] px-2.5 py-1 text-[12px] font-semibold text-[#161613]">
          {selectedTile.stepLabel}
        </span>
      </div>

      <div className="grid min-h-[260px] place-items-center rounded-xl border border-[#e7e6da] bg-[#f7f7ef] p-5">
        <WaferGeometryPreview
          modeKeyword={selectedTile.waferStateName}
          selectedLabel={getSelectedDieLabel(selectedTile)}
          selectedDieCode={isUndiced ? undefined : (selectedTile.dieLabel || selectedTile.code)}
          colorSeed={selectedTile.family}
          showOnlySelectedDie={!isUndiced}
          showDieLabel={false}
          className="max-h-[320px]"
        />
      </div>
    </aside>
  );
}

function DetailCard({
  title,
  action,
  children,
  className = ""
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={["rounded-2xl border border-[#e8e8de] bg-white p-5 shadow-[0_14px_34px_-30px_rgba(30,29,22,0.34)]", className].join(" ")}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-[15px] font-semibold text-[#151512]">{title}</h3>
        {action ? (
          <button type="button" className="text-[12px] font-semibold text-[#6b7f57] hover:text-[#40522f]">
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function DiePreviewCard({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <DetailCard title="Die preview">
      <div className="grid min-h-[220px] place-items-center rounded-xl bg-[#f8f8f1] p-6">
        <WaferGeometryPreview
          modeKeyword={tile.waferStateName}
          selectedLabel={getSelectedDieLabel(tile)}
          selectedDieCode={tile.dieLabel || tile.code}
          colorSeed={tile.family}
          showOnlySelectedDie
          showDieLabel={false}
          className="max-h-[210px]"
        />
      </div>
      <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl border border-[#e8e8de] bg-[#fbfbf6] text-center text-[13px] font-semibold text-[#6b6a5f]">
        {["Front", "Back", "3D"].map((view, index) => (
          <button
            key={view}
            type="button"
            className={[
              "h-10 hover:bg-white",
              index === 0 ? "bg-white text-[#151512] shadow-[0_8px_18px_-16px_rgba(30,29,22,0.45)]" : "border-l border-[#ecece1]"
            ].join(" ")}
          >
            {view}
          </button>
        ))}
      </div>
    </DetailCard>
  );
}

function CurrentStepCard({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <DetailCard title="Current step">
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-semibold leading-none text-[#151512]">{tile.stepLabel}</h2>
        <span className="rounded-md bg-[#e7f4e3] px-2 py-1 text-[12px] font-semibold text-[#4f7a43]">
          {statusLabel(tile)}
        </span>
      </div>
      <div className="mt-7">
        <div className="mb-2 flex items-center justify-between text-[13px] font-medium text-[#6b6a5f]">
          <span>Step 4 of 8</span>
          <span>50%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#ecece3]">
          <div className="h-full w-1/2 rounded-full bg-[#6b7f57]" />
        </div>
      </div>
      <dl className="mt-8 grid gap-5 text-[14px]">
        {[
          ["Started", "Jul 1, 2025 · 10:42 AM"],
          ["Est. completion", "Jul 1, 2025 · 2:00 PM"],
          ["Operator", "adam"]
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-4">
            <dt className="font-medium text-[#8a887b]">{label}</dt>
            <dd className="font-semibold text-[#151512]">{value}</dd>
          </div>
        ))}
      </dl>
    </DetailCard>
  );
}

function QuickInfoCard({ tile }: { tile: WaferStatusTileModel }) {
  const identity = getDieIdentity(tile);
  const rows = [
    ["Wafer", tile.family],
    ["Die ID", identity.dieId],
    ["Material", identity.material],
    ["Dimensions", identity.dimensions],
    ["Thickness", identity.thickness],
    ["Orientation", identity.orientation],
    ["Created", "Jun 28, 2025"],
    ["Status", "Active"]
  ];

  return (
    <DetailCard title="Quick info">
      <dl className="grid gap-4 text-[14px]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4">
            <dt className="font-medium text-[#8a887b]">{label}</dt>
            <dd className="font-semibold text-[#151512]">
              {label === "Status" ? (
                <span className="rounded-md bg-[#e7f4e3] px-2 py-1 text-[12px] text-[#4f7a43]">{value}</span>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </DetailCard>
  );
}

function KeyResultsCard() {
  return (
    <DetailCard title="Key results (latest)" action="View all">
      <div className="grid grid-cols-2 gap-3">
        {resultMetrics.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-[#fafaf5] p-4">
            <p className="text-[12px] font-medium text-[#8a887b]">{label}</p>
            <p className="mt-1 text-[16px] font-semibold text-[#151512]">{value}</p>
          </div>
        ))}
      </div>
    </DetailCard>
  );
}

function PerformanceTrendCard() {
  return (
    <DetailCard title="Performance trend" action="View details">
      <ResultTrendChart />
      <div className="mt-1 flex justify-between text-[11px] font-medium text-[#8a887b]">
        <span>Step 1</span>
        <span>Step 2</span>
        <span>Step 3</span>
        <span>Step 4</span>
      </div>
    </DetailCard>
  );
}

function NotesCard() {
  return (
    <DetailCard title="Notes (latest)" action="View all">
      <div className="grid gap-3">
        {recentNotes.map((note) => (
          <article key={`${note.author}-${note.time}`} className="rounded-xl bg-[#fafaf5] p-4">
            <div className="mb-2 flex items-center gap-2">
              <span
                className={[
                  "grid h-5 w-5 place-items-center rounded-md text-[11px] font-semibold text-white",
                  note.tone === "green" ? "bg-[#6b7f57]" : "bg-[#d9a441]"
                ].join(" ")}
              >
                {note.author[0]}
              </span>
              <strong className="text-[13px] text-[#151512]">{note.author}</strong>
              <span className="text-[12px] font-medium text-[#98968a]">{note.time}</span>
            </div>
            <p className="text-[13px] leading-5 text-[#4a483f]">{note.body}</p>
          </article>
        ))}
        <button
          type="button"
          className="mt-1 h-10 rounded-xl border border-[#e1e1d7] bg-white text-[14px] font-semibold text-[#4a483f] hover:bg-[#f8f8f1]"
        >
          + Add note
        </button>
      </div>
    </DetailCard>
  );
}

function ProcessTimelineCard() {
  return (
    <DetailCard title="Process timeline" className="lg:col-span-3">
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ol className="grid gap-1">
          {processTimeline.map((item) => (
            <li
              key={item.step}
              className={[
                "grid grid-cols-[28px_minmax(0,1fr)_18px] items-center gap-3 rounded-xl px-2 py-2",
                item.state === "active" ? "bg-[#f1f1e8]" : ""
              ].join(" ")}
            >
              <span
                className={[
                  "grid h-6 w-6 place-items-center rounded-full border text-[12px] font-semibold",
                  item.state === "pending"
                    ? "border-[#d8d7cb] bg-white text-[#8a887b]"
                    : "border-[#6b7f57] bg-[#6b7f57] text-white"
                ].join(" ")}
              >
                {item.step}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-[14px] text-[#151512]">{item.title}</strong>
                <span className={["text-[12px] font-medium", item.state === "active" ? "text-[#6b7f57]" : "text-[#8a887b]"].join(" ")}>
                  {item.time}
                </span>
              </span>
              {item.state === "complete" ? <CheckCircleIcon className="text-[#6b7f57]" /> : null}
            </li>
          ))}
        </ol>

        <div className="rounded-2xl border border-[#ecece1] p-5">
          <div className="mb-5 flex items-center gap-3">
            <h3 className="text-[17px] font-semibold text-[#151512]">Step 4: Fixture poling</h3>
            <span className="rounded-md bg-[#e7f4e3] px-2 py-1 text-[12px] font-semibold text-[#4f7a43]">
              In progress
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[#ecece1] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-[14px] font-semibold text-[#151512]">Parameters</h4>
                <button type="button" className="rounded-md border border-[#e4e3d8] px-2 py-1 text-[12px] font-semibold text-[#6b6a5f]">
                  Edit
                </button>
              </div>
              <dl className="grid gap-3 text-[14px]">
                {parameterRows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-[#6b6a5f]">{label}</dt>
                    <dd className="font-semibold text-[#151512]">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-xl border border-[#ecece1] p-4">
              <h4 className="mb-4 text-[14px] font-semibold text-[#151512]">Live log</h4>
              <div className="grid gap-3 text-[14px]">
                {[
                  ["10:42 AM", "Step started by adam"],
                  ["10:43 AM", "Fixture connected"],
                  ["10:44 AM", "Voltage ramp initiated"],
                  ["10:52 AM", "Target temperature reached"],
                  ["11:12 AM", "Holding... (15/30 min)"]
                ].map(([time, text]) => (
                  <div key={time} className="grid grid-cols-[78px_minmax(0,1fr)] gap-4">
                    <span className="font-medium text-[#98968a]">{time}</span>
                    <span className={text.startsWith("Holding") ? "font-semibold text-[#6b7f57]" : "text-[#4a483f]"}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DetailCard>
  );
}

function ParametersTableCard() {
  const columns = ["Pulse 1", "Pulse 2", "Pulse 3", "Pulse 4", "Pulse 5", "Pulse 6", "Pulse 7", "Pulse 8", "Pulse 9", "Pulse 10", "Unit"];
  const rows = [
    ["Poling voltage", "510", "500", "490", "480", "470", "460", "450", "440", "450", "460", "V"],
    ["Poling temperature", "100", "100", "100", "100", "100", "100", "100", "100", "100", "100", "°C"],
    ["Poling time", "10", "10", "10", "10", "10", "10", "10", "10", "10", "10", "min"],
    ["# of pulses", "1", "1", "1", "10", "10", "10", "10", "10", "10", "10", ""],
    ["Post-pulse voltage", "300", "300", "300", "300", "300", "300", "300", "300", "300", "300", "V"],
    ["Post-pulse width", "250", "250", "250", "250", "250", "250", "250", "250", "250", "250", "µs"]
  ];

  return (
    <DetailCard title="Fabrication parameters" className="lg:col-span-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#e7e7dc] text-[#8a887b]">
              <th className="py-2 pr-4 font-semibold">Parameter</th>
              {columns.map((column) => (
                <th key={column} className={["px-3 py-2 font-semibold", column === "Pulse 8" ? "bg-[#edf6e8] text-[#151512]" : ""].join(" ")}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-b border-[#efefe6] last:border-0">
                {row.map((cell, index) => (
                  <td
                    key={`${row[0]}-${index}`}
                    className={[
                      "py-2 pr-4 font-medium text-[#4a483f]",
                      index === 9 ? "bg-[#edf6e8] font-semibold text-[#4f7a43]" : "",
                      index > 0 ? "px-3" : ""
                    ].join(" ")}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DetailCard>
  );
}

function ResultsSequenceCard() {
  return (
    <DetailCard title="Result sequence" action="View full sequence" className="lg:col-span-3">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] font-medium text-[#6b6a5f]">
        <span>Step 4 of 8</span>
        <span>•</span>
        <span>Fixture poling</span>
        <span className="rounded-md bg-[#e7f4e3] px-2 py-1 text-[12px] font-semibold text-[#4f7a43]">In progress</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {pulseResults.map((value, index) => {
          const pulse = index + 1;
          return (
            <article
              key={pulse}
              className={[
                "rounded-xl border bg-white p-3",
                pulse === 8 ? "border-[#6b6a5f] shadow-[0_0_0_1px_rgba(107,106,95,0.25)]" : "border-[#e8e8de]"
              ].join(" ")}
            >
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[13px] font-semibold text-[#151512]">Pulse {pulse}</h4>
                {pulse === 8 ? (
                  <span className="rounded-md bg-[#dff0d6] px-2 py-0.5 text-[11px] font-semibold text-[#4f7a43]">Best</span>
                ) : null}
              </div>
              <div className="h-24 rounded-lg border border-dashed border-[#deded3] bg-[#f8f8f1]" />
              <p className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-[#4a483f]">
                <span className={["h-2.5 w-2.5 rounded-full", pulse === 3 || pulse === 4 ? "bg-[#d9a441]" : "bg-[#6b7f57]"].join(" ")} />
                {value}
              </p>
            </article>
          );
        })}
      </div>
    </DetailCard>
  );
}

function DieOverviewContent({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4 lg:grid-cols-3">
        <DiePreviewCard tile={tile} />
        <CurrentStepCard tile={tile} />
        <QuickInfoCard tile={tile} />
        <ProcessTimelineCard />
      </div>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
        <PerformanceTrendCard />
        <NotesCard />
      </aside>
    </div>
  );
}

function DieHistoryContent() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <ProcessTimelineCard />
      <aside className="grid content-start gap-4">
        <PerformanceTrendCard />
        <NotesCard />
      </aside>
    </div>
  );
}

function DieParametersContent({ tile }: { tile: WaferStatusTileModel }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <ParametersTableCard />
      <aside className="grid content-start gap-4">
        <CurrentStepCard tile={tile} />
        <NotesCard />
      </aside>
    </div>
  );
}

function DieResultsContent() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4">
        <ResultsSequenceCard />
        <ParametersTableCard />
      </div>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
        <PerformanceTrendCard />
      </aside>
    </div>
  );
}

function DieNotesContent() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <DetailCard title="Notes" className="min-h-[520px]">
        <div className="grid gap-3">
          {recentNotes.map((note) => (
            <article key={`${note.author}-${note.time}-expanded`} className="rounded-2xl border border-[#ecece1] bg-[#fafaf5] p-5">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={[
                    "grid h-7 w-7 place-items-center rounded-lg text-[12px] font-semibold text-white",
                    note.tone === "green" ? "bg-[#6b7f57]" : "bg-[#d9a441]"
                  ].join(" ")}
                >
                  {note.author[0]}
                </span>
                <strong className="text-[14px] text-[#151512]">{note.author}</strong>
                <span className="text-[13px] font-medium text-[#98968a]">{note.time}</span>
              </div>
              <p className="text-[14px] leading-6 text-[#4a483f]">{note.body}</p>
            </article>
          ))}
          <button
            type="button"
            className="h-11 rounded-xl border border-[#e1e1d7] bg-white text-[14px] font-semibold text-[#4a483f] hover:bg-[#f8f8f1]"
          >
            + Add note
          </button>
        </div>
      </DetailCard>
      <aside className="grid content-start gap-4">
        <KeyResultsCard />
        <PerformanceTrendCard />
      </aside>
    </div>
  );
}

function DieDetailContent({ activeTab, tile }: { activeTab: DieDetailTab; tile: WaferStatusTileModel }) {
  if (activeTab === "history") return <DieHistoryContent />;
  if (activeTab === "parameters") return <DieParametersContent tile={tile} />;
  if (activeTab === "results") return <DieResultsContent />;
  if (activeTab === "notes") return <DieNotesContent />;
  return <DieOverviewContent tile={tile} />;
}

function DieDetailView({
  tile,
  onBack,
  onNavigate,
  canNavigateBack,
  canNavigateForward
}: {
  tile: WaferStatusTileModel;
  onBack: () => void;
  onNavigate: (direction: -1 | 1) => void;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
}) {
  const [activeTab, setActiveTab] = useState<DieDetailTab>("overview");
  const identity = getDieIdentity(tile);
  const displayLabel = tile.dieLabel || tile.code;

  return (
    <section className="grid gap-4 rounded-[22px] bg-[#f8f8f2] p-4 shadow-[inset_0_0_0_1px_rgba(232,232,222,0.74)]">
      <div className="rounded-[18px] bg-white px-7 py-6 shadow-[0_20px_48px_-42px_rgba(30,29,22,0.55)]">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#8a887b]">
          <button type="button" onClick={onBack} className="hover:text-[#151512]">Wafers</button>
          <ChevronRightIcon />
          <span>Codex Wireframe V1</span>
          <ChevronRightIcon />
          <span className="text-[#151512]">Die {displayLabel}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[36px] font-semibold leading-none tracking-normal text-[#151512]">Die {displayLabel}</h1>
              <span className="inline-flex items-center gap-2 rounded-xl border border-[#e6e6dc] px-3 py-1.5 text-[14px] font-semibold text-[#4a483f]">
                <span className="h-2.5 w-2.5 rounded-full bg-[#6b7f57]" />
                {tile.stepLabel}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[#6b6a5f]">
              {[tile.family, `Row ${identity.row}`, `Position ${identity.position}`, `ID: ${identity.dieId}`].map((tag) => (
                <span key={tag} className="rounded-lg border border-[#e7e7dc] bg-[#fbfbf6] px-2.5 py-1">
                  {tag}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[#98968a]">
                <ClockIcon />
                Last updated 2h ago by adam
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className="h-10 rounded-xl border border-[#e2e2d8] bg-white px-4 text-[14px] font-semibold text-[#4a483f] hover:bg-[#f8f8f1]">
              Export report
            </button>
            <button type="button" className="grid h-10 w-12 place-items-center rounded-xl border border-[#e2e2d8] bg-white text-[#4a483f] hover:bg-[#f8f8f1]" aria-label="More actions">
              <DotsIcon />
            </button>
            <button
              type="button"
              disabled={!canNavigateBack}
              onClick={() => onNavigate(-1)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-[#e2e2d8] bg-white text-[#4a483f] hover:bg-[#f8f8f1] disabled:opacity-40"
              aria-label="Previous die"
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              disabled={!canNavigateForward}
              onClick={() => onNavigate(1)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-[#e2e2d8] bg-white text-[#4a483f] hover:bg-[#f8f8f1] disabled:opacity-40"
              aria-label="Next die"
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        <div className="mt-7 overflow-hidden rounded-2xl border border-[#e8e8de]">
          <div className="flex overflow-x-auto bg-white">
            {dieDetailTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "relative flex h-14 shrink-0 items-center px-6 text-[14px] font-semibold",
                  activeTab === tab.id ? "text-[#151512]" : "text-[#6b6a5f] hover:bg-[#fbfbf6]"
                ].join(" ")}
              >
                {tab.label}
                {activeTab === tab.id ? (
                  <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#6b7f57]" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <DieDetailContent activeTab={activeTab} tile={tile} />
    </section>
  );
}

function EmptyWaferStatusState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-[#d8d6ca] bg-[#fbfbf7] p-10 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98968a]">
        Backend wafer viewer
      </p>
      <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#151512]">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-6 text-[#6b6a5f]">
        {description}
      </p>
    </section>
  );
}

export function WaferStatusView({
  model,
  emptyTitle = "No wafers available",
  emptyDescription = "Authenticated Supabase data loaded, but this project state has no wafers visible to the current session."
}: {
  model: WaferStatusModel;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const initialSelected = useMemo(
    () =>
      model.families
        .flatMap((family) => family.tiles)
        .find((tile) => tile.isSelected) ?? model.families[0]?.tiles[0] ?? null,
    [model]
  );
  const [selectedTile, setSelectedTile] = useState<WaferStatusTileModel | null>(initialSelected);
  const [detailTile, setDetailTile] = useState<WaferStatusTileModel | null>(null);
  const selectedUndiced = selectedTile ? isUndicedMode(selectedTile) : false;
  const hasWafers = model.families.some((family) => family.tiles.length > 0);
  const detailTiles = model.families
    .flatMap((family) => family.tiles)
    .filter(canOpenDieDetail);
  const activeDetailTile = detailTile
    ? detailTiles.find((tile) => tile.id === detailTile.id) ?? detailTile
    : null;
  const activeDetailIndex = activeDetailTile
    ? detailTiles.findIndex((tile) => tile.id === activeDetailTile.id)
    : -1;
  const handleSelectTile = (tile: WaferStatusTileModel) => {
    setSelectedTile(tile);
    if (canOpenDieDetail(tile)) {
      setDetailTile(tile);
    }
  };
  const handleNavigateDetail = (direction: -1 | 1) => {
    const nextTile = detailTiles[activeDetailIndex + direction];
    if (!nextTile) return;
    setSelectedTile(nextTile);
    setDetailTile(nextTile);
  };

  if (hasWafers && activeDetailTile) {
    return (
      <div className="grid gap-5 p-6">
        <DieDetailView
          tile={activeDetailTile}
          onBack={() => setDetailTile(null)}
          onNavigate={handleNavigateDetail}
          canNavigateBack={activeDetailIndex > 0}
          canNavigateForward={activeDetailIndex >= 0 && activeDetailIndex < detailTiles.length - 1}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5 p-6">
      {hasWafers ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {model.metrics.map((metric) => (
            <MetricTile key={metric.id} metric={metric} />
          ))}
        </section>
      ) : null}

      {hasWafers ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-4">
            {model.families.map((family) => (
              <FamilySection
                key={family.id}
                family={family}
                selectedTile={selectedTile}
                onSelect={handleSelectTile}
              />
            ))}
          </div>
          {selectedTile ? (
            <SelectedDiePanel
              selectedTile={selectedTile}
              isUndiced={selectedUndiced}
            />
          ) : null}
        </section>
      ) : (
        <EmptyWaferStatusState
          title={emptyTitle}
          description={emptyDescription}
        />
      )}
    </div>
  );
}
