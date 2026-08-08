"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CURRENT_PLAYER_ID } from "../data/mockData";
import { createReactionGateway } from "../data/reaction-gateway";
import { createTrainingEntryGateway } from "../data/training-entry-gateway";
import { createTrainingDashboardGateway } from "../data/training-dashboard-gateway";
import type {
  Reaction,
  ReactionBadge,
  ReactionContext,
  ReactionType,
  SendReactionResult,
  TrainingEntry,
  TrainingEntryInput,
  TrainingDashboard,
} from "../domain/types";

interface TrainingState {
  connected: boolean;
  entries: TrainingEntry[];
  entriesStatus: "loading" | "ready" | "error";
  reactions: Reaction[];
  reactionBadges: ReactionBadge[];
  reactionInboxStatus: "loading" | "ready" | "error";
  reactionInboxHasMore: boolean;
  reactionInboxMoreStatus: "idle" | "loading" | "error";
  dashboard: TrainingDashboard | null;
  dashboardStatus: "loading" | "ready" | "error";
  addEntry: (entry: TrainingEntryInput) => Promise<TrainingEntry>;
  getEntry: (entryId: string) => Promise<TrainingEntry | null>;
  deleteEntry: (entryId: string) => Promise<void>;
  refreshEntries: () => Promise<void>;
  sendReaction: (
    targetPlayerId: string,
    type: ReactionType,
    context: ReactionContext,
  ) => Promise<SendReactionResult>;
  refreshReactionBadges: () => Promise<void>;
  loadMoreReactionBadges: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
}

const TrainingContext = createContext<TrainingState | null>(null);

export function TrainingProvider({
  children,
  connected = false,
  currentPlayerID = CURRENT_PLAYER_ID,
  currentTeamID = "team-hill-striders",
}: {
  children: React.ReactNode;
  connected?: boolean;
  currentPlayerID?: string;
  currentTeamID?: string;
}) {
  const [entries, setEntries] = useState<TrainingEntry[]>([]);
  const [entriesStatus, setEntriesStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reactionBadges, setReactionBadges] = useState<ReactionBadge[]>([]);
  const [reactionInboxStatus, setReactionInboxStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [reactionBadgeCursor, setReactionBadgeCursor] = useState<string | null>(
    null,
  );
  const [reactionInboxMoreStatus, setReactionInboxMoreStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [dashboard, setDashboard] = useState<TrainingDashboard | null>(null);
  const [dashboardStatus, setDashboardStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [reactionGateway] = useState(() => createReactionGateway(connected));
  const [trainingEntryGateway] = useState(() =>
    createTrainingEntryGateway(connected, currentTeamID),
  );
  const [trainingDashboardGateway] = useState(() =>
    createTrainingDashboardGateway(connected, currentTeamID),
  );

  const refreshDashboard = useCallback(async () => {
    try {
      setDashboard(await trainingDashboardGateway.get());
      setDashboardStatus("ready");
    } catch {
      setDashboardStatus("error");
    }
  }, [trainingDashboardGateway]);

  const refreshEntries = useCallback(async () => {
    try {
      setEntries(await trainingEntryGateway.list());
      setEntriesStatus("ready");
    } catch {
      setEntriesStatus("error");
    }
  }, [trainingEntryGateway]);

  const refreshReactionBadges = useCallback(async () => {
    try {
      const page = await reactionGateway.listReceived();
      setReactionBadges(page.items);
      setReactionBadgeCursor(page.nextCursor);
      setReactionInboxMoreStatus("idle");
      setReactionInboxStatus("ready");
    } catch {
      setReactionInboxStatus("error");
    }
  }, [reactionGateway]);

  const loadMoreReactionBadges = useCallback(async () => {
    if (!reactionBadgeCursor || reactionInboxMoreStatus === "loading") return;
    setReactionInboxMoreStatus("loading");
    try {
      const page = await reactionGateway.listReceived(reactionBadgeCursor);
      setReactionBadges((current) => {
        const existingIDs = new Set(current.map((badge) => badge.id));
        return [
          ...current,
          ...page.items.filter((badge) => !existingIDs.has(badge.id)),
        ];
      });
      setReactionBadgeCursor(page.nextCursor);
      setReactionInboxMoreStatus("idle");
    } catch {
      setReactionInboxMoreStatus("error");
    }
  }, [reactionBadgeCursor, reactionGateway, reactionInboxMoreStatus]);

  const addEntry = useCallback(
    async (input: TrainingEntryInput) => {
      const entry = await trainingEntryGateway.create(input);
      setEntries((current) => [
        entry,
        ...current.filter((item) => item.id !== entry.id),
      ]);
      if (connected) void refreshDashboard();
      return entry;
    },
    [connected, refreshDashboard, trainingEntryGateway],
  );

  const getEntry = useCallback(
    async (entryId: string) => {
      const entry = await trainingEntryGateway.get(entryId);
      if (entry) {
        setEntries((current) =>
          current.some((item) => item.id === entry.id)
            ? current
            : [entry, ...current],
        );
      }
      return entry;
    },
    [trainingEntryGateway],
  );

  const deleteEntry = useCallback(
    async (entryId: string) => {
      await trainingEntryGateway.delete(entryId);
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
    },
    [trainingEntryGateway],
  );

  const sendReaction = useCallback(
    async (
      targetPlayerId: string,
      type: ReactionType,
      context: ReactionContext,
    ) => {
      const result = await reactionGateway.send({
        recipientPlayerId: targetPlayerId,
        reactionType: type,
        context,
      });
      setReactions((current) => [
        {
          id: crypto.randomUUID(),
          senderPlayerId: currentPlayerID,
          targetPlayerId,
          type,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      return result;
    },
    [currentPlayerID, reactionGateway],
  );

  useEffect(() => {
    let active = true;
    void reactionGateway.listReceived().then(
      (page) => {
        if (!active) return;
        setReactionBadges(page.items);
        setReactionBadgeCursor(page.nextCursor);
        setReactionInboxStatus("ready");
      },
      () => {
        if (active) setReactionInboxStatus("error");
      },
    );
    return () => {
      active = false;
    };
  }, [reactionGateway]);

  useEffect(() => {
    let active = true;
    void trainingEntryGateway.list().then(
      (loadedEntries) => {
        if (!active) return;
        setEntries(loadedEntries);
        setEntriesStatus("ready");
      },
      () => {
        if (active) setEntriesStatus("error");
      },
    );
    return () => {
      active = false;
    };
  }, [trainingEntryGateway]);

  useEffect(() => {
    let active = true;
    void trainingDashboardGateway.get().then(
      (loadedDashboard) => {
        if (!active) return;
        setDashboard(loadedDashboard);
        setDashboardStatus("ready");
      },
      () => {
        if (active) setDashboardStatus("error");
      },
    );
    return () => {
      active = false;
    };
  }, [trainingDashboardGateway]);

  const value = useMemo<TrainingState>(
    () => ({
      connected,
      entries,
      entriesStatus,
      reactions,
      reactionBadges,
      reactionInboxStatus,
      reactionInboxHasMore: reactionBadgeCursor !== null,
      reactionInboxMoreStatus,
      dashboard,
      dashboardStatus,
      addEntry,
      getEntry,
      deleteEntry,
      refreshEntries,
      sendReaction,
      refreshReactionBadges,
      loadMoreReactionBadges,
      refreshDashboard,
    }),
    [
      addEntry,
      connected,
      dashboard,
      dashboardStatus,
      deleteEntry,
      entries,
      entriesStatus,
      getEntry,
      reactionBadges,
      reactionBadgeCursor,
      reactionInboxStatus,
      reactionInboxMoreStatus,
      reactions,
      refreshEntries,
      refreshReactionBadges,
      loadMoreReactionBadges,
      refreshDashboard,
      sendReaction,
    ],
  );

  return (
    <TrainingContext.Provider value={value}>
      {children}
    </TrainingContext.Provider>
  );
}

export function useTraining(): TrainingState {
  const context = useContext(TrainingContext);
  if (!context)
    throw new Error("useTraining must be used inside TrainingProvider");
  return context;
}
