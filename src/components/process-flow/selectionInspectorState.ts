export type SelectionInspectorIdentity = {
  isDie: boolean;
};

export function isSingleSelection(selectionCount: number) {
  return selectionCount === 1;
}

export function getVisibleSelectionStack<T>(items: readonly T[], visibleLimit = 4) {
  const visibleItems = items.slice(-visibleLimit);
  return {
    visibleItems,
    hiddenCount: Math.max(0, items.length - visibleItems.length)
  };
}

export function getSelectionKindLabel(items: readonly SelectionInspectorIdentity[]) {
  if (items.length === 1) return items[0].isDie ? "Selected die" : "Selected wafer";
  return items.every((item) => item.isDie) ? `${items.length} dies selected` : `${items.length} wafers selected`;
}

export function getSingleSelectionDeleteLabel(items: readonly SelectionInspectorIdentity[]) {
  if (items.length !== 1) return null;
  return items[0].isDie ? "Delete die" : "Delete wafer";
}
