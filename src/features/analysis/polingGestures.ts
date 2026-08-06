export type PolingWheelIntent =
  | { kind: "pan"; deltaX: number; deltaY: number }
  | { kind: "zoom"; factor: number };

export function getPolingWheelIntent({
  ctrlKey,
  deltaX,
  deltaY
}: {
  ctrlKey: boolean;
  deltaX: number;
  deltaY: number;
}): PolingWheelIntent {
  if (ctrlKey) {
    return { kind: "zoom", factor: deltaY < 0 ? 0.84 : 1.2 };
  }

  return {
    kind: "pan",
    deltaX,
    deltaY: -deltaY
  };
}
