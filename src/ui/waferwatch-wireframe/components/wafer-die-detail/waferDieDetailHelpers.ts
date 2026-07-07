import type { WaferStatusTileModel } from "../../types";

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

export function getSelectedDieLabel(tile: WaferStatusTileModel) {
  return parseDieLabelIndex(tile.dieLabel || tile.code);
}

export function getWaferDisplayLabel(tile: WaferStatusTileModel, isUndiced: boolean) {
  return isUndiced ? tile.family : tile.code;
}

export function isUndicedMode(tile: WaferStatusTileModel) {
  return tile.mode ? tile.mode === "undiced" : Boolean(tile.isUndiced);
}

export function canOpenDieDetail(tile: WaferStatusTileModel) {
  return !isUndicedMode(tile);
}

function getDieCodeParts(tile: WaferStatusTileModel) {
  const code = tile.dieLabel || tile.code;
  const match = code.toUpperCase().match(/^([A-Z]+)\s*([0-9]+)/);
  const row = match?.[1] ?? "A";
  const position = match?.[2] ?? String(getSelectedDieLabel(tile) ?? 1);

  return { code, row, position };
}

export function getDieIdentity(tile: WaferStatusTileModel) {
  const parts = getDieCodeParts(tile);
  const paddedPosition = parts.position.padStart(2, "0");
  const familyCode = tile.family.replace(/[^A-Z0-9]+/gi, "").toUpperCase() || "DIE";

  return {
    ...parts,
    dieId: `${familyCode}-${parts.row}${paddedPosition}-2025-001`,
    material: "LiNbO3 on SiO2",
    dimensions: "5.0 mm x 5.0 mm",
    thickness: "600 um",
    orientation: "X-cut"
  };
}

export function statusLabel(tile: WaferStatusTileModel) {
  if (tile.status === "queued") return "Pending";
  return "In progress";
}
