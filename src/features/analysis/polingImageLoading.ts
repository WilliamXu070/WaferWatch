import type { PolingRecord } from "./polingData";

export const POLING_IMAGE_PRELOAD_LIMIT = 7;

/**
 * Returns a small, deduplicated window around the selected condition. A record
 * without an image still warms its closest image-bearing neighbors.
 */
export function getPolingImagePreloadOrder(
  records: readonly PolingRecord[],
  selectedIdOrImagePath: string,
  limit = POLING_IMAGE_PRELOAD_LIMIT
) {
  if (limit <= 0 || records.length === 0) return [];

  const selectedIndex = Math.max(
    0,
    records.findIndex(
      (record) =>
        record.id === selectedIdOrImagePath || record.imagePath === selectedIdOrImagePath
    )
  );
  const paths: string[] = [];
  const seen = new Set<string>();

  const addAt = (index: number) => {
    const path = records[index]?.imagePath;
    if (!path || seen.has(path) || paths.length >= limit) return;
    seen.add(path);
    paths.push(path);
  };

  addAt(selectedIndex);
  for (let distance = 1; paths.length < limit && distance < records.length; distance += 1) {
    addAt(selectedIndex - distance);
    addAt(selectedIndex + distance);
  }

  return paths;
}
