import type { PolingRecord } from "./polingData";

export function getPolingImagePreloadOrder(
  records: readonly PolingRecord[],
  selectedImagePath: string
) {
  const uniquePaths = [...new Set(records.map((record) => record.imagePath))];
  if (!uniquePaths.includes(selectedImagePath)) return uniquePaths;

  return [selectedImagePath, ...uniquePaths.filter((path) => path !== selectedImagePath)];
}
