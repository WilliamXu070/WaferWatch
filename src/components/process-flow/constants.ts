export const NODE_WIDTH = 276;
export const NODE_HEIGHT = 134;
export const SCENE_WIDTH = 4400;
export const SCENE_HEIGHT = 3200;
export const MIN_SCALE = 0.35;
export const MAX_SCALE = 2.6;
export const BUTTON_ZOOM_STEP = 0.12;
export const WHEEL_ZOOM_STEP = 0.08;
export const PERSISTENCE_DEBOUNCE_MS = 420;
export const POSITION_DEBOUNCE_MS = 250;
export const NAME_DEBOUNCE_MS = 680;
export const TRANSITION_RETRY_DELAY_MS = 520;
export const TRANSITION_RETRY_LIMIT = 12;
export const NODE_ID_PREFIX = "temp-step-";
export const EDGE_ID_PREFIX = "temp-edge-";
export const SNAP_THRESHOLD = 16;
export const LAYOUT_CENTER_X = 520;
export const LAYOUT_TOP_Y = 72;
export const LAYOUT_GAP_Y = 80;
export const LAYOUT_LANE_GAP_X = 88;
export const LAYOUT_LOOP_GAP_X = 46;
export const LAYOUT_LOOP_RADIUS_X = 84;
export const LAYOUT_LOOP_RADIUS_Y = 34;
export const EDGE_CURVE_OFFSET = 16;
export const EDGE_NODE_CLEARANCE = 4;
export const WAFER_CHIP_WIDTH = 88;
export const WAFER_CHIP_HEIGHT = 26;
export const NODE_CHIP_COLUMNS = 2;
export const WAFER_CHIP_GAP_X = 96;
export const WAFER_CHIP_GAP_Y = 34;
export const FIT_VIEW_PADDING = 96;

export function getNodeHeightForWaferCount(waferCount: number) {
  const chipRows = waferCount > 0 ? Math.ceil(waferCount / NODE_CHIP_COLUMNS) : 0;

  if (chipRows <= 1) {
    return NODE_HEIGHT;
  }

  return NODE_HEIGHT + (chipRows - 1) * WAFER_CHIP_GAP_Y;
}
