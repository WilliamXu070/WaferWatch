export type VisualViewportInsetInput = {
  layoutViewportHeight: number;
  visualViewportHeight: number;
  visualViewportOffsetTop: number;
};

export function getVisualViewportBottomInset({
  layoutViewportHeight,
  visualViewportHeight,
  visualViewportOffsetTop
}: VisualViewportInsetInput) {
  return Math.max(0, Math.round(layoutViewportHeight - visualViewportHeight - visualViewportOffsetTop));
}
