"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { earliestAllowedDate, toDateInput } from "../domain/rules";

type ClockSnapshot = {
  date: string;
  earliestDate: string;
  time: string;
};

const EMPTY_CLOCK: ClockSnapshot = { date: "", earliestDate: "", time: "" };

function createLocalClockStore() {
  let snapshot = EMPTY_CLOCK;
  let initialized = false;

  return {
    subscribe(notify: () => void) {
      if (!initialized) {
        const now = new Date();
        snapshot = {
          date: toDateInput(now),
          earliestDate: earliestAllowedDate(now),
          time: now.toTimeString().slice(0, 5),
        };
        initialized = true;
        notify();
      }

      return () => undefined;
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_CLOCK,
  };
}

export function useLocalSessionClock() {
  const store = useMemo(() => createLocalClockStore(), []);
  const defaults = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [dateOverride, setDate] = useState<string | null>(null);
  const [timeOverride, setTime] = useState<string | null>(null);
  const date = dateOverride ?? defaults.date;
  const time = timeOverride ?? defaults.time;

  return {
    date,
    earliestDate: defaults.earliestDate,
    time,
    today: defaults.date,
    ready: Boolean(date && time),
    setDate,
    setTime,
  };
}
