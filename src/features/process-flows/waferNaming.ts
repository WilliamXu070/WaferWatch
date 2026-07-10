export const GREEK_WAFER_FAMILIES = [
  "ALPHA",
  "BETA",
  "GAMMA",
  "DELTA",
  "EPSILON",
  "ZETA",
  "ETA",
  "THETA",
  "IOTA",
  "KAPPA",
  "LAMBDA",
  "MU",
  "NU",
  "XI",
  "OMICRON",
  "PI",
  "RHO",
  "SIGMA",
  "TAU",
  "UPSILON",
  "PHI",
  "CHI",
  "PSI",
  "OMEGA"
] as const;

export function normalizeWaferCode(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function getWaferBaseCode(waferCode: string) {
  return normalizeWaferCode(waferCode).split("-")[0];
}

export function getNextGreekWaferCode(existingWaferCodes: readonly string[]) {
  const existingBaseCodes = new Set(existingWaferCodes.map(getWaferBaseCode));
  const existingExactCodes = new Set(existingWaferCodes.map(normalizeWaferCode));

  for (const family of GREEK_WAFER_FAMILIES) {
    if (!existingBaseCodes.has(family)) {
      return family;
    }
  }

  for (let cycle = 2; cycle < 1000; cycle += 1) {
    for (const family of GREEK_WAFER_FAMILIES) {
      const candidate = `${family}-${cycle}`;
      if (!existingExactCodes.has(candidate)) {
        return candidate;
      }
    }
  }

  return `WAFER-${Date.now()}`;
}
