import { trendPoints } from "./waferDieDetailData";

export function ResultTrendChart() {
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
