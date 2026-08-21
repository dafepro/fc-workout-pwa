"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  BoardPosition,
  BoardTransform,
  CompletionKind,
  DayKind,
  ExtraActivity,
  StampAsset,
  TeamCanvasState,
} from "./model";
import {
  addLivePiece,
  beginDay,
  clearPieceSelection,
  initialTeamCanvasState,
  isTeamCanvasState,
  logExtraActivity,
  moveOwnAvatar,
  recordCooldown,
  recordPlannedRest,
  recordPrimary,
  selectOwnedPiece,
  updateOwnedPiece,
} from "./model";

export const TEAM_CANVAS_STORAGE_KEY = "zoomigo-team-canvas-alpha-v2";

interface TeamCanvasContextValue {
  state: TeamCanvasState;
  complete(input: {
    completion: CompletionKind;
    effort: number;
    tiredness: number;
  }): void;
  recordRest(): void;
  recordCooldown(): void;
  recordExtra(activity: ExtraActivity): void;
  moveAvatar(position: BoardPosition): void;
  chooseStamp(asset: StampAsset): void;
  togglePiece(pieceId: string): void;
  editPiece(pieceId: string, patch: Partial<BoardTransform>): void;
  clearPiece(): void;
  previewDay(dayKind: DayKind): void;
  reset(): void;
}

interface TeamCanvasStore {
  getSnapshot(): TeamCanvasState;
  getServerSnapshot(): TeamCanvasState;
  subscribe(listener: () => void): () => void;
  update(reducer: (state: TeamCanvasState) => TeamCanvasState): void;
}

const TeamCanvasContext = createContext<TeamCanvasContextValue | null>(null);

export function TeamCanvasProvider({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: TeamCanvasState;
}) {
  const [store] = useState(() => createTeamCanvasStore(initialState));
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  const value = useMemo<TeamCanvasContextValue>(
    () => ({
      state,
      complete: (input) =>
        store.update((current) => recordPrimary(current, input)),
      recordRest: () => store.update((current) => recordPlannedRest(current)),
      recordCooldown: () => store.update((current) => recordCooldown(current)),
      recordExtra: (activity) =>
        store.update((current) => logExtraActivity(current, activity)),
      moveAvatar: (position) =>
        store.update((current) => moveOwnAvatar(current, position)),
      chooseStamp: (asset) =>
        store.update((current) => addLivePiece(current, asset)),
      togglePiece: (pieceId) =>
        store.update((current) =>
          current.selectedPieceId === pieceId
            ? clearPieceSelection(current)
            : selectOwnedPiece(current, pieceId),
        ),
      editPiece: (pieceId, patch) =>
        store.update((current) => updateOwnedPiece(current, pieceId, patch)),
      clearPiece: () => store.update((current) => clearPieceSelection(current)),
      previewDay: (dayKind) =>
        store.update((current) =>
          beginDay(current, { dayKey: current.dayKey, dayKind }),
        ),
      reset: () => store.update(() => initialTeamCanvasState()),
    }),
    [state, store],
  );

  return (
    <TeamCanvasContext.Provider value={value}>
      {children}
    </TeamCanvasContext.Provider>
  );
}

export function useTeamCanvas(): TeamCanvasContextValue {
  const value = useContext(TeamCanvasContext);
  if (!value)
    throw new Error("useTeamCanvas must be used inside TeamCanvasProvider");
  return value;
}

function loadState(): TeamCanvasState {
  if (typeof window === "undefined") return initialTeamCanvasState();
  try {
    const value = JSON.parse(
      window.localStorage.getItem(TEAM_CANVAS_STORAGE_KEY) ?? "null",
    ) as unknown;
    return isTeamCanvasState(value) ? value : initialTeamCanvasState();
  } catch {
    return initialTeamCanvasState();
  }
}

function createTeamCanvasStore(
  initialState?: TeamCanvasState,
): TeamCanvasStore {
  const serverState = initialState ?? initialTeamCanvasState();
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
          TEAM_CANVAS_STORAGE_KEY,
          JSON.stringify(state),
        );
      } catch {
        // The in-memory review still works when browser storage is unavailable.
      }
      listeners.forEach((listener) => listener());
    },
  };
}
