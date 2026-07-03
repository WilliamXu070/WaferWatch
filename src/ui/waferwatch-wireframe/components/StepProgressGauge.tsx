import type { DashboardModel } from "../types";

const TICK_COUNT = 44;
const CX = 130;
const CY = 118;
const INNER = 78;
const OUTER = 104;

function polar(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) };
}

export function StepProgressGauge({ progress }: { progress: DashboardModel["progress"] }) {
  const filled = Math.round((progress.percent / 100) * TICK_COUNT);

  return (
    <section aria-label={progress.title} className="flex flex-col items-center">
      <h2 className="self-start text-[15px] font-semibold text-[#151512]">{progress.title}</h2>

      <div className="relative mt-2">
        <svg width="260" height="140" viewBox="0 0 260 140" role="img" aria-label={`${progress.percent}% ${progress.caption}`}>
          {Array.from({ length: TICK_COUNT }).map((_, i) => {
            const angle = 180 - (i / (TICK_COUNT - 1)) * 180;
            const p1 = polar(angle, INNER);
            const p2 = polar(angle, OUTER);
            const isFilled = i < filled;
            return (
              <line
                key={i}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={isFilled ? "#141412" : "#d9d8ca"}
                strokeWidth={isFilled ? 2.4 : 2}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        <div className="absolute inset-x-0 bottom-2 flex flex-col items-center">
          <span className="text-[40px] font-semibold leading-none tracking-tight text-[#151512]">
            {progress.percent}%
          </span>
          <span className="mt-1.5 text-[13px] font-semibold text-[#151512]">{progress.caption}</span>
        </div>
      </div>

      <p className="mt-1 text-[13px] text-[#8a887b]">{progress.footer}</p>
    </section>
  );
}
