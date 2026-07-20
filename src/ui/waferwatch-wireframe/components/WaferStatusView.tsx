"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIcon,
  StackIcon,
  TargetIcon,
  WaferLogoIcon
} from "../icons";
import type {
  WaferFamilyModel,
  WaferStatusMetric,
  WaferStatusModel,
  WaferStatusTileModel
} from "../types";
import { WaferGeometryPreview } from "./WaferGeometryPreview";
import { WaferStatusTile } from "./WaferStatusTile";
import {
  findDeepLinkedWaferStatusTile,
  findInitialWaferStatusTile
} from "./waferStatusSelection";
import {
  readWaferStatusResumeState,
  writeWaferStatusResumeState
} from "./waferStatusResumeState";
import { DieAppearancePreview } from "./wafer-die-detail/DieAppearancePreview";
import {
  canOpenDieDetail,
  DieDetailView,
  getSelectedDieLabel,
  getWaferDisplayLabel,
  isUndicedMode
} from "./wafer-die-detail";
import type { DieDetailTab } from "./wafer-die-detail/waferDieDetailData";
import type { WaferDieNoteViewer } from "./wafer-die-detail/WaferDieNotes";

const metricIcons = {
  neutral: WaferLogoIcon,
  active: StackIcon,
  running: TargetIcon,
  yield: ActivityIcon
} as const;

function MetricTile({ metric }: { metric: WaferStatusMetric }) {
  const Icon = metricIcons[metric.tone];

  return (
    <div className="grid min-h-[88px] grid-cols-[28px_minmax(0,1fr)] items-center gap-4 border-b border-[#eeeeee] bg-white px-2 py-4">
      <span className="grid h-7 w-7 place-items-center text-[#7a7a72]">
        <Icon />
      </span>
      <div className="min-w-0">
        <p className="text-[32px] font-semibold leading-none tracking-normal text-[#111111]">
          {metric.value}
        </p>
        <p className="mt-1 text-[13px] font-medium text-[#7a7a72]">{metric.label}</p>
      </div>
    </div>
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
  return (
    <section className="wafer-status-family border-b border-[#e7e7e2] bg-white">
      <div className="wafer-status-family__header flex w-full items-center gap-3 px-2 py-4">
        <span
          className={[
            "h-2.5 w-2.5 rounded-full",
            family.status === "active" ? "bg-[#111111]" : "bg-[#c9c9c2]"
          ].join(" ")}
        />
        <span className="text-[24px] font-semibold leading-none tracking-normal text-[#111111]">
          {family.name}
        </span>
        <span className="rounded-md border border-[#e4e4df] bg-white px-2 py-0.5 text-[12px] font-semibold text-[#5d5d56]">
          {family.tiles.length}
        </span>
      </div>

      <div className="wafer-status-family__tiles grid gap-3 pb-5">
        {family.tiles.map((tile) => (
          <WaferStatusTile
            key={tile.id}
            tile={tile}
            isUndiced={isUndicedMode(tile)}
            selected={selectedTile?.id === tile.id}
            onSelect={() => onSelect(tile)}
          />
        ))}
      </div>
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
    <aside className="selected-die-panel grid gap-5 bg-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-[#9b9b94]">
            {isUndiced ? "Selected wafer" : "Selected die"}
          </p>
          <h2 className="mt-1 text-[28px] font-semibold leading-none text-[#111111]">
            {displayLabel}
          </h2>
        </div>
        <span className="rounded-md border border-[#e4e4df] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#222222]">
          {selectedTile.stepLabel}
        </span>
      </div>

      <div className="grid min-h-[420px] place-items-center bg-white p-4">
        {isUndiced ? (
          <WaferGeometryPreview
            modeKeyword={selectedTile.waferStateName}
            selectedLabel={getSelectedDieLabel(selectedTile)}
            colorSeed={selectedTile.family}
            showDieLabel={false}
            className="max-h-[320px]"
          />
        ) : (
          <DieAppearancePreview tile={selectedTile} className="max-h-[320px]" sizes="400px" />
        )}
      </div>
    </aside>
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
    <section className="border border-dashed border-[#ddddda] bg-white p-10 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9b9b94]">
        Backend wafer viewer
      </p>
      <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#111111]">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-6 text-[#6f6f68]">
        {description}
      </p>
    </section>
  );
}

export function WaferStatusView({
  model,
  canEdit = true,
  currentUser,
  processId,
  initialWaferId,
  initialDieLabel,
  initialDetailTab = "overview",
  emptyTitle = "No wafers available",
  emptyDescription = "Authenticated Supabase data loaded, but this project state has no wafers visible to the current session."
}: {
  model: WaferStatusModel;
  canEdit?: boolean;
  currentUser?: WaferDieNoteViewer | null;
  processId: string;
  initialWaferId?: string;
  initialDieLabel?: string;
  initialDetailTab?: DieDetailTab;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { initialSelected, initialDetail } = useMemo(() => {
    const tiles = model.families.flatMap((family) => family.tiles);
    const deepLinkedTile = findDeepLinkedWaferStatusTile(tiles, initialWaferId, initialDieLabel);

    return {
      initialSelected: findInitialWaferStatusTile(tiles, deepLinkedTile),
      // Only an explicit URL target opens a die detail. The ordinary Status
      // navigation link carries only processId and must land on the overview.
      initialDetail: deepLinkedTile && canOpenDieDetail(deepLinkedTile) ? deepLinkedTile : null
    };
  },
    [initialDieLabel, initialWaferId, model]
  );
  const [selectedTile, setSelectedTile] = useState<WaferStatusTileModel | null>(initialSelected);
  const [detailTile, setDetailTile] = useState<WaferStatusTileModel | null>(initialDetail);
  const [activeDetailTab, setActiveDetailTab] = useState<DieDetailTab>(initialDetailTab);
  const [resumeResolved, setResumeResolved] = useState(Boolean(initialWaferId));
  const latestTiles = useMemo(() => model.families.flatMap((family) => family.tiles), [model.families]);
  const activeSelectedTile = selectedTile
    ? latestTiles.find((tile) => tile.id === selectedTile.id) ?? selectedTile
    : initialSelected;
  const selectedUndiced = activeSelectedTile ? isUndicedMode(activeSelectedTile) : false;
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

  useEffect(() => {
    if (initialWaferId) return;

    queueMicrotask(() => {
      const resume = readWaferStatusResumeState(window.localStorage, processId);
      const resumedTile = resume
        ? findDeepLinkedWaferStatusTile(latestTiles, resume.selected.waferId, resume.selected.dieLabel ?? undefined)
        : null;

      if (resumedTile) {
        setSelectedTile(resumedTile);
        setActiveDetailTab(resume!.tab);
        setDetailTile(resume!.detail && canOpenDieDetail(resumedTile) ? resumedTile : null);
      }
      setResumeResolved(true);
    });
  }, [initialWaferId, latestTiles, processId]);

  useEffect(() => {
    if (!resumeResolved || !activeSelectedTile) return;

    writeWaferStatusResumeState(window.localStorage, processId, {
      version: 1,
      selected: {
        waferId: activeSelectedTile.waferId,
        dieLabel: activeSelectedTile.dieLabel || null
      },
      detail: Boolean(activeDetailTile),
      tab: activeDetailTab
    });
  }, [activeDetailTab, activeDetailTile, activeSelectedTile, processId, resumeResolved]);

  const handleSelectTile = (tile: WaferStatusTileModel) => {
    setSelectedTile(tile);
    if (canOpenDieDetail(tile)) {
      setDetailTile(tile);
      setActiveDetailTab("overview");
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
    <div className="wafer-status-detail-page grid gap-5 bg-white p-4 md:p-6">
        <DieDetailView
          tile={activeDetailTile}
          canEdit={canEdit}
          currentUser={currentUser}
          activeTab={activeDetailTab}
          onActiveTabChange={setActiveDetailTab}
          onBack={() => setDetailTile(null)}
          onNavigate={handleNavigateDetail}
          canNavigateBack={activeDetailIndex > 0}
          canNavigateForward={activeDetailIndex >= 0 && activeDetailIndex < detailTiles.length - 1}
        />
      </div>
    );
  }

  return (
    <div className="wafer-status-page grid gap-5 bg-white p-4 md:gap-6 md:p-6">
      {hasWafers ? (
        <section className="wafer-status-metrics grid gap-x-8 gap-y-2">
          {model.metrics.map((metric) => (
            <MetricTile key={metric.id} metric={metric} />
          ))}
        </section>
      ) : null}

      {hasWafers ? (
        <section className="wafer-status-main-grid grid gap-8">
          <div className="wafer-status-family-list grid min-w-0 gap-5">
            {model.families.map((family) => (
              <FamilySection
                key={family.id}
                family={family}
                selectedTile={selectedTile}
                onSelect={handleSelectTile}
              />
            ))}
          </div>
          {activeSelectedTile ? (
            <SelectedDiePanel
              selectedTile={activeSelectedTile}
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
