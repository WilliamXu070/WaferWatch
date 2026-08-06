"use client";

import Image from "next/image";
import {
  Eraser,
  LocateFixed,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  TrendingUp
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import {
  POLING_CHIP_COLORS,
  POLING_RECORDS,
  type PolingChip,
  type PolingPulseWidth,
  type PolingRecord
} from "@/features/analysis/polingData";
import styles from "./PolingAnalysisMap.module.css";

type Domain = { xmin: number; xmax: number; ymin: number; ymax: number };
type GraphPoint = { x: number; y: number };
type Drawing = { type: "line" | "freehand"; points: GraphPoint[] };
type DrawMode = "navigate" | Drawing["type"];

const INITIAL_VIEWBOX = { width: 760, height: 520 };
const MARGIN = { left: 64, right: 24, top: 28, bottom: 54 };
const FULL_DOMAIN: Domain = { xmin: 425, xmax: 525, ymin: 0, ymax: 210 };
const PULSE_WIDTHS: readonly (PolingPulseWidth | "all")[] = ["all", 10, 100, 200];

function clampDomain(candidate: Domain): Domain {
  const xSpan = candidate.xmax - candidate.xmin;
  const ySpan = candidate.ymax - candidate.ymin;
  const xmin = Math.max(FULL_DOMAIN.xmin, Math.min(candidate.xmin, FULL_DOMAIN.xmax - xSpan));
  const ymin = Math.max(FULL_DOMAIN.ymin, Math.min(candidate.ymin, FULL_DOMAIN.ymax - ySpan));
  return { xmin, xmax: xmin + xSpan, ymin, ymax: ymin + ySpan };
}

function ticks(min: number, max: number, count = 6) {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + index * step);
}

function displayVoltage(record: PolingRecord) {
  const overlaps = POLING_RECORDS.filter(
    (candidate) =>
      candidate.chip === record.chip &&
      candidate.voltage === record.voltage &&
      candidate.pulses === record.pulses
  );
  const has100 = overlaps.some((candidate) => candidate.pulseWidthMs === 100);
  const has200 = overlaps.some((candidate) => candidate.pulseWidthMs === 200);
  if (has100 && has200) return record.voltage + (record.pulseWidthMs === 100 ? -0.7 : 0.7);
  return record.voltage;
}

function nearestDirectionalRecord(
  records: readonly PolingRecord[],
  current: PolingRecord,
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"
) {
  const [sx, sy] = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1]
  }[key];
  const currentX = displayVoltage(current);
  let candidates = records.filter((record) => {
    if (record.id === current.id) return false;
    return sx
      ? Math.sign(displayVoltage(record) - currentX) === sx
      : Math.sign(record.pulses - current.pulses) === sy;
  });
  if (!candidates.length) return null;

  const aligned = candidates.filter((record) =>
    sx ? record.pulses === current.pulses : record.voltage === current.voltage
  );
  if (aligned.length) candidates = aligned;

  return [...candidates].sort((a, b) => {
    const primaryA = sx
      ? Math.abs(displayVoltage(a) - currentX)
      : Math.abs(a.pulses - current.pulses);
    const primaryB = sx
      ? Math.abs(displayVoltage(b) - currentX)
      : Math.abs(b.pulses - current.pulses);
    const secondaryA = sx
      ? Math.abs(a.pulses - current.pulses)
      : Math.abs(displayVoltage(a) - currentX);
    const secondaryB = sx
      ? Math.abs(b.pulses - current.pulses)
      : Math.abs(displayVoltage(b) - currentX);
    return primaryA - primaryB || secondaryA - secondaryB;
  })[0];
}

export function PolingAnalysisMap() {
  const svgRef = useRef<SVGSVGElement>(null);
  const chartFrameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const activeDrawingRef = useRef<Drawing | null>(null);
  const [chipVisibility, setChipVisibility] = useState<Record<PolingChip, boolean>>({
    "Chip 1": true,
    "Chip 2": true
  });
  const [pulseWidth, setPulseWidth] = useState<PolingPulseWidth | "all">("all");
  const [selectedId, setSelectedId] = useState(POLING_RECORDS[0].id);
  const [domain, setDomain] = useState<Domain>(FULL_DOMAIN);
  const [mode, setMode] = useState<DrawMode>("navigate");
  const [annotations, setAnnotations] = useState<Drawing[]>([]);
  const [activeDrawing, setActiveDrawing] = useState<Drawing | null>(null);
  const [viewBox, setViewBox] = useState(INITIAL_VIEWBOX);

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

  const visibleRecords = useMemo(
    () =>
      POLING_RECORDS.filter(
        (record) =>
          chipVisibility[record.chip] &&
          (pulseWidth === "all" || record.pulseWidthMs === pulseWidth)
      ),
    [chipVisibility, pulseWidth]
  );

  const selectedRecord =
    visibleRecords.find((record) => record.id === selectedId) ?? visibleRecords[0] ?? null;

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
    const voltage = displayVoltage(record);
    setDomain((current) => {
      const xSpan = current.xmax - current.xmin;
      const ySpan = current.ymax - current.ymin;
      const xPadding = xSpan * 0.12;
      const yPadding = ySpan * 0.12;
      const next = { ...current };
      if (voltage < current.xmin + xPadding || voltage > current.xmax - xPadding) {
        next.xmin = voltage - xSpan / 2;
        next.xmax = voltage + xSpan / 2;
      }
      if (record.pulses < current.ymin + yPadding || record.pulses > current.ymax - yPadding) {
        next.ymin = record.pulses - ySpan / 2;
        next.ymax = record.pulses + ySpan / 2;
      }
      return clampDomain(next);
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
        Math.min(FULL_DOMAIN.xmax - FULL_DOMAIN.xmin, (current.xmax - current.xmin) * factor)
      );
      const ySpan = Math.max(
        8,
        Math.min(FULL_DOMAIN.ymax - FULL_DOMAIN.ymin, (current.ymax - current.ymin) * factor)
      );
      return clampDomain({
        xmin: xOrigin - xSpan * px,
        xmax: xOrigin + xSpan * (1 - px),
        ymin: yOrigin - ySpan * (1 - py),
        ymax: yOrigin + ySpan * py
      });
    });
  };

  const panByPixels = (deltaX: number, deltaY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDomain((current) => {
      const xDelta = (deltaX / rect.width) * (current.xmax - current.xmin);
      const yDelta = (deltaY / rect.height) * (current.ymax - current.ymin);
      return clampDomain({
        xmin: current.xmin + xDelta,
        xmax: current.xmax + xDelta,
        ymin: current.ymin + yDelta,
        ymax: current.ymax + yDelta
      });
    });
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    if (event.ctrlKey || Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 0.84 : 1.2);
      return;
    }
    panByPixels(event.deltaX, 0);
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
      const next = drawing.type === "line"
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
    if (activeDrawingRef.current) {
      setAnnotations((current) => [...current, activeDrawingRef.current as Drawing]);
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
    const next = nearestDirectionalRecord(visibleRecords, selectedRecord, key);
    if (!next) return;
    event.preventDefault();
    selectRecord(next);
  };

  const drawings = activeDrawing ? [...annotations, activeDrawing] : annotations;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Experiment analysis</p>
          <h1>Poling parameter map</h1>
          <p className={styles.intro}>
            Inspect the microscopy result recorded for each voltage and pulse condition.
          </p>
        </div>
        <div className={styles.recordCount} aria-label={`${visibleRecords.length} visible conditions`}>
          <strong>{visibleRecords.length}</strong>
          <span>visible conditions</span>
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.plotPanel} aria-label="Poling parameter graph">
          <div className={styles.filterBar}>
            <fieldset className={styles.chipFilters}>
              <legend>Chip</legend>
              {(["Chip 1", "Chip 2"] as const).map((chip) => (
                <label key={chip}>
                  <input
                    type="checkbox"
                    checked={chipVisibility[chip]}
                    onChange={(event) =>
                      setChipVisibility((current) => ({ ...current, [chip]: event.target.checked }))
                    }
                  />
                  <span style={{ "--chip-color": POLING_CHIP_COLORS[chip] } as React.CSSProperties} />
                  {chip}
                </label>
              ))}
            </fieldset>

            <label className={styles.widthFilter}>
              <span>Pulse width</span>
              <select
                value={pulseWidth}
                onChange={(event) =>
                  setPulseWidth(event.target.value === "all" ? "all" : Number(event.target.value) as PolingPulseWidth)
                }
              >
                {PULSE_WIDTHS.map((width) => (
                  <option key={width} value={width}>
                    {width === "all" ? "All widths" : `${width} ms`}
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
            </div>
          </div>

          <div ref={chartFrameRef} className={styles.chartFrame}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
              className={styles.chart}
              role="img"
              aria-label="Voltage versus number of pulses. Select a point to inspect its microscopy image."
              tabIndex={0}
              data-mode={mode}
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointerInteraction}
              onPointerCancel={finishPointerInteraction}
              onDoubleClick={() => mode === "navigate" && setDomain(FULL_DOMAIN)}
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
                Voltage (V)
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
                const voltage = displayVoltage(record);
                if (
                  voltage < domain.xmin ||
                  voltage > domain.xmax ||
                  record.pulses < domain.ymin ||
                  record.pulses > domain.ymax
                ) {
                  return null;
                }
                const selected = record.id === selectedRecord?.id;
                return (
                  <circle
                    key={`${record.id}-${record.pulseWidthMs}`}
                    data-poling-point
                    cx={x(voltage)}
                    cy={y(record.pulses)}
                    r={selected ? 7.5 : 6}
                    fill={POLING_CHIP_COLORS[record.chip]}
                    className={selected ? styles.selectedPoint : styles.point}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (mode === "navigate") selectRecord(record);
                    }}
                  >
                    <title>{`${record.chip}, ${record.voltage} V, ${record.pulses} pulse${record.pulses === 1 ? "" : "s"}, ${record.pulseWidthMs} ms`}</title>
                  </circle>
                );
              })}
            </svg>

            <div className={styles.zoomTools} aria-label="View controls">
              <button type="button" onClick={() => zoomAtCenter(0.8, setDomain)} aria-label="Zoom in">
                <Plus />
              </button>
              <button type="button" onClick={() => zoomAtCenter(1.25, setDomain)} aria-label="Zoom out">
                <Minus />
              </button>
              <button type="button" onClick={() => setDomain(FULL_DOMAIN)} aria-label="Reset view">
                <LocateFixed />
              </button>
            </div>
          </div>

          <footer className={styles.plotFooter}>
            <div className={styles.legend}>
              {(Object.entries(POLING_CHIP_COLORS) as [PolingChip, string][]).map(([chip, color]) => (
                <span key={chip}>
                  <i style={{ backgroundColor: color }} />
                  {chip}
                </span>
              ))}
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
              <button type="button" onClick={() => setDomain(FULL_DOMAIN)}>
                <RotateCcw /> Reset view
              </button>
            </div>
          </footer>
          <p className={styles.hint}>
            Scroll to zoom, drag to pan, double-click to reset, or use arrow keys after focusing the graph.
          </p>
        </section>

        <aside className={styles.detailPanel} aria-live="polite">
          {selectedRecord ? (
            <>
              <div className={styles.detailHeader}>
                <div>
                  <p>{selectedRecord.chip} · Slide {selectedRecord.slide}</p>
                  <h2>
                    {selectedRecord.voltage} V, {selectedRecord.pulses} pulse{selectedRecord.pulses === 1 ? "" : "s"}
                  </h2>
                </div>
                <span style={{ backgroundColor: POLING_CHIP_COLORS[selectedRecord.chip] }}>
                  {selectedRecord.pulseWidthMs} ms
                </span>
              </div>

              <div className={styles.imageStage}>
                <Image
                  key={selectedRecord.imagePath}
                  src={selectedRecord.imagePath}
                  width={1024}
                  height={1024}
                  sizes="(max-width: 900px) 100vw, 38vw"
                  priority={selectedRecord.id === POLING_RECORDS[0].id}
                  alt={`Microscopy result from slide ${selectedRecord.slide}: ${selectedRecord.voltage} volts and ${selectedRecord.pulses} pulses`}
                />
              </div>

              <dl className={styles.metadata}>
                <div>
                  <dt>Applied pulse</dt>
                  <dd>{selectedRecord.voltage} V for {selectedRecord.pulseWidthMs} ms</dd>
                </div>
                <div>
                  <dt>Pulse count</dt>
                  <dd>{selectedRecord.pulses}</dd>
                </div>
                <div>
                  <dt>Post-pulse</dt>
                  <dd>{selectedRecord.postPulseVoltage} V for {selectedRecord.postPulseWidthMs} ms</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>PowerPoint slide {selectedRecord.slide}</dd>
                </div>
              </dl>

              {selectedRecord.flag ? (
                <p className={styles.warning}>{selectedRecord.flag}</p>
              ) : null}
              <p className={styles.sourceNote}>
                Original embedded microscopy image, presented without image processing.
              </p>
            </>
          ) : (
            <div className={styles.emptyDetail}>
              <strong>No visible conditions</strong>
              <p>Enable a chip or choose another pulse width.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function zoomAtCenter(
  factor: number,
  setDomain: React.Dispatch<React.SetStateAction<Domain>>
) {
  setDomain((current) => {
    const centerX = (current.xmin + current.xmax) / 2;
    const centerY = (current.ymin + current.ymax) / 2;
    const xSpan = Math.max(
      4,
      Math.min(FULL_DOMAIN.xmax - FULL_DOMAIN.xmin, (current.xmax - current.xmin) * factor)
    );
    const ySpan = Math.max(
      8,
      Math.min(FULL_DOMAIN.ymax - FULL_DOMAIN.ymin, (current.ymax - current.ymin) * factor)
    );
    return clampDomain({
      xmin: centerX - xSpan / 2,
      xmax: centerX + xSpan / 2,
      ymin: centerY - ySpan / 2,
      ymax: centerY + ySpan / 2
    });
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
