"use client";

import Image from "next/image";
import {
  Eraser,
  ImageOff,
  Info,
  LocateFixed,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  RefreshCw,
  TrendingUp
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction
} from "react";
import {
  buildPolingPointPositions,
  getAdjacentPolingOverlapRecord,
  getNextPolingOverlapRecord,
  getPolingPulseWidths,
  getPolingSeriesColors,
  getPolingSpecimens,
  type AnalysisDataSource,
  type PolingPointPosition,
  type PolingRecord
} from "@/features/analysis/polingData";
import {
  POLING_WHEEL_CLASSIFY_DELAY_MS,
  PolingWheelGestureClassifier,
  getPolingPanDelta,
  getPolingZoomFactor,
  normalizePolingWheelDelta,
  type PolingWheelAction,
  type PolingWheelSample
} from "@/features/analysis/polingGestures";
import { getPolingImagePreloadOrder } from "@/features/analysis/polingImageLoading";
import {
  clampPolingDomain,
  createPolingFullDomain,
  panPolingDomainByClientDelta,
  type PolingDomain
} from "@/features/analysis/polingViewport";
import styles from "./PolingAnalysisMap.module.css";

type GraphPoint = { x: number; y: number };
type Drawing = { type: "line" | "freehand"; points: GraphPoint[] };
type DrawMode = "navigate" | Drawing["type"];
type DragState = {
  pointerId: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
  recordId: string | null;
};

export type PolingAnalysisMapProps = {
  records?: readonly PolingRecord[];
  dataSource?: AnalysisDataSource;
};

const INITIAL_VIEWBOX = { width: 760, height: 520 };
const MARGIN = { left: 64, right: 24, top: 28, bottom: 54 };
const IMAGE_PRELOAD_CONCURRENCY = 2;
const POINTER_DRAG_THRESHOLD = 4;
const HIDDEN_POLING_FLAG_MESSAGES = new Set([
  "No microscopy image was present for this workbook condition."
]);

async function decodePolingImage(imagePath: string) {
  const image = new window.Image();
  image.decoding = "async";
  image.src = imagePath;
  try {
    await image.decode();
  } catch {
    // The detail panel reports an image error if the rendered request also fails.
  }
}

function ticks(min: number, max: number, count = 6) {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + index * step);
}

function recordPosition(
  record: PolingRecord,
  positions: ReadonlyMap<string, PolingPointPosition>
) {
  return positions.get(record.id) ?? { voltage: record.voltage, pulses: record.pulses };
}

function nearestDirectionalRecord(
  records: readonly PolingRecord[],
  current: PolingRecord,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown",
  positions: ReadonlyMap<string, PolingPointPosition>
) {
  const [sx, sy] = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1]
  }[key];
  const currentPoint = recordPosition(current, positions);
  let candidates = records.filter((record) => {
    if (record.id === current.id) return false;
    const point = recordPosition(record, positions);
    return sx
      ? Math.sign(point.voltage - currentPoint.voltage) === sx
      : Math.sign(point.pulses - currentPoint.pulses) === sy;
  });
  if (!candidates.length) return null;

  const aligned = candidates.filter((record) => {
    const point = recordPosition(record, positions);
    return sx ? point.pulses === currentPoint.pulses : record.voltage === current.voltage;
  });
  if (aligned.length) candidates = aligned;

  return [...candidates].sort((a, b) => {
    const pointA = recordPosition(a, positions);
    const pointB = recordPosition(b, positions);
    const primaryA = sx
      ? Math.abs(pointA.voltage - currentPoint.voltage)
      : Math.abs(pointA.pulses - currentPoint.pulses);
    const primaryB = sx
      ? Math.abs(pointB.voltage - currentPoint.voltage)
      : Math.abs(pointB.pulses - currentPoint.pulses);
    const secondaryA = sx
      ? Math.abs(pointA.pulses - currentPoint.pulses)
      : Math.abs(pointA.voltage - currentPoint.voltage);
    const secondaryB = sx
      ? Math.abs(pointB.pulses - currentPoint.pulses)
      : Math.abs(pointB.voltage - currentPoint.voltage);
    return primaryA - primaryB || secondaryA - secondaryB;
  })[0];
}

function dataSourceLabel(dataSource?: AnalysisDataSource) {
  if (!dataSource) return null;
  return dataSource.kind === "database" ? "Database import" : "Data unavailable";
}

function unavailableMessage(dataSource?: AnalysisDataSource) {
  if (dataSource?.kind !== "unavailable") return null;
  if (dataSource.reason === "no-ready-import") {
    return "No ready analysis import exists for this project yet.";
  }
  if (dataSource.reason === "incomplete-import") {
    return "The latest analysis import is incomplete and was not displayed.";
  }
  if (dataSource.reason === "no-process" || dataSource.reason === "no-project") {
    return "Choose an accessible process with an analysis dataset.";
  }
  return "The project analysis dataset could not be loaded. Try again shortly.";
}

export function PolingAnalysisMap({
  records = [],
  dataSource
}: PolingAnalysisMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const chartFrameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const activeDrawingRef = useRef<Drawing | null>(null);
  const wheelClassifierRef = useRef(new PolingWheelGestureClassifier());
  const wheelClassificationTimerRef = useRef<number | null>(null);
  const wheelAnimationFrameRef = useRef<number | null>(null);
  const queuedWheelPanRef = useRef({ deltaX: 0, deltaY: 0 });
  const queuedWheelZoomRef = useRef({ deltaY: 0, clientX: 0, clientY: 0 });
  const nativeWheelHandlerRef = useRef<(event: WheelEvent) => void>(() => undefined);
  const positions = useMemo(() => buildPolingPointPositions(records), [records]);
  const fullDomain = useMemo(
    () =>
      createPolingFullDomain(
        records.map((record) => positions.get(record.id)?.voltage ?? record.voltage),
        records.map((record) => record.pulses)
      ),
    [positions, records]
  );
  const specimens = useMemo(() => getPolingSpecimens(records), [records]);
  const pulseWidths = useMemo(() => getPolingPulseWidths(records), [records]);
  const seriesColors = useMemo(() => getPolingSeriesColors(specimens), [specimens]);
  const [hiddenSpecimens, setHiddenSpecimens] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [pulseWidth, setPulseWidth] = useState<number | "all">("all");
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? "");
  const [domain, setDomain] = useState<PolingDomain>(() => fullDomain);
  const [mode, setMode] = useState<DrawMode>("navigate");
  const [isDragging, setIsDragging] = useState(false);
  const [annotations, setAnnotations] = useState<Drawing[]>([]);
  const [activeDrawing, setActiveDrawing] = useState<Drawing | null>(null);
  const [viewBox, setViewBox] = useState(INITIAL_VIEWBOX);
  const [displayedRecord, setDisplayedRecord] = useState<PolingRecord | null>(() =>
    records[0]?.imagePath ? records[0] : null
  );
  const [failedImagePath, setFailedImagePath] = useState<string | null>(null);
  const [imageRetry, setImageRetry] = useState(0);

  const activePulseWidth =
    pulseWidth === "all" || pulseWidths.includes(pulseWidth) ? pulseWidth : "all";
  const visibleRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          !hiddenSpecimens.has(record.specimenReference) &&
          (activePulseWidth === "all" || record.pulseWidthMs === activePulseWidth)
      ),
    [activePulseWidth, hiddenSpecimens, records]
  );
  const selectedRecord =
    visibleRecords.find((record) => record.id === selectedId) ?? visibleRecords[0] ?? null;
  const renderedRecords = useMemo(() => {
    if (!selectedRecord) return visibleRecords;
    return [
      ...visibleRecords.filter((record) => record.id !== selectedRecord.id),
      selectedRecord
    ];
  }, [selectedRecord, visibleRecords]);
  const overlapCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of visibleRecords) {
      const key = `${record.voltage}\u0000${record.pulses}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [visibleRecords]);
  const selectedRecordRef = useRef(selectedRecord);
  const selectedImagePath = selectedRecord?.imagePath ?? null;
  const imageFailed = selectedImagePath !== null && failedImagePath === selectedImagePath;
  const imageLoading = Boolean(
    selectedImagePath &&
      !imageFailed &&
      displayedRecord?.imagePath !== selectedImagePath
  );

  useEffect(() => {
    selectedRecordRef.current = selectedRecord;
  }, [selectedRecord]);

  useEffect(() => {
    const chartFrame = chartFrameRef.current;
    if (!chartFrame) return;
    const updateViewBox = () => {
      const width = Math.max(320, Math.round(chartFrame.clientWidth - 24));
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const availableHeight = Math.round(
        viewportHeight - chartFrame.getBoundingClientRect().top - 18
      );
      const height =
        width < 560
          ? 400
          : Math.max(
              400,
              Math.min(540, Math.round(width * 0.64), availableHeight)
            );
      setViewBox((current) =>
        current.width === width && current.height === height ? current : { width, height }
      );
    };
    const observer = new ResizeObserver(updateViewBox);
    observer.observe(chartFrame);
    window.addEventListener("resize", updateViewBox);
    window.visualViewport?.addEventListener("resize", updateViewBox);
    updateViewBox();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateViewBox);
      window.visualViewport?.removeEventListener("resize", updateViewBox);
    };
  }, []);

  useEffect(() => {
    if (!selectedRecord) return;
    const preloadOrder = getPolingImagePreloadOrder(visibleRecords, selectedRecord.id);
    let cancelled = false;
    let cursor = 0;

    const warmQueue = async () => {
      const worker = async () => {
        while (!cancelled) {
          const imagePath = preloadOrder[cursor];
          cursor += 1;
          if (!imagePath) return;
          await decodePolingImage(imagePath);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(IMAGE_PRELOAD_CONCURRENCY, preloadOrder.length) },
          () => worker()
        )
      );
    };

    const timeoutId = window.setTimeout(() => void warmQueue(), 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [selectedRecord, visibleRecords]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const wheelClassifier = wheelClassifierRef.current;
    const listener = (event: WheelEvent) => nativeWheelHandlerRef.current(event);
    svg.addEventListener("wheel", listener, { passive: false });
    return () => {
      svg.removeEventListener("wheel", listener);
      if (wheelClassificationTimerRef.current !== null) {
        window.clearTimeout(wheelClassificationTimerRef.current);
        wheelClassificationTimerRef.current = null;
      }
      if (wheelAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(wheelAnimationFrameRef.current);
        wheelAnimationFrameRef.current = null;
      }
      wheelClassifier.reset();
      queuedWheelPanRef.current = { deltaX: 0, deltaY: 0 };
      queuedWheelZoomRef.current = { deltaY: 0, clientX: 0, clientY: 0 };
    };
  }, []);

  const plotWidth = viewBox.width - MARGIN.left - MARGIN.right;
  const plotHeight = viewBox.height - MARGIN.top - MARGIN.bottom;
  const x = (value: number) =>
    MARGIN.left + ((value - domain.xmin) / (domain.xmax - domain.xmin)) * plotWidth;
  const y = (value: number) =>
    viewBox.height -
    MARGIN.bottom -
    ((value - domain.ymin) / (domain.ymax - domain.ymin)) * plotHeight;

  const clientToGraph = (clientX: number, clientY: number): GraphPoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * viewBox.width;
    const py = ((clientY - rect.top) / rect.height) * viewBox.height;
    if (
      px < MARGIN.left ||
      px > viewBox.width - MARGIN.right ||
      py < MARGIN.top ||
      py > viewBox.height - MARGIN.bottom
    ) {
      return null;
    }
    return {
      x: domain.xmin + ((px - MARGIN.left) / plotWidth) * (domain.xmax - domain.xmin),
      y: domain.ymax - ((py - MARGIN.top) / plotHeight) * (domain.ymax - domain.ymin)
    };
  };

  const selectRecord = (record: PolingRecord) => {
    setSelectedId(record.id);
    const point = recordPosition(record, positions);
    setDomain((current) => {
      const xSpan = current.xmax - current.xmin;
      const ySpan = current.ymax - current.ymin;
      const xPadding = xSpan * 0.12;
      const yPadding = ySpan * 0.12;
      const next = { ...current };
      if (point.voltage < current.xmin + xPadding || point.voltage > current.xmax - xPadding) {
        next.xmin = point.voltage - xSpan / 2;
        next.xmax = point.voltage + xSpan / 2;
      }
      if (point.pulses < current.ymin + yPadding || point.pulses > current.ymax - yPadding) {
        next.ymin = point.pulses - ySpan / 2;
        next.ymax = point.pulses + ySpan / 2;
      }
      return clampPolingDomain(next, fullDomain);
    });
  };

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const viewX = ((clientX - rect.left) / rect.width) * viewBox.width;
    const viewY = ((clientY - rect.top) / rect.height) * viewBox.height;
    const px = Math.max(0, Math.min(1, (viewX - MARGIN.left) / plotWidth));
    const py = Math.max(0, Math.min(1, (viewY - MARGIN.top) / plotHeight));
    setDomain((current) => {
      const xOrigin = current.xmin + (current.xmax - current.xmin) * px;
      const yOrigin = current.ymax - (current.ymax - current.ymin) * py;
      const xSpan = Math.max(
        4,
        Math.min(fullDomain.xmax - fullDomain.xmin, (current.xmax - current.xmin) * factor)
      );
      const ySpan = Math.max(
        8,
        Math.min(fullDomain.ymax - fullDomain.ymin, (current.ymax - current.ymin) * factor)
      );
      return clampPolingDomain(
        {
          xmin: xOrigin - xSpan * px,
          xmax: xOrigin + xSpan * (1 - px),
          ymin: yOrigin - ySpan * (1 - py),
          ymax: yOrigin + ySpan * py
        },
        fullDomain
      );
    });
  };

  const panByPixels = (deltaX: number, deltaY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const renderedPlotWidth = (plotWidth / viewBox.width) * rect.width;
    const renderedPlotHeight = (plotHeight / viewBox.height) * rect.height;
    setDomain((current) =>
      panPolingDomainByClientDelta({
        domain: current,
        fullDomain,
        deltaX,
        deltaY,
        renderedPlotWidth,
        renderedPlotHeight
      })
    );
  };

  const scheduleWheelFrame = () => {
    if (wheelAnimationFrameRef.current !== null) return;
    wheelAnimationFrameRef.current = window.requestAnimationFrame(() => {
      wheelAnimationFrameRef.current = null;
      const zoom = queuedWheelZoomRef.current;
      const pan = queuedWheelPanRef.current;
      queuedWheelZoomRef.current = { deltaY: 0, clientX: 0, clientY: 0 };
      queuedWheelPanRef.current = { deltaX: 0, deltaY: 0 };

      if (zoom.deltaY) {
        zoomAt(zoom.clientX, zoom.clientY, getPolingZoomFactor(zoom.deltaY));
      }
      if (pan.deltaX || pan.deltaY) {
        panByPixels(pan.deltaX, pan.deltaY);
      }
    });
  };

  const queueWheelActions = (actions: readonly PolingWheelAction[]) => {
    for (const action of actions) {
      if (action.modality === "zoom") {
        queuedWheelZoomRef.current.deltaY += normalizePolingWheelDelta(
          action.sample.deltaY,
          action.sample.deltaMode
        );
        queuedWheelZoomRef.current.clientX = action.sample.clientX;
        queuedWheelZoomRef.current.clientY = action.sample.clientY;
      } else {
        const pan = getPolingPanDelta(action.sample);
        queuedWheelPanRef.current.deltaX += pan.deltaX;
        queuedWheelPanRef.current.deltaY += pan.deltaY;
      }
    }
    if (actions.length) scheduleWheelFrame();
  };

  const clearWheelClassificationTimer = () => {
    if (wheelClassificationTimerRef.current === null) return;
    window.clearTimeout(wheelClassificationTimerRef.current);
    wheelClassificationTimerRef.current = null;
  };

  const handleNativeWheel = (event: WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const sample: PolingWheelSample = {
      ctrlKey: event.ctrlKey,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      clientX: event.clientX,
      clientY: event.clientY
    };
    const decision = wheelClassifierRef.current.ingest(sample, window.performance.now(), "auto");
    queueWheelActions(decision.actions);

    if (!decision.pending) {
      clearWheelClassificationTimer();
      return;
    }
    if (wheelClassificationTimerRef.current !== null) return;
    wheelClassificationTimerRef.current = window.setTimeout(() => {
      wheelClassificationTimerRef.current = null;
      queueWheelActions(wheelClassifierRef.current.flushPendingAsMouse().actions);
    }, POLING_WHEEL_CLASSIFY_DELAY_MS);
  };

  useEffect(() => {
    nativeWheelHandlerRef.current = handleNativeWheel;
  });

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (mode !== "navigate") {
      const point = clientToGraph(event.clientX, event.clientY);
      if (!point) return;
      const drawing: Drawing = { type: mode, points: [point, point] };
      activeDrawingRef.current = drawing;
      setActiveDrawing(drawing);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const recordId = (event.target as Element)
      .closest("[data-poling-record-id]")
      ?.getAttribute("data-poling-record-id");
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      recordId: recordId ?? null
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drawing = activeDrawingRef.current;
    if (drawing) {
      const point = clientToGraph(event.clientX, event.clientY);
      if (!point) return;
      const next =
        drawing.type === "line"
          ? { ...drawing, points: [drawing.points[0], point] }
          : { ...drawing, points: [...drawing.points, point] };
      activeDrawingRef.current = next;
      setActiveDrawing(next);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved =
      drag.moved ||
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >=
        POINTER_DRAG_THRESHOLD;
    if (!moved) return;
    if (!drag.moved) setIsDragging(true);
    panByPixels(drag.x - event.clientX, event.clientY - drag.y);
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY, moved: true };
  };

  const finishPointerInteraction = (
    event: ReactPointerEvent<SVGSVGElement>,
    cancelled = false
  ) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId !== event.pointerId) return;
    const completedDrawing = activeDrawingRef.current;
    if (completedDrawing) {
      setAnnotations((current) => [...current, completedDrawing]);
      activeDrawingRef.current = null;
      setActiveDrawing(null);
    }
    if (
      !cancelled &&
      drag?.pointerId === event.pointerId &&
      !drag.moved &&
      drag.recordId
    ) {
      const clickedRecord = visibleRecords.find((candidate) => candidate.id === drag.recordId);
      if (clickedRecord) {
        selectRecord(getNextPolingOverlapRecord(visibleRecords, clickedRecord, selectedRecord?.id ?? null));
      }
    }
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (!selectedRecord || !event.key.startsWith("Arrow")) return;
    const key = event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
    const stackDirection = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
    const next =
      getAdjacentPolingOverlapRecord(visibleRecords, selectedRecord, stackDirection) ??
      nearestDirectionalRecord(visibleRecords, selectedRecord, key, positions);
    if (!next) return;
    event.preventDefault();
    selectRecord(next);
  };

  const toggleSpecimen = (specimen: string, visible: boolean) => {
    setHiddenSpecimens((current) => {
      const next = new Set(current);
      if (visible) next.delete(specimen);
      else next.add(specimen);
      return next;
    });
  };

  const drawings = activeDrawing ? [...annotations, activeDrawing] : annotations;
  const selectedFlags = selectedRecord
    ? [
        ...(selectedRecord.flags ?? []),
        ...(selectedRecord.flag && !selectedRecord.flags?.includes(selectedRecord.flag)
          ? [selectedRecord.flag]
          : [])
      ].filter((flag) => !HIDDEN_POLING_FLAG_MESSAGES.has(flag))
    : [];
  const sourceLabel = dataSourceLabel(dataSource);
  const unavailableCopy = unavailableMessage(dataSource);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Experiment analysis</p>
          <h1>Poling parameter map</h1>
          <p className={styles.intro}>
            Inspect microscopy and workbook results on one source-voltage scale. Pulse-width
            variants remain filterable without changing the representation.
          </p>
        </div>
        <div className={styles.recordCount} aria-label={`${visibleRecords.length} visible conditions`}>
          <strong>{visibleRecords.length}</strong>
          <span>visible conditions</span>
          {sourceLabel ? <small>{sourceLabel}</small> : null}
        </div>
      </header>

      <div
        className={styles.workspace}
        style={{ "--analysis-panel-body-height": `${viewBox.height}px` } as CSSProperties}
      >
        <section className={styles.plotPanel} aria-label="Poling parameter graph">
          <div className={styles.filterBar}>
            <fieldset className={styles.dieFilters}>
              <legend>Die</legend>
              <div className={styles.dieFilterOptions}>
                {specimens.map((specimen) => (
                  <label key={specimen}>
                    <input
                      type="checkbox"
                      checked={!hiddenSpecimens.has(specimen)}
                      onChange={(event) => toggleSpecimen(specimen, event.target.checked)}
                    />
                    <span
                      style={{ "--series-color": seriesColors[specimen] } as CSSProperties}
                    />
                    {specimen}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className={styles.widthFilter}>
              <span>Pulse width</span>
              <select
                value={activePulseWidth}
                onChange={(event) =>
                  setPulseWidth(event.target.value === "all" ? "all" : Number(event.target.value))
                }
              >
                <option value="all">All widths</option>
                {pulseWidths.map((width) => (
                  <option key={width} value={width}>
                    {width} ms
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.modeTools} aria-label="Graph tools">
              <ToolButton
                label="Navigate"
                active={mode === "navigate"}
                onClick={() => setMode("navigate")}
                icon={<MousePointer2 />}
              />
              <ToolButton
                label="Line"
                active={mode === "line"}
                onClick={() => setMode("line")}
                icon={<TrendingUp />}
              />
              <ToolButton
                label="Freehand"
                active={mode === "freehand"}
                onClick={() => setMode("freehand")}
                icon={<Pencil />}
              />
              {annotations.length ? (
                <>
                  <span className={styles.toolDivider} aria-hidden="true" />
                  <button
                    type="button"
                    aria-label="Undo annotation"
                    title="Undo annotation"
                    onClick={() => setAnnotations((current) => current.slice(0, -1))}
                  >
                    <Redo2 />
                  </button>
                  <button
                    type="button"
                    aria-label="Clear annotations"
                    title="Clear annotations"
                    onClick={() => setAnnotations([])}
                  >
                    <Eraser />
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div ref={chartFrameRef} className={styles.chartFrame}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
              className={styles.chart}
              role="img"
              aria-label="Source voltage versus number of pulses. Select a point to inspect its die and microscopy result."
              tabIndex={0}
              data-mode={mode}
              data-dragging={isDragging || undefined}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(event) => finishPointerInteraction(event)}
              onPointerCancel={(event) => finishPointerInteraction(event, true)}
              onDoubleClick={(event) => {
                const target = event.target;
                if (
                  mode === "navigate" &&
                  target instanceof Element &&
                  !target.closest("[data-poling-point]")
                ) {
                  setDomain(fullDomain);
                }
              }}
              onKeyDown={handleKeyDown}
            >
              <defs>
                <clipPath id="poling-plot-clip">
                  <rect
                    x={MARGIN.left}
                    y={MARGIN.top}
                    width={plotWidth}
                    height={plotHeight}
                  />
                </clipPath>
              </defs>

              {ticks(domain.xmin, domain.xmax).map((value) => (
                <g key={`x-${value}`}>
                  <line
                    x1={x(value)}
                    y1={MARGIN.top}
                    x2={x(value)}
                    y2={viewBox.height - MARGIN.bottom}
                    className={styles.gridLine}
                  />
                  <text
                    x={x(value)}
                    y={viewBox.height - MARGIN.bottom + 22}
                    className={styles.axisLabel}
                    textAnchor="middle"
                  >
                    {Math.round(value)}
                  </text>
                </g>
              ))}
              {ticks(domain.ymin, domain.ymax).map((value) => (
                <g key={`y-${value}`}>
                  <line
                    x1={MARGIN.left}
                    y1={y(value)}
                    x2={viewBox.width - MARGIN.right}
                    y2={y(value)}
                    className={styles.gridLine}
                  />
                  <text
                    x={MARGIN.left - 10}
                    y={y(value) + 4}
                    className={styles.axisLabel}
                    textAnchor="end"
                  >
                    {Math.round(value)}
                  </text>
                </g>
              ))}
              <rect
                x={MARGIN.left}
                y={MARGIN.top}
                width={plotWidth}
                height={plotHeight}
                className={styles.plotBorder}
              />

              <g clipPath="url(#poling-plot-clip)">
                {drawings.map((drawing, drawingIndex) =>
                  drawing.type === "line" ? (
                    <line
                      key={`drawing-${drawingIndex}`}
                      x1={x(drawing.points[0].x)}
                      y1={y(drawing.points[0].y)}
                      x2={x(drawing.points.at(-1)?.x ?? drawing.points[0].x)}
                      y2={y(drawing.points.at(-1)?.y ?? drawing.points[0].y)}
                      className={styles.annotation}
                    />
                  ) : (
                    <path
                      key={`drawing-${drawingIndex}`}
                      d={drawing.points
                        .map((point, index) => `${index ? "L" : "M"} ${x(point.x)} ${y(point.y)}`)
                        .join(" ")}
                      className={styles.annotation}
                    />
                  )
                )}
              </g>

              <text
                x={(MARGIN.left + viewBox.width - MARGIN.right) / 2}
                y={viewBox.height - 10}
                className={styles.axisTitle}
                textAnchor="middle"
              >
                Voltage (source value)
              </text>
              <text
                x={16}
                y={(MARGIN.top + viewBox.height - MARGIN.bottom) / 2}
                className={styles.axisTitle}
                textAnchor="middle"
                transform={`rotate(-90 16 ${(MARGIN.top + viewBox.height - MARGIN.bottom) / 2})`}
              >
                Number of pulses
              </text>

              {renderedRecords.map((record) => {
                const point = recordPosition(record, positions);
                if (
                  point.voltage < domain.xmin ||
                  point.voltage > domain.xmax ||
                  point.pulses < domain.ymin ||
                  point.pulses > domain.ymax
                ) {
                  return null;
                }
                const selected = record.id === selectedRecord?.id;
                const overlapCount =
                  overlapCounts.get(`${record.voltage}\u0000${record.pulses}`) ?? 1;
                const className = [
                  styles.point,
                  !record.imagePath ? styles.dataOnlyPoint : "",
                  selected ? styles.selectedPoint : ""
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <circle
                    key={record.id}
                    data-poling-point
                    data-poling-record-id={record.id}
                    cx={x(point.voltage)}
                    cy={y(point.pulses)}
                    r={selected ? 7.5 : 6}
                    fill={seriesColors[record.specimenReference]}
                    className={className}
                  >
                    <title>{`${record.specimenReference} ${record.dieLabel}, voltage ${record.voltage} (source value), ${record.pulses} pulse${record.pulses === 1 ? "" : "s"}, ${record.pulseWidthMs} ms${record.imagePath ? "" : ", no linked image"}${overlapCount > 1 ? `, ${overlapCount} records at this coordinate; click repeatedly to cycle` : ""}`}</title>
                  </circle>
                );
              })}
            </svg>

            <div className={styles.zoomTools} aria-label="View controls">
              <button
                type="button"
                onClick={() => zoomAtCenter(0.8, setDomain, fullDomain)}
                aria-label="Zoom in"
              >
                <Plus />
              </button>
              <button
                type="button"
                onClick={() => zoomAtCenter(1.25, setDomain, fullDomain)}
                aria-label="Zoom out"
              >
                <Minus />
              </button>
              <button type="button" onClick={() => setDomain(fullDomain)} aria-label="Reset view">
                <LocateFixed />
              </button>
            </div>

            <details className={styles.mapNotes}>
              <summary>
                <Info aria-hidden="true" />
                <span>Map notes</span>
              </summary>
              <div>
                <p>
                  Trackpad scroll or drag pans. Mouse wheel or pinch zooms. Double-click empty
                  graph space to reset; arrow keys move through overlapping records before the
                  next condition.
                </p>
              </div>
            </details>
          </div>
        </section>

        <aside className={styles.detailPanel} aria-live="polite">
          {selectedRecord ? (
            <>
              <div className={styles.detailHeader}>
                <div>
                  <p>
                    {selectedRecord.specimenReference} · {selectedRecord.dieLabel}
                    {selectedRecord.slide ? ` · Slide ${selectedRecord.slide}` : ""}
                  </p>
                  <h2>
                    {selectedRecord.voltage} source value, {selectedRecord.pulses} pulse
                    {selectedRecord.pulses === 1 ? "" : "s"}
                  </h2>
                </div>
                <span
                  style={{ backgroundColor: seriesColors[selectedRecord.specimenReference] }}
                >
                  {selectedRecord.pulseWidthMs} ms
                </span>
              </div>

              <div className={styles.imageStage}>
                {!selectedImagePath ? (
                  <NoImageState
                    title="No microscopy image"
                  />
                ) : imageFailed ? (
                  <NoImageState
                    title="Image unavailable"
                    description="The microscopy file could not be loaded."
                    action={
                      <button
                        type="button"
                        onClick={() => {
                          setFailedImagePath(null);
                          setImageRetry((current) => current + 1);
                        }}
                      >
                        <RefreshCw /> Try again
                      </button>
                    }
                  />
                ) : (
                  <>
                    {displayedRecord?.imagePath ? (
                      <Image
                        key={`displayed-${displayedRecord.imagePath}`}
                        className={imageLoading ? styles.staleImage : undefined}
                        src={displayedRecord.imagePath}
                        width={1024}
                        height={1024}
                        sizes="(max-width: 900px) 100vw, 38vw"
                        priority={displayedRecord.id === records[0]?.id}
                        unoptimized
                        aria-hidden={imageLoading}
                        alt={`Microscopy result for ${displayedRecord.specimenReference} ${displayedRecord.dieLabel}`}
                        onError={() => {
                          if (displayedRecord.imagePath === selectedRecordRef.current?.imagePath) {
                            setFailedImagePath(displayedRecord.imagePath ?? null);
                          }
                        }}
                      />
                    ) : null}
                    {imageLoading ? (
                      <Image
                        key={`incoming-${selectedImagePath}-${imageRetry}`}
                        className={styles.incomingImage}
                        src={selectedImagePath}
                        width={1024}
                        height={1024}
                        sizes="(max-width: 900px) 100vw, 38vw"
                        unoptimized
                        alt=""
                        aria-hidden="true"
                        onLoad={() => {
                          if (selectedRecordRef.current?.id === selectedRecord.id) {
                            setDisplayedRecord(selectedRecord);
                            setFailedImagePath(null);
                          }
                        }}
                        onError={() => {
                          if (selectedRecordRef.current?.id === selectedRecord.id) {
                            setFailedImagePath(selectedImagePath);
                          }
                        }}
                      />
                    ) : null}
                    {imageLoading ? (
                      <span className={styles.imageLoading} role="status">
                        Loading image…
                      </span>
                    ) : null}
                  </>
                )}
              </div>

              {selectedFlags.map((flag, index) => (
                <p key={`${selectedRecord.id}-flag-${index}`} className={styles.warning}>
                  {flag}
                </p>
              ))}
            </>
          ) : (
            <div className={styles.emptyDetail}>
              <strong>{unavailableCopy ? "Analysis unavailable" : "No visible conditions"}</strong>
              <p>{unavailableCopy ?? "Enable a die or choose another pulse width."}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function zoomAtCenter(
  factor: number,
  setDomain: Dispatch<SetStateAction<PolingDomain>>,
  fullDomain: PolingDomain
) {
  setDomain((current) => {
    const centerX = (current.xmin + current.xmax) / 2;
    const centerY = (current.ymin + current.ymax) / 2;
    const xSpan = Math.max(
      4,
      Math.min(fullDomain.xmax - fullDomain.xmin, (current.xmax - current.xmin) * factor)
    );
    const ySpan = Math.max(
      8,
      Math.min(fullDomain.ymax - fullDomain.ymin, (current.ymax - current.ymin) * factor)
    );
    return clampPolingDomain(
      {
        xmin: centerX - xSpan / 2,
        xmax: centerX + xSpan / 2,
        ymin: centerY - ySpan / 2,
        ymax: centerY + ySpan / 2
      },
      fullDomain
    );
  });
}

function ToolButton({
  label,
  active,
  onClick,
  icon
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} title={label}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function NoImageState({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.noImage}>
      <ImageOff aria-hidden="true" />
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
