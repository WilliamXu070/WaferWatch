export type LatestFrameQueue<T> = {
  clear: () => void;
  push: (value: T) => void;
};

export function createLatestFrameQueue<T>({
  cancel,
  flush,
  schedule
}: {
  cancel: (frameId: number) => void;
  flush: (value: T) => void;
  schedule: (callback: () => void) => number;
}): LatestFrameQueue<T> {
  let frameId: number | null = null;
  let hasPendingValue = false;
  let pendingValue: T;

  const run = () => {
    frameId = null;
    if (!hasPendingValue) {
      return;
    }

    hasPendingValue = false;
    flush(pendingValue);
  };

  return {
    clear() {
      if (frameId !== null) {
        cancel(frameId);
      }
      frameId = null;
      hasPendingValue = false;
    },
    push(value) {
      pendingValue = value;
      hasPendingValue = true;
      if (frameId === null) {
        frameId = schedule(run);
      }
    }
  };
}
