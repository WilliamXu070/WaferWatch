import type { WaferStatusTileModel } from "../types";

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
