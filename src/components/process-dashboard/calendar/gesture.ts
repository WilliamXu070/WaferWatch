export type GestureAxis = "pending" | "horizontal" | "vertical";

export function resolveGestureAxis(
  horizontalDistance: number,
  verticalDistance: number,
  threshold = 6
): GestureAxis {
  if (Math.max(Math.abs(horizontalDistance), Math.abs(verticalDistance)) < threshold) {
    return "pending";
  }

  return Math.abs(horizontalDistance) > Math.abs(verticalDistance)
    ? "horizontal"
    : "vertical";
}
