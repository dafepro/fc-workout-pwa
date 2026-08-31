import { createDeleteDeadline } from "../domain/rules";
import type { TrainingEntry, TrainingEntryInput } from "../domain/types";
import type { TrainingEntryGateway } from "../data/training-entry-gateway";
import { CURRENT_PLAYER_ID, initialEntries } from "./data";

const LOCAL_ENTRIES_KEY = "zoomigo-milestone-1";

export function createUnhostedPrototypeTrainingEntryGateway(): TrainingEntryGateway {
  return new UnhostedPrototypeTrainingEntryGateway();
}

class UnhostedPrototypeTrainingEntryGateway implements TrainingEntryGateway {
  async list(): Promise<TrainingEntry[]> {
    return readLocalEntries();
  }

  async get(entryID: string): Promise<TrainingEntry | null> {
    return readLocalEntries().find((entry) => entry.id === entryID) ?? null;
  }

  async create(input: TrainingEntryInput): Promise<TrainingEntry> {
    const now = new Date();
    const entry: TrainingEntry = {
      id: crypto.randomUUID(),
      playerId: CURRENT_PLAYER_ID,
      activityId: input.activityId,
      occurredAt: input.occurredAt,
      value: input.value,
      unit: input.unit,
      effortLevel: input.effortLevel,
      exhaustionLevel: input.exhaustionLevel,
      completionOutcome: input.completionOutcome,
      assignmentId: input.assignmentId,
      plan: input.plan,
      createdAt: now.toISOString(),
      deleteEligibleUntil: createDeleteDeadline(now),
    };
    writeLocalEntries([entry, ...readLocalEntries()]);
    return entry;
  }

  async delete(entryID: string): Promise<void> {
    writeLocalEntries(
      readLocalEntries().filter((entry) => entry.id !== entryID),
    );
  }
}

function readLocalEntries(): TrainingEntry[] {
  try {
    const stored = window.localStorage.getItem(LOCAL_ENTRIES_KEY);
    if (!stored) return initialEntries;
    const parsed = JSON.parse(stored) as { entries?: TrainingEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : initialEntries;
  } catch {
    return initialEntries;
  }
}

function writeLocalEntries(entries: TrainingEntry[]): void {
  try {
    const stored = window.localStorage.getItem(LOCAL_ENTRIES_KEY);
    const current = stored
      ? (JSON.parse(stored) as Record<string, unknown>)
      : {};
    window.localStorage.setItem(
      LOCAL_ENTRIES_KEY,
      JSON.stringify({ ...current, entries }),
    );
  } catch {
    // The provider still updates when browser storage is unavailable.
  }
}
