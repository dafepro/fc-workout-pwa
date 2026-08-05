"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CURRENT_PLAYER_ID, initialEntries } from "../data/mockData";
import { createReactionGateway } from "../data/reaction-gateway";
import type {
  Reaction,
  ReactionBadge,
  ReactionContext,
  ReactionType,
  SendReactionResult,
  TrainingEntry,
} from "../domain/types";

interface TrainingState {
  entries: TrainingEntry[];
  reactions: Reaction[];
  reactionBadges: ReactionBadge[];
  reactionInboxStatus: "loading" | "ready" | "error";
  addEntry: (entry: TrainingEntry) => void;
  deleteEntry: (entryId: string) => void;
  sendReaction: (
    targetPlayerId: string,
    type: ReactionType,
    context: ReactionContext,
  ) => Promise<SendReactionResult>;
  refreshReactionBadges: () => Promise<void>;
}

const STORAGE_KEY = "stridecrew-milestone-1";
const TrainingContext = createContext<TrainingState | null>(null);

function persistSnapshot(entries: TrainingEntry[], reactions: Reaction[]) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ entries, reactions }),
    );
  } catch {
    // The in-memory prototype remains usable when device storage is blocked.
  }
}

export function TrainingProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<TrainingEntry[]>(initialEntries);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reactionBadges, setReactionBadges] = useState<ReactionBadge[]>([]);
  const [reactionInboxStatus, setReactionInboxStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [reactionGateway] = useState(createReactionGateway);
  const [hydrated, setHydrated] = useState(false);

  const refreshReactionBadges = useCallback(async () => {
    try {
      setReactionBadges(await reactionGateway.listReceived());
      setReactionInboxStatus("ready");
    } catch {
      setReactionInboxStatus("error");
    }
  }, [reactionGateway]);

  useEffect(() => {
    let active = true;
    void reactionGateway.listReceived().then(
      (badges) => {
        if (!active) return;
        setReactionBadges(badges);
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
    const hydrationTask = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as {
            entries?: TrainingEntry[];
            reactions?: Reaction[];
          };
          if (Array.isArray(parsed.entries)) setEntries(parsed.entries);
          if (Array.isArray(parsed.reactions)) setReactions(parsed.reactions);
        }
      } catch {
        // A blocked or malformed local store should not prevent the prototype loading.
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ entries, reactions }),
    );
  }, [entries, reactions, hydrated]);

  const value = useMemo<TrainingState>(
    () => ({
      entries,
      reactions,
      reactionBadges,
      reactionInboxStatus,
      addEntry: (entry) =>
        setEntries((current) => {
          const next = [entry, ...current];
          persistSnapshot(next, reactions);
          return next;
        }),
      deleteEntry: (entryId) =>
        setEntries((current) => {
          const next = current.filter((entry) => entry.id !== entryId);
          persistSnapshot(next, reactions);
          return next;
        }),
      sendReaction: async (targetPlayerId, type, context) => {
        const result = await reactionGateway.send({
          recipientPlayerId: targetPlayerId,
          reactionType: type,
          context,
        });
        setReactions((current) => {
          const next = [
            {
              id: crypto.randomUUID(),
              senderPlayerId: CURRENT_PLAYER_ID,
              targetPlayerId,
              type,
              createdAt: new Date().toISOString(),
            },
            ...current,
          ];
          persistSnapshot(entries, next);
          return next;
        });
        return result;
      },
      refreshReactionBadges,
    }),
    [
      entries,
      reactionBadges,
      reactionGateway,
      reactionInboxStatus,
      reactions,
      refreshReactionBadges,
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
