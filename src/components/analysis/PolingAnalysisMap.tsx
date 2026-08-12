"use client";

import Image from "next/image";
import {
  Eraser,
  ImageOff,
  LocateFixed,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
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
  type SetStateAction,
  type WheelEvent as ReactWheelEvent
} from "react";
import {
  buildPolingPointPositions,
  getPolingPulseWidths,
  getPolingSeriesColors,
  getPolingSpecimens,
  type AnalysisDataSource,
  type PolingPointPosition,
  type PolingRecord
} from "@/features/analysis/polingData";
import { getPolingWheelIntent } from "@/features/analysis/polingGestures";
import { getPolingImagePreloadOrder } from "@/features/analysis/polingImageLoading";
import styles from "./PolingAnalysisMap.module.css";

type Domain = { xmin: number; xmax: number; ymin: number; ymax: number };
type GraphPoint = { x: number; y: number };
type Drawing = { type: "line" | "freehand"; points: GraphPoint[] };
type DrawMode = "navigate" | Drawing["type"];

export type PolingAnalysisMapProps = {
  records?: readonly PolingRecord[];
  dataSource?: AnalysisDataSource;
};

const INITIAL_VIEWBOX = { width: 760, height: 520 };
const MARGIN = { left: 64, right: 24, top: 28, bottom: 54 };
const IMAGE_PRELOAD_CONCURRENCY = 2;

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

function createFullDomain(
  records: readonly PolingRecord[],
  positions: ReadonlyMap<string, PolingPointPosition>
): Domain {
  if (!records.length) return { xmin: 0, xmax: 10, ymin: 0, ymax: 10 };

  const voltages = records.map(
    (record) => positions.get(record.id)?.voltage ?? record.voltage
  );
  const pulses = records.map((record) => record.pulses);
  const voltageMin = Math.min(...voltages);
  const voltageMax = Math.max(...voltages);
  const pulseMin = Math.min(...pulses);
  const pulseMax = Math.max(...pulses);
  const voltagePadding = Math.max(5, (voltageMax - voltageMin) * 0.04);
  const pulsePadding = Math.max(5, (pulseMax - pulseMin) * 0.05);

  return {
    xmin: Math.floor(voltageMin - voltagePadding),
    xmax: Math.ceil(voltageMax + voltagePadding),
    ymin: Math.max(0, Math.floor(pulseMin - pulsePadding)),
    ymax: Math.ceil(pulseMax + pulsePadding)
  };
}

function clampDomain(candidate: Domain, fullDomain: Domain): Domain {
  const xSpan = Math.min(candidate.xmax - candidate.xmin, fullDomain.xmax - fullDomain.xmin);
  const ySpan = Math.min(candidate.ymax - candidate.ymin, fullDomain.ymax - fullDomain.ymin);
  const xmin = Math.max(
    fullDomain.xmin,
    Math.min(candidate.xmin, fullDomain.xmax - xSpan)
  );
  const ymin = Math.max(
    fullDomain.ymin,
    Math.min(candidate.ymin, fullDomain.ymax - ySpan)
  );
  return { xmin, xmax: xmin + xSpan, ymin, ymax: ymin + ySpan };
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
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const activeDrawingRef = useRef<Drawing | null>(null);
  const positions = useMemo(() => buildPolingPointPositions(records), [records]);
  const fullDomain = useMemo(() => createFullDomain(records, positions), [positions, records]);
  const specimens = useMemo(() => getPolingSpecimens(records), [records]);
  const pulseWidths = useMemo(() => getPolingPulseWidths(records), [records]);
  const seriesColors = useMemo(() => getPolingSeriesColors(specimens), [specimens]);
  const [hiddenSpecimens, setHiddenSpecimens] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [pulseWidth, setPulseWidth] = useState<number | "all">("all");
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? "");
  const [domain, setDomain] = useState<Domain>(() => fullDomain);
  const [mode, setMode] = useState<DrawMode>("navigate");
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
      const height = width < 560 ? 400 : Math.max(460, Math.min(560, Math.round(width * 0.68)));
      setViewBox((current) =>
        current.width === width && current.height === height ? current : { width, height }
      );
    };
    const observer = new ResizeObserver(updateViewBox);
    observer.observe(chartFrame);
    updateViewBox();
    return () => observer.disconnect();
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
      return clampDomain(next, fullDomain);
    });
  };

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
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
      return clampDomain(
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
    setDomain((current) => {
      const xDelta = (deltaX / rect.width) * (current.xmax - current.xmin);
      const yDelta = (deltaY / rect.height) * (current.ymax - current.ymin);
      return clampDomain(
        {
          xmin: current.xmin + xDelta,
          xmax: current.xmax + xDelta,
          ymin: current.ymin + yDelta,
          ymax: current.ymax + yDelta
        },
        fullDomain
      );
    });
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const intent = getPolingWheelIntent(event);
    if (intent.kind === "zoom") {
      zoomAt(event.clientX, event.clientY, intent.factor);
      return;
    }
    panByPixels(intent.deltaX, intent.deltaY);
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (mode !== "navigate") {
      const point = clientToGraph(event.clientX, event.clientY);
      if (!point) return;
      const drawing: Drawing = { type: mode, points: [point, point] };
      activeDrawingRef.current = drawing;
      setActiveDrawing(drawing);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if ((event.target as Element).closest("[data-poling-point]")) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
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
    if (!drag) return;
    panByPixels(drag.x - event.clientX, event.clientY - drag.y);
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const finishPointerInteraction = (event: ReactPointerEvent<SVGSVGElement>) => {
    const completedDrawing = activeDrawingRef.current;
    if (completedDrawing) {
      setAnnotations((current) => [...current, completedDrawing]);
      activeDrawingRef.current = null;
      setActiveDrawing(null);
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (!selectedRecord || !event.key.startsWith("Arrow")) return;
    const key = event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
    const next = nearestDirectionalRecord(visibleRecords, selectedRecord, key, positions);
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
      ]
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

      <div className={styles.workspace}>
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

            <p className={styles.variantNote}>
              {pulseWidths.map((width) => `${width} ms`).join(", ")} share this map.
            </p>

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
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointerInteraction}
              onPointerCancel={finishPointerInteraction}
              onDoubleClick={() => mode === "navigate" && setDomain(fullDomain)}
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

              {visibleRecords.map((record) => {
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
                    cx={x(point.voltage)}
                    cy={y(point.pulses)}
                    r={selected ? 7.5 : 6}
                    fill={seriesColors[record.specimenReference]}
                    className={className}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (mode === "navigate") selectRecord(record);
                    }}
                  >
                    <title>{`${record.specimenReference} ${record.dieLabel}, voltage ${record.voltage} (source value), ${record.pulses} pulse${record.pulses === 1 ? "" : "s"}, ${record.pulseWidthMs} ms${record.imagePath ? "" : ", no linked image"}`}</title>
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
          </div>

          <footer className={styles.plotFooter}>
            <div className={styles.legend} aria-label="Die color legend">
              <strong>Die</strong>
              {specimens.map((specimen) => (
                <span key={specimen}>
                  <i style={{ backgroundColor: seriesColors[specimen] }} />
                  {specimen}
                </span>
              ))}
              <span className={styles.dataOnlyLegend}>
                <i /> Data only
              </span>
            </div>
            <div className={styles.annotationActions}>
              <button
                type="button"
                disabled={!annotations.length}
                onClick={() => setAnnotations((current) => current.slice(0, -1))}
              >
                <Redo2 /> Undo
              </button>
              <button type="button" disabled={!annotations.length} onClick={() => setAnnotations([])}>
                <Eraser /> Clear
              </button>
              <button type="button" onClick={() => setDomain(fullDomain)}>
                <RotateCcw /> Reset view
              </button>
            </div>
          </footer>
          <p className={styles.hint}>
            Two-finger scroll or drag pans. Pinch zooms. Double-click resets, and arrow keys
            move between conditions after focusing the graph.
          </p>
          <p className={styles.catalogNote}>
            Source note: deck and workbook voltage headers conflict (V versus mV), so the
            numeric values are preserved without assigning a unit.
          </p>
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
                    description="This workbook condition has parameters but no linked slide image."
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

              <dl className={styles.metadata}>
                <div>
                  <dt>Applied pulse</dt>
                  <dd>
                    Voltage {selectedRecord.voltage} (source value), {selectedRecord.pulseWidthMs} ms
                  </dd>
                </div>
                <div>
                  <dt>Pulse count</dt>
                  <dd>{selectedRecord.pulses}</dd>
                </div>
                <div>
                  <dt>Post-pulse values</dt>
                  <dd>
                    {selectedRecord.postPulseVoltage ?? "Not recorded"} / {selectedRecord.postPulseWidthMs ?? "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    {selectedRecord.sourceFile ?? "Imported record"}
                    {selectedRecord.slide ? `, slide ${selectedRecord.slide}` : ""}
                  </dd>
                </div>
              </dl>

              {selectedFlags.map((flag, index) => (
                <p key={`${selectedRecord.id}-flag-${index}`} className={styles.warning}>
                  {flag}
                </p>
              ))}
              <p className={styles.sourceNote}>
                {selectedRecord.imagePath
                  ? "Original embedded microscopy image, presented without image processing."
                  : "Parameter-only workbook record; no image was linked in the source decks."}
                {selectedRecord.sourceAppearances && selectedRecord.sourceAppearances.length > 1
                  ? ` Preserved from ${selectedRecord.sourceAppearances.length} source appearances.`
                  : ""}
                {selectedRecord.postPulseVoltage != null || selectedRecord.postPulseWidthMs != null
                  ? " Post-pulse units were not stated, so raw source values are shown."
                  : ""}
              </p>
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
  setDomain: Dispatch<SetStateAction<Domain>>,
  fullDomain: Domain
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
    return clampDomain(
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
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.noImage}>
      <ImageOff aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}
