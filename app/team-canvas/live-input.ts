export interface LatestInputQueue<T> {
  push(value: T): void;
  stop(): void;
}

export function createLatestInputQueue<T>(
  intervalMilliseconds: number,
  send: (value: T) => Promise<void>,
): LatestInputQueue<T> {
  let latest!: T;
  let hasLatest = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let stopped = false;
  let nextAllowedAt = Date.now() + intervalMilliseconds;

  const schedule = () => {
    if (stopped || timer || inFlight || !hasLatest) return;
    timer = setTimeout(
      () => void flush(),
      Math.max(0, nextAllowedAt - Date.now()),
    );
  };
  const flush = async () => {
    timer = null;
    if (stopped || inFlight || !hasLatest) return;
    const value = latest;
    hasLatest = false;
    inFlight = true;
    nextAllowedAt = Date.now() + intervalMilliseconds;
    try {
      await send(value);
    } finally {
      inFlight = false;
      if (hasLatest && !stopped) {
        if (Date.now() >= nextAllowedAt) void flush();
        else schedule();
      }
    }
  };

  return {
    push(value) {
      if (stopped) return;
      latest = value;
      hasLatest = true;
      schedule();
    },
    stop() {
      stopped = true;
      hasLatest = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
