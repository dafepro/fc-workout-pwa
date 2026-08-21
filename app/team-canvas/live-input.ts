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

  const schedule = () => {
    if (stopped || timer || inFlight || !hasLatest) return;
    timer = setTimeout(() => void flush(), intervalMilliseconds);
  };
  const flush = async () => {
    timer = null;
    if (stopped || inFlight || !hasLatest) return;
    const value = latest;
    hasLatest = false;
    inFlight = true;
    try {
      await send(value);
    } finally {
      inFlight = false;
      schedule();
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
