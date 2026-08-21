"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  CompletionChoice,
  DayKind,
  ExtraActivity,
  Feeling,
  MomentumState,
  PlanSelection,
} from "./model";
import {
  completePlan,
  initialMomentumState,
  isMomentumState,
  logExtraActivity,
  logRecovery,
  recordPlannedRest,
} from "./model";

export const MOMENTUM_ALPHA_STORAGE_KEY = "zoomigo-momentum-alpha-v1";

interface MomentumAlphaContextValue {
  state: MomentumState;
  complete(input: {
    choice: CompletionChoice;
    feeling: Feeling;
    planSelection: PlanSelection;
  }): void;
  recordRest(): void;
  recordRecovery(): void;
  recordExtra(activity: ExtraActivity): void;
  previewDay(dayKind: DayKind): void;
  reset(): void;
}

interface MomentumStore {
  getSnapshot(): MomentumState;
  getServerSnapshot(): MomentumState;
  subscribe(listener: () => void): () => void;
  update(reducer: (state: MomentumState) => MomentumState): void;
}

const MomentumAlphaContext = createContext<MomentumAlphaContextValue | null>(
  null,
);

export function MomentumAlphaProvider({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: MomentumState;
}) {
  const [store] = useState(() => createMomentumStore(initialState));
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  const value = useMemo<MomentumAlphaContextValue>(
    () => ({
      state,
      complete: (input) =>
        store.update((current) => completePlan(current, input)),
      recordRest: () => store.update((current) => recordPlannedRest(current)),
      recordRecovery: () => store.update((current) => logRecovery(current)),
      recordExtra: (activity) =>
        store.update((current) => logExtraActivity(current, activity)),
      previewDay: (dayKind) =>
        store.update(() => ({ ...initialMomentumState(), dayKind })),
      reset: () => store.update(() => initialMomentumState()),
    }),
    [state, store],
  );

  return (
    <MomentumAlphaContext.Provider value={value}>
      {children}
    </MomentumAlphaContext.Provider>
  );
}

export function useMomentumAlpha(): MomentumAlphaContextValue {
  const value = useContext(MomentumAlphaContext);
  if (!value) {
    throw new Error(
      "useMomentumAlpha must be used inside MomentumAlphaProvider",
    );
  }
  return value;
}

function loadState(): MomentumState {
  if (typeof window === "undefined") return initialMomentumState();
  try {
    const value = JSON.parse(
      window.localStorage.getItem(MOMENTUM_ALPHA_STORAGE_KEY) ?? "null",
    ) as unknown;
    return isMomentumState(value) ? value : initialMomentumState();
  } catch {
    return initialMomentumState();
  }
}

function createMomentumStore(initialState?: MomentumState): MomentumStore {
  const serverState = initialState ?? initialMomentumState();
  let state = initialState ?? loadState();
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => state,
    getServerSnapshot: () => serverState,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(reducer) {
      const nextState = reducer(state);
      if (nextState === state) return;
      state = nextState;
      try {
        window.localStorage.setItem(
          MOMENTUM_ALPHA_STORAGE_KEY,
          JSON.stringify(state),
        );
      } catch {
        // The in-memory preview still works when browser storage is unavailable.
      }
      listeners.forEach((listener) => listener());
    },
  };
}
