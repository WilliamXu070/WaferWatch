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

export const WAFER_CODE_PATTERN = /^[A-Za-z0-9]+(?:[ A-Za-z0-9_.-]*[A-Za-z0-9])?$/;
export const WAFER_CODE_ERROR = "Use letters, numbers, spaces, periods, underscores, or hyphens.";

export function normalizeWaferCode(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function getWaferCodeValidationError(value: string) {
  const normalized = normalizeWaferCode(value);
  if (!normalized) return "Enter a wafer name.";
  if (normalized.length > 80) return "Wafer names must be 80 characters or fewer.";
  return WAFER_CODE_PATTERN.test(normalized) ? null : WAFER_CODE_ERROR;
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
