export type PolingDomain = {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
};

export function createPolingFullDomain(
  voltages: readonly number[],
  pulses: readonly number[]
): PolingDomain {
  if (!voltages.length || !pulses.length) {
    return { xmin: 0, xmax: 10, ymin: 0, ymax: 10 };
  }

  const voltageMin = Math.min(...voltages);
  const voltageMax = Math.max(...voltages);
  const pulseMin = Math.min(...pulses);
  const pulseMax = Math.max(...pulses);
  const voltagePadding = Math.max(5, (voltageMax - voltageMin) * 0.04);
  const pulsePadding = Math.max(5, (pulseMax - pulseMin) * 0.05);

  return {
    xmin: Math.floor(voltageMin - voltagePadding),
    xmax: Math.ceil(voltageMax + voltagePadding),
    ymin: Math.min(0, Math.floor(pulseMin - pulsePadding)),
    ymax: Math.max(5, Math.ceil(pulseMax + pulsePadding))
  };
}

export function clampPolingDomain(
  candidate: PolingDomain,
  fullDomain: PolingDomain
): PolingDomain {
  const fullYSpan = fullDomain.ymax - fullDomain.ymin;
  const ySpan = Math.min(candidate.ymax - candidate.ymin, fullYSpan);
  const ymax = Math.min(candidate.ymax, fullDomain.ymax);
  return {
    xmin: candidate.xmin,
    xmax: candidate.xmax,
    ymin: ymax - ySpan,
    ymax
  };
}

export function panPolingDomainByClientDelta({
  domain,
  fullDomain,
  deltaX,
  deltaY,
  renderedPlotWidth,
  renderedPlotHeight
}: {
  domain: PolingDomain;
  fullDomain: PolingDomain;
  deltaX: number;
  deltaY: number;
  renderedPlotWidth: number;
  renderedPlotHeight: number;
}) {
  if (renderedPlotWidth <= 0 || renderedPlotHeight <= 0) return domain;
  const xDelta = (deltaX / renderedPlotWidth) * (domain.xmax - domain.xmin);
  const yDelta = (deltaY / renderedPlotHeight) * (domain.ymax - domain.ymin);
  return clampPolingDomain(
    {
      xmin: domain.xmin + xDelta,
      xmax: domain.xmax + xDelta,
      ymin: domain.ymin + yDelta,
      ymax: domain.ymax + yDelta
    },
    fullDomain
  );
}
