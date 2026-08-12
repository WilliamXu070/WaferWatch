export type PolingWheelInputMode = "auto" | "trackpad" | "mouse";
export type PolingWheelModality = "pan" | "zoom";

export type PolingWheelSample = {
  ctrlKey: boolean;
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  clientX: number;
  clientY: number;
};

export type PolingWheelAction = {
  modality: PolingWheelModality;
  sample: PolingWheelSample;
};

export type PolingWheelDecision = {
  actions: PolingWheelAction[];
  pending: boolean;
};

export const POLING_WHEEL_CLASSIFY_DELAY_MS = 40;
export const POLING_WHEEL_BURST_IDLE_MS = 400;

const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
const DEFINITE_TRACKPAD_DELTA = 4;
const WHEEL_STEP = 4.000244140625;
const TRACKPAD_BURST_PRODUCT = 800;
const MAX_ZOOM_DELTA = 32;
const ZOOM_SENSITIVITY = 0.0065;

type ImmediateClassification = PolingWheelModality | "ambiguous" | "none";

export function isPolingWheelInputMode(value: string): value is PolingWheelInputMode {
  return value === "auto" || value === "trackpad" || value === "mouse";
}

export function normalizePolingWheelDelta(delta: number, deltaMode: number) {
  if (deltaMode === DOM_DELTA_LINE) return delta * 16;
  if (deltaMode === DOM_DELTA_PAGE) return delta * 240;
  return delta;
}

export function getPolingPanDelta(sample: PolingWheelSample) {
  return {
    deltaX: normalizePolingWheelDelta(sample.deltaX, sample.deltaMode),
    deltaY: -normalizePolingWheelDelta(sample.deltaY, sample.deltaMode)
  };
}

export function getPolingZoomFactor(normalizedDeltaY: number) {
  const boundedDelta = Math.min(
    MAX_ZOOM_DELTA,
    Math.max(-MAX_ZOOM_DELTA, normalizedDeltaY)
  );
  return Math.exp(boundedDelta * ZOOM_SENSITIVITY);
}

function isDefiniteWheelStep(deltaY: number) {
  if (!deltaY) return false;
  return Number.isInteger(deltaY / WHEEL_STEP);
}

export function classifyPolingWheelSample(
  sample: PolingWheelSample,
  inputMode: PolingWheelInputMode
): ImmediateClassification {
  if (
    !Number.isFinite(sample.deltaX) ||
    !Number.isFinite(sample.deltaY) ||
    (!sample.deltaX && !sample.deltaY)
  ) {
    return "none";
  }

  // Chromium reports a trackpad pinch as a ctrl-wheel stream. It is the only
  // deterministic wheel signal that means zoom across mouse and trackpad input.
  if (sample.ctrlKey) return "zoom";
  if (inputMode === "mouse") return "zoom";
  if (inputMode === "trackpad") return "pan";

  if (sample.deltaMode === DOM_DELTA_LINE || sample.deltaMode === DOM_DELTA_PAGE) {
    return "zoom";
  }
  if (sample.deltaMode !== DOM_DELTA_PIXEL) return "ambiguous";
  if (Math.abs(sample.deltaX) >= 0.5) return "pan";
  if (Math.abs(sample.deltaY) < DEFINITE_TRACKPAD_DELTA) return "pan";
  if (isDefiniteWheelStep(sample.deltaY)) return "zoom";
  return "ambiguous";
}

export function classifyPolingAmbiguousBurst(
  previous: PolingWheelSample,
  current: PolingWheelSample,
  elapsedMs: number
): PolingWheelModality {
  const currentMagnitude = Math.abs(current.deltaY);
  const previousMagnitude = Math.abs(previous.deltaY);
  const magnitudeChanged = Math.abs(currentMagnitude - previousMagnitude) >= 1;
  const rapidContinuousStream =
    elapsedMs <= POLING_WHEEL_CLASSIFY_DELAY_MS &&
    (elapsedMs * currentMagnitude < TRACKPAD_BURST_PRODUCT || magnitudeChanged);

  return rapidContinuousStream ? "pan" : "zoom";
}

/**
 * WheelEvent does not expose an input-device type. This classifier delays only
 * the first ambiguous vertical pixel event, then locks the inferred modality
 * for the rest of the burst. Explicit Trackpad/Mouse modes bypass inference.
 */
export class PolingWheelGestureClassifier {
  private modality: PolingWheelModality | null = null;
  private lastEventTime: number | null = null;
  private pendingSample: { sample: PolingWheelSample; time: number } | null = null;

  ingest(
    sample: PolingWheelSample,
    time: number,
    inputMode: PolingWheelInputMode
  ): PolingWheelDecision {
    const immediate = classifyPolingWheelSample(sample, inputMode);
    if (immediate === "none") return { actions: [], pending: Boolean(this.pendingSample) };

    const idle =
      this.lastEventTime === null || time - this.lastEventTime > POLING_WHEEL_BURST_IDLE_MS;
    if (idle) {
      this.modality = null;
      this.pendingSample = null;
    }
    this.lastEventTime = time;

    if (sample.ctrlKey) {
      this.pendingSample = null;
      this.modality = null;
      return { actions: [{ modality: "zoom", sample }], pending: false };
    }

    if (inputMode !== "auto") {
      this.pendingSample = null;
      this.modality = null;
      return {
        actions: [{ modality: inputMode === "mouse" ? "zoom" : "pan", sample }],
        pending: false
      };
    }

    if (this.modality) {
      return { actions: [{ modality: this.modality, sample }], pending: false };
    }

    if (immediate === "pan" || immediate === "zoom") {
      const actions = this.pendingSample
        ? [
            { modality: immediate, sample: this.pendingSample.sample },
            { modality: immediate, sample }
          ]
        : [{ modality: immediate, sample }];
      this.pendingSample = null;
      this.modality = immediate;
      return { actions, pending: false };
    }

    if (!this.pendingSample) {
      this.pendingSample = { sample, time };
      return { actions: [], pending: true };
    }

    const pending = this.pendingSample;
    const modality = classifyPolingAmbiguousBurst(pending.sample, sample, time - pending.time);
    this.pendingSample = null;
    this.modality = modality;
    return {
      actions: [
        { modality, sample: pending.sample },
        { modality, sample }
      ],
      pending: false
    };
  }

  flushPendingAsMouse(): PolingWheelDecision {
    if (!this.pendingSample) return { actions: [], pending: false };
    const sample = this.pendingSample.sample;
    this.pendingSample = null;
    this.modality = "zoom";
    return { actions: [{ modality: "zoom", sample }], pending: false };
  }

  reset() {
    this.modality = null;
    this.lastEventTime = null;
    this.pendingSample = null;
  }
}
