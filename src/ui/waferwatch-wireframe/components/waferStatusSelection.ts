import type { WaferStatusTileModel } from "../types";

export function parseWaferStatusSelectionHash(hash: string) {
  const search = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const waferId = search.get("waferId")?.trim();
  if (!waferId) return null;

  return {
    waferId,
    dieLabel: search.get("dieLabel")?.trim() || undefined
  };
}

export function findDeepLinkedWaferStatusTile(
  tiles: readonly WaferStatusTileModel[],
  waferId?: string,
  dieLabel?: string
) {
  if (!waferId) return null;

  return tiles.find((tile) =>
    tile.waferId === waferId && (!dieLabel || tile.dieLabel === dieLabel)
  ) ?? null;
}

export function findInitialWaferStatusTile(
  tiles: readonly WaferStatusTileModel[],
  deepLinkedTile: WaferStatusTileModel | null
) {
  return deepLinkedTile ?? tiles.find((tile) => tile.isSelected) ?? tiles[0] ?? null;
}
