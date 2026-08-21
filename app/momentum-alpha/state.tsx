"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createTeamCanvasGateway } from "../data/team-canvas-gateway";
import { useOptionalAuth } from "../state/auth-context";
import { useOptionalTraining } from "../state/training-context";
import {
  connectedMomentumModel,
  momentumCompletionInput,
  momentumExtraInput,
  momentumRecoveryInput,
  type MomentumPresentation,
} from "./connected";
import { momentumAlphaMock } from "./mock-data";
import { momentumAlphaCopy } from "./content";
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
  presentation: MomentumPresentation;
  teamName: string;
  recentPlanFollowers: number;
  highlightedPlayers: string[];
  loading: boolean;
  complete(input: {
    choice: CompletionChoice;
    feeling: Feeling;
    planSelection: PlanSelection;
  }): void | Promise<void>;
  recordRest(): void | Promise<void>;
  recordRecovery(): void | Promise<void>;
  recordExtra(activity: ExtraActivity): void | Promise<void>;
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
  const auth = useOptionalAuth();
  const training = useOptionalTraining();
  const [store] = useState(() => createMomentumStore(initialState));
  const localState = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [now] = useState(() => new Date());
  const [plannedRestComplete, setPlannedRestComplete] = useState(false);
  const connected = Boolean(auth?.connected && training?.connected);
  const dashboard = training?.dashboard ?? null;
  const connectedModel = useMemo(
    () =>
      connected && dashboard && auth
        ? connectedMomentumModel(
            dashboard,
            training?.entries ?? [],
            auth.currentPlayerID,
            now,
            plannedRestComplete,
          )
        : null,
    [auth, connected, dashboard, now, plannedRestComplete, training?.entries],
  );
  const teamCanvasGateway = useMemo(
    () =>
      connected && auth ? createTeamCanvasGateway(auth.currentTeamID) : null,
    [auth, connected],
  );

  useEffect(() => {
    if (!teamCanvasGateway || dashboard?.currentAssignment) return;
    let active = true;
    void teamCanvasGateway.load().then(
      (projection) => {
        if (active) setPlannedRestComplete(projection.cooldownComplete);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [dashboard?.currentAssignment, teamCanvasGateway]);

  const localPresentation = useMemo<MomentumPresentation>(
    () => ({
      plan: {
        ...momentumAlphaMock.plan,
        reasons: [...momentumAlphaMock.plan.reasons],
      },
      alternatives: momentumAlphaMock.alternatives.map((item) => ({ ...item })),
      recovery: { ...momentumAlphaMock.recovery },
      extras: momentumAlphaMock.extras.map((item) => ({ ...item })),
    }),
    [],
  );

  const value = useMemo<MomentumAlphaContextValue>(
    () => ({
      state: connectedModel?.state ?? localState,
      presentation: connectedModel ?? localPresentation,
      teamName: connectedModel?.teamName ?? momentumAlphaMock.player.team,
      recentPlanFollowers:
        connectedModel?.recentPlanFollowers ??
        8 + (localState.teamContribution > 0 ? 1 : 0),
      highlightedPlayers: connectedModel ? [] : ["Ari", "Elena", "Noah", "Zoe"],
      loading: connected && !connectedModel,
      complete(input) {
        if (connected) {
          if (!connectedModel || !training)
            throw new Error(momentumAlphaCopy.connected.planLoading);
          return training
            .addEntry(momentumCompletionInput(connectedModel, input))
            .then(() => undefined);
        }
        store.update((current) => completePlan(current, input));
      },
      recordRest() {
        if (connected) {
          if (!teamCanvasGateway)
            throw new Error(momentumAlphaCopy.connected.recoveryLoading);
          return teamCanvasGateway.recordRest().then(() => {
            setPlannedRestComplete(true);
          });
        }
        store.update((current) => recordPlannedRest(current));
      },
      recordRecovery() {
        if (connected) {
          if (!connectedModel || !training)
            throw new Error(momentumAlphaCopy.connected.recoveryLoading);
          return training
            .addEntry(momentumRecoveryInput(connectedModel))
            .then(() => undefined);
        }
        store.update((current) => logRecovery(current));
      },
      recordExtra(activity) {
        if (connected) {
          if (!connectedModel || !training)
            throw new Error(momentumAlphaCopy.connected.activitiesLoading);
          return training
            .addEntry(momentumExtraInput(connectedModel, activity))
            .then(() => undefined);
        }
        store.update((current) => logExtraActivity(current, activity));
      },
      previewDay: (dayKind) =>
        !connected &&
        store.update(() => ({ ...initialMomentumState(), dayKind })),
      reset: () => !connected && store.update(() => initialMomentumState()),
    }),
    [
      connected,
      connectedModel,
      localPresentation,
      localState,
      store,
      teamCanvasGateway,
      training,
    ],
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
