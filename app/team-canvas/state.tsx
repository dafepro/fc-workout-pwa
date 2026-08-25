"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  createTeamCanvasGateway,
  TeamCanvasGatewayError,
  type ConnectedTeamCanvasProjection,
  type TeamCanvasGateway,
  type TeamCanvasSettings,
} from "../data/team-canvas-gateway";
import { createTrainingDashboardGateway } from "../data/training-dashboard-gateway";
import { createTrainingEntryGateway } from "../data/training-entry-gateway";
import { useOptionalAuth } from "../state/auth-context";
import { useOptionalTraining } from "../state/training-context";
import type {
  BoardPosition,
  BoardTransform,
  CompletionKind,
  DayKind,
  ExtraActivity,
  StampAsset,
  TeamCanvasState,
} from "./model";
import type {
  TeamCanvasConnectionState,
  TeamCanvasTelemetry,
} from "../player/team-canvas/widget-contract";
import { EMPTY_TEAM_CANVAS_TELEMETRY } from "./realtime/telemetry";
import { createLatestInputQueue, type LatestInputQueue } from "./live-input";
import {
  applyTeamCanvasPhysicsFrame,
  applyTeamCanvasPieceFrame,
} from "./physics";
import {
  addLivePiece,
  beginDay,
  clearPieceSelection,
  dailyStampSet,
  deleteOwnedPiece,
  initialTeamCanvasState,
  isTeamCanvasState,
  logExtraActivity,
  moveOwnAvatar,
  normalizeRotation,
  recordCooldown,
  recordPlannedRest,
  recordPrimary,
  selectOwnedPiece,
  updateOwnedPiece,
} from "./model";

export const TEAM_CANVAS_STORAGE_KEY = "zoomigo-team-canvas-alpha-v2";
const TEAM_CANVAS_SETTINGS_KEY = "zoomigo-team-canvas-alpha-settings-v1";

export type ConnectedStatus =
  | "local"
  | "loading"
  | "locked"
  | "ready"
  | "error";

export interface TeamCanvasContextValue {
  state: TeamCanvasState;
  connectedStatus: ConnectedStatus;
  connectedProjection: ConnectedTeamCanvasProjection | null;
  localSettings: TeamCanvasSettings;
  connectedError: string | null;
  connectionState: TeamCanvasConnectionState;
  telemetry: TeamCanvasTelemetry;
  selectedPieceId: string | null;
  justCompletedPrimary: boolean;
  complete(input: {
    completion: CompletionKind;
    effort: number;
    tiredness: number;
  }): Promise<boolean>;
  recordRest(): Promise<void>;
  recordCooldown(): Promise<void>;
  recordExtra(activity: ExtraActivity): void;
  moveAvatar(position: BoardPosition): void;
  chooseStamp(asset: StampAsset): Promise<void>;
  togglePiece(pieceId: string): void;
  editPiece(pieceId: string, patch: Partial<BoardTransform>): void;
  deletePiece(pieceId: string): Promise<void>;
  clearPiece(): void;
  saveSettings(settings: TeamCanvasSettings): Promise<void>;
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
  const auth = useOptionalAuth();
  const training = useOptionalTraining();
  const connected = auth?.connected ?? false;
  const teamID = auth?.currentTeamID ?? "team-hill-striders";
  const currentPlayerID = auth?.currentPlayerID ?? "mason";
  const [store] = useState(() => createTeamCanvasStore(initialState));
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const gateway = useMemo<TeamCanvasGateway | null>(
    () => (connected ? createTeamCanvasGateway(teamID) : null),
    [connected, teamID],
  );
  const [connectedState, setConnectedState] = useState<{
    status: ConnectedStatus;
    projection: ConnectedTeamCanvasProjection | null;
    error: string | null;
  }>({
    status: connected ? "loading" : "local",
    projection: null,
    error: null,
  });
  const [remoteSelectedPieceId, setRemoteSelectedPieceId] = useState<
    string | null
  >(null);
  const [connectionState, setConnectionState] =
    useState<TeamCanvasConnectionState>(connected ? "connecting" : "local");
  const [telemetry, setTelemetry] = useState<TeamCanvasTelemetry>(
    EMPTY_TEAM_CANVAS_TELEMETRY,
  );
  const [localSettings, setLocalSettings] = useState(() =>
    loadLocalSettings(state),
  );
  const [justCompletedPrimary, setJustCompletedPrimary] = useState(false);
  const avatarInput = useRef<LatestInputQueue<BoardPosition> | null>(null);
  const pieceInputs = useRef(
    new Map<string, LatestInputQueue<BoardTransform>>(),
  );
  const selectedPieceRef = useRef<string | null>(null);
  const protectAvatarUntil = useRef(0);

  useEffect(() => {
    selectedPieceRef.current = remoteSelectedPieceId;
  }, [remoteSelectedPieceId]);

  const refresh = useCallback(
    async (lockedRetries = 0) => {
      if (!gateway) return;
      for (let attempt = 0; attempt <= lockedRetries; attempt += 1) {
        try {
          const projection = await gateway.load();
          setConnectedState({ status: "ready", projection, error: null });
          return;
        } catch (error) {
          if (
            error instanceof TeamCanvasGatewayError &&
            error.code === "team_canvas_locked"
          ) {
            if (attempt < lockedRetries) {
              await waitForTeamCanvasConsistency(attempt);
              continue;
            }
            setConnectedState({
              status: "locked",
              projection: null,
              error: null,
            });
            return;
          }
          setConnectedState({
            status: "error",
            projection: null,
            error:
              error instanceof Error
                ? error.message
                : "The team canvas could not be loaded.",
          });
          return;
        }
      }
    },
    [gateway],
  );

  useEffect(() => {
    if (!gateway) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [gateway, refresh]);

  useEffect(() => {
    if (!gateway || connectedState.status !== "ready") return;
    return gateway.subscribe({
      onChange: () => void refresh(),
      onPhysics: (frame) =>
        setConnectedState((current) =>
          current.projection
            ? {
                ...current,
                projection: applyTeamCanvasPhysicsFrame(
                  current.projection,
                  frame,
                  currentPlayerID,
                  selectedPieceRef.current,
                  Date.now() < protectAvatarUntil.current,
                ),
              }
            : current,
        ),
      onPiece: (frame) =>
        setConnectedState((current) =>
          current.projection
            ? {
                ...current,
                projection: applyTeamCanvasPieceFrame(
                  current.projection,
                  frame,
                  selectedPieceRef.current,
                ),
              }
            : current,
        ),
      onLifecycle: setConnectionState,
      onTelemetry: setTelemetry,
    });
  }, [connectedState.status, currentPlayerID, gateway, refresh]);

  useEffect(
    () => () => {
      avatarInput.current?.stop();
      pieceInputs.current.forEach((queue) => queue.stop());
      pieceInputs.current.clear();
    },
    [],
  );

  const reportConnectedError = useCallback((error: unknown) => {
    setConnectedState((current) => ({
      ...current,
      error:
        error instanceof Error
          ? error.message
          : "That canvas change could not be saved.",
    }));
  }, []);

  useEffect(() => {
    avatarInput.current?.stop();
    if (!gateway) {
      avatarInput.current = null;
      return;
    }
    const queue = createLatestInputQueue<BoardPosition>(
      50,
      async (position) => {
        try {
          await gateway.moveAvatar(position);
        } catch (error) {
          reportConnectedError(error);
        }
      },
    );
    avatarInput.current = queue;
    return () => queue.stop();
  }, [gateway, reportConnectedError]);

  useEffect(
    () => () => {
      pieceInputs.current.forEach((queue) => queue.stop());
      pieceInputs.current.clear();
    },
    [gateway],
  );

  const value = useMemo<TeamCanvasContextValue>(
    () => ({
      state,
      connectedStatus: connectedState.status,
      connectedProjection: connectedState.projection,
      localSettings,
      connectedError: connectedState.error,
      connectionState,
      telemetry,
      selectedPieceId: gateway ? remoteSelectedPieceId : state.selectedPieceId,
      justCompletedPrimary,
      async complete(input) {
        setConnectedState((current) => ({ ...current, error: null }));
        if (!gateway) {
          store.update((current) => recordPrimary(current, input));
          return true;
        }
        try {
          const dashboard = await createTrainingDashboardGateway(
            true,
            teamID,
          ).get();
          const planDay = dashboard.currentPlanDay;
          const planBlock = planDay?.blocks.find((block) => !block.completed);
          const assignment = planDay ? null : dashboard.currentAssignment;
          const plannedActivity =
            planDay && planDay.kind !== "rest"
              ? dashboard.activities.find(
                  ({ id }) => id === planBlock?.activityDefinitionId,
                )
              : undefined;
          const assignedActivity = dashboard.activities.find(
            ({ id }) => id === assignment?.activityDefinitionId,
          );
          const displayedPlanActivity = assignment
            ? undefined
            : dashboard.activities.find(({ id }) => id === "hill-sprints");
          const alternative = dashboard.activities.find(
            ({ id }) => id === "recovery-walk-jog",
          );
          const activity =
            input.completion === "approved-alternative"
              ? alternative
              : (plannedActivity ?? assignedActivity ?? displayedPlanActivity);
          if (!activity)
            throw new Error("Today’s approved activity is unavailable.");
          const target = assignment?.targetValue ?? activity.defaultValue;
          const activityValue =
            input.completion === "reach"
              ? Math.ceil((target * 1.25) / activity.step) * activity.step
              : input.completion === "approved-alternative"
                ? activity.defaultValue
                : target;
          const entry = {
            activityId: activity.id,
            assignmentId:
              input.completion === "approved-alternative"
                ? undefined
                : assignment?.id,
            plan:
              planDay &&
              planBlock &&
              input.completion !== "approved-alternative"
                ? {
                    planId: planDay.planId,
                    dayIndex: planDay.dayIndex,
                    blockIndex: planBlock.blockIndex,
                  }
                : undefined,
            occurredAt: new Date().toISOString(),
            value: activityValue,
            unit: activity.unit,
            inputKind: activity.inputKind,
            effortLevel: input.effort,
            exhaustionLevel: input.tiredness,
          };
          if (training) {
            await training.addEntry(entry);
          } else {
            await createTrainingEntryGateway(true, teamID).create(entry);
          }
          store.update((current) =>
            recordPrimary({ ...current, dayKind: "training" }, input),
          );
          setJustCompletedPrimary(true);
          await refresh(2);
          return true;
        } catch (error) {
          reportConnectedError(error);
          return false;
        }
      },
      async recordRest() {
        if (!gateway) {
          store.update((current) => recordPlannedRest(current));
          return;
        }
        try {
          const dashboard = await createTrainingDashboardGateway(
            true,
            teamID,
          ).get();
          const planDay = dashboard.currentPlanDay;
          if (!planDay || planDay.kind !== "rest") {
            throw new Error("Today’s planned rest is unavailable.");
          }
          await gateway.recordRest({
            planId: planDay.planId,
            dayIndex: planDay.dayIndex,
          });
          store.update((current) =>
            recordPlannedRest({ ...current, dayKind: "rest" }),
          );
          await training?.refreshDashboard();
          await refresh(2);
        } catch (error) {
          reportConnectedError(error);
        }
      },
      async recordCooldown() {
        if (!gateway) {
          store.update((current) => recordCooldown(current));
          return;
        }
        try {
          const dashboard = await createTrainingDashboardGateway(
            true,
            teamID,
          ).get();
          const activity = dashboard.activities.find(
            ({ id }) => id === "recovery-walk-jog",
          );
          if (!activity) throw new Error("Today’s cooldown is unavailable.");
          const entry = {
            activityId: activity.id,
            occurredAt: new Date().toISOString(),
            value: activity.defaultValue,
            unit: activity.unit,
            inputKind: activity.inputKind,
            effortLevel: 2,
            exhaustionLevel: 2,
          };
          if (training) {
            await training.addEntry(entry);
          } else {
            await createTrainingEntryGateway(true, teamID).create(entry);
          }
          store.update((current) => recordCooldown(current));
          setJustCompletedPrimary(false);
          await refresh();
        } catch (error) {
          reportConnectedError(error);
        }
      },
      recordExtra: (activity) =>
        store.update((current) => logExtraActivity(current, activity)),
      moveAvatar(position) {
        if (!gateway) {
          store.update((current) => moveOwnAvatar(current, position));
          return;
        }
        const bounded = boundedPosition(position);
        protectAvatarUntil.current = Date.now() + 350;
        setConnectedState((current) =>
          current.projection
            ? {
                ...current,
                projection: {
                  ...current.projection,
                  avatarPosition: bounded,
                  members: current.projection.members.map((member) =>
                    member.player.id === currentPlayerID
                      ? { ...member, position: bounded }
                      : member,
                  ),
                },
              }
            : current,
        );
        avatarInput.current?.push(bounded);
      },
      async chooseStamp(asset) {
        if (!gateway) {
          store.update((current) => addLivePiece(current, asset));
          return;
        }
        try {
          const piece = await gateway.createPiece(asset.id);
          setRemoteSelectedPieceId(piece.id);
          await refresh();
        } catch (error) {
          reportConnectedError(error);
        }
      },
      togglePiece(pieceId) {
        if (!gateway) {
          store.update((current) =>
            current.selectedPieceId === pieceId
              ? clearPieceSelection(current)
              : selectOwnedPiece(current, pieceId),
          );
          return;
        }
        setRemoteSelectedPieceId((current) =>
          current === pieceId ? null : pieceId,
        );
      },
      editPiece(pieceId, patch) {
        if (!gateway) {
          store.update((current) => updateOwnedPiece(current, pieceId, patch));
          return;
        }
        const piece = connectedState.projection?.pieces.find(
          (candidate) => candidate.id === pieceId && candidate.editable,
        );
        if (!piece) return;
        const transform = boundedTransform({ ...piece, ...patch });
        setConnectedState((current) => {
          if (!current.projection) return current;
          const pieces = current.projection.pieces.map((piece) => {
            if (piece.id !== pieceId || !piece.editable) return piece;
            return { ...piece, ...transform };
          });
          return {
            ...current,
            projection: { ...current.projection, pieces },
          };
        });
        let queue = pieceInputs.current.get(pieceId);
        if (!queue) {
          queue = createLatestInputQueue<BoardTransform>(80, async (next) => {
            try {
              await gateway.updatePiece(pieceId, next);
            } catch (error) {
              reportConnectedError(error);
              await refresh();
            }
          });
          pieceInputs.current.set(pieceId, queue);
        }
        queue.push(transform);
      },
      async deletePiece(pieceId) {
        if (!gateway) {
          store.update((current) => deleteOwnedPiece(current, pieceId));
          return;
        }
        const piece = connectedState.projection?.pieces.find(
          (candidate) => candidate.id === pieceId && candidate.editable,
        );
        if (!piece) return;
        pieceInputs.current.get(pieceId)?.stop();
        pieceInputs.current.delete(pieceId);
        setRemoteSelectedPieceId((current) =>
          current === pieceId ? null : current,
        );
        setConnectedState((current) =>
          current.projection
            ? {
                ...current,
                projection: {
                  ...current.projection,
                  pieces: current.projection.pieces.filter(
                    ({ id }) => id !== pieceId,
                  ),
                  availableRewards: current.projection.availableRewards + 1,
                },
              }
            : current,
        );
        try {
          await gateway.deletePiece(pieceId);
          await refresh();
        } catch (error) {
          reportConnectedError(error);
          await refresh();
        }
      },
      clearPiece() {
        if (gateway) setRemoteSelectedPieceId(null);
        else store.update((current) => clearPieceSelection(current));
      },
      async saveSettings(settings) {
        if (!gateway) {
          const persisted = {
            ...settings,
            revision: Math.max(1, settings.revision + 1),
          };
          setLocalSettings(persisted);
          try {
            window.localStorage.setItem(
              TEAM_CANVAS_SETTINGS_KEY,
              JSON.stringify(persisted),
            );
          } catch {
            // In-memory developer controls still work without storage.
          }
          return;
        }
        try {
          await gateway.saveSettings(settings);
          await refresh();
        } catch (error) {
          reportConnectedError(error);
        }
      },
      previewDay: (dayKind) =>
        store.update((current) =>
          beginDay(current, { dayKey: current.dayKey, dayKind }),
        ),
      reset() {
        setJustCompletedPrimary(false);
        setRemoteSelectedPieceId(null);
        store.update(() => initialTeamCanvasState());
      },
    }),
    [
      connectedState,
      connectionState,
      currentPlayerID,
      gateway,
      justCompletedPrimary,
      localSettings,
      refresh,
      remoteSelectedPieceId,
      reportConnectedError,
      state,
      store,
      teamID,
      training,
      telemetry,
    ],
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

export function useOptionalTeamCanvas(): TeamCanvasContextValue | null {
  return useContext(TeamCanvasContext);
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

function boundedPosition(position: BoardPosition): BoardPosition {
  return { x: clamp(position.x, 6, 94), y: clamp(position.y, 6, 94) };
}

function boundedTransform(transform: BoardTransform): BoardTransform {
  return {
    ...boundedPosition(transform),
    size: clamp(transform.size, 28, 76),
    rotation: normalizeRotation(transform.rotation),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function waitForTeamCanvasConsistency(attempt: number): Promise<void> {
  return new Promise((resolve) =>
    window.setTimeout(resolve, 75 * (attempt + 1)),
  );
}

function loadLocalSettings(state: TeamCanvasState): TeamCanvasSettings {
  const fallback: TeamCanvasSettings = {
    backgroundAssetId: "grass-gradient",
    backgroundColor: "#A8DC9D",
    textColor: "#115630",
    textSize: 112,
    textStyle: "block",
    stampChoices: dailyStampSet(state.teamId, state.dayKey).map(({ id }) => id),
    developerStampLimit: 0,
    revision: 0,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(TEAM_CANVAS_SETTINGS_KEY) ?? "null",
    ) as Partial<TeamCanvasSettings> | null;
    return saved && Array.isArray(saved.stampChoices)
      ? { ...fallback, ...saved }
      : fallback;
  } catch {
    return fallback;
  }
}
