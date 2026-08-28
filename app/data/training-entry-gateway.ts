import { createDeleteDeadline } from "../domain/rules";
import type {
  ActivityId,
  CompletionOutcome,
  TrainingEntry,
  TrainingEntryInput,
  TrainingPlanProvenance,
} from "../domain/types";
import { CURRENT_PLAYER_ID, initialEntries } from "./mockData";

export interface TrainingEntryGateway {
  list(): Promise<TrainingEntry[]>;
  get(entryID: string): Promise<TrainingEntry | null>;
  create(input: TrainingEntryInput): Promise<TrainingEntry>;
  delete(entryID: string): Promise<void>;
}

export class TrainingEntryGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface APITrainingEntry {
  id: string;
  playerId: string;
  teamId: string;
  activityDefinitionId: ActivityId;
  assignmentId: string | null;
  plan: TrainingPlanProvenance | null;
  occurredAt: string;
  result: {
    kind: "repetitions" | "duration" | "distance";
    value: number;
    unit: string;
  };
  effortLevel: number;
  exhaustionLevel: number;
  completionOutcome?: CompletionOutcome;
  createdAt: string;
  deleteEligibleUntil: string;
}

const LOCAL_ENTRIES_KEY = "zoomigo-milestone-1";

class HTTPTrainingEntryGateway implements TrainingEntryGateway {
  constructor(private readonly teamID: string) {}

  async list(): Promise<TrainingEntry[]> {
    const response = await this.request("/v1/me/training-entries");
    const body = (await response.json()) as { items: APITrainingEntry[] };
    return body.items.map(fromAPIEntry);
  }

  async get(entryID: string): Promise<TrainingEntry | null> {
    const response = await fetch(
      `/api/zoomigo/v1/training-entries/${encodeURIComponent(entryID)}`,
    );
    if (response.status === 404) return null;
    await throwForError(response);
    return fromAPIEntry((await response.json()) as APITrainingEntry);
  }

  async create(input: TrainingEntryInput): Promise<TrainingEntry> {
    const response = await fetch("/api/zoomigo/v1/me/training-entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        teamId: this.teamID,
        activityDefinitionId: input.activityId,
        assignmentId: input.assignmentId,
        plan: input.plan,
        occurredAt: input.occurredAt,
        result: {
          kind: input.inputKind,
          value: input.value,
          unit: input.unit,
        },
        effortLevel: input.effortLevel,
        exhaustionLevel: input.exhaustionLevel,
        completionOutcome: input.completionOutcome,
      }),
    });
    await throwForError(response);
    return fromAPIEntry((await response.json()) as APITrainingEntry);
  }

  async delete(entryID: string): Promise<void> {
    const response = await fetch(
      `/api/zoomigo/v1/training-entries/${encodeURIComponent(entryID)}`,
      {
        method: "DELETE",
      },
    );
    await throwForError(response);
  }

  private async request(path: string): Promise<Response> {
    const response = await fetch(`/api/zoomigo${path}`);
    await throwForError(response);
    return response;
  }
}

class LocalTrainingEntryGateway implements TrainingEntryGateway {
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

export function createTrainingEntryGateway(
  connected = false,
  teamID = "team-hill-striders",
): TrainingEntryGateway {
  return connected
    ? new HTTPTrainingEntryGateway(teamID)
    : new LocalTrainingEntryGateway();
}

async function throwForError(response: Response): Promise<void> {
  if (response.ok) return;
  let code = "training_entry_failed";
  let message = "That session could not be saved.";
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // The safe fallback is used when an intermediary returns a non-JSON error.
  }
  throw new TrainingEntryGatewayError(code, message);
}

function fromAPIEntry(entry: APITrainingEntry): TrainingEntry {
  return {
    id: entry.id,
    playerId: entry.playerId,
    activityId: entry.activityDefinitionId,
    occurredAt: entry.occurredAt,
    value: entry.result.value,
    unit: entry.result.unit,
    effortLevel: entry.effortLevel,
    exhaustionLevel: entry.exhaustionLevel,
    completionOutcome: entry.completionOutcome,
    createdAt: entry.createdAt,
    deleteEligibleUntil: entry.deleteEligibleUntil,
    assignmentId: entry.assignmentId ?? undefined,
    plan: entry.plan ?? undefined,
  };
}

function readLocalEntries(): TrainingEntry[] {
  try {
    const stored = window.localStorage.getItem(LOCAL_ENTRIES_KEY);
    if (!stored) return initialEntries;
    const parsed = JSON.parse(stored) as {
      entries?: TrainingEntry[];
    };
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
    // The in-memory provider still updates when browser storage is unavailable.
  }
}
