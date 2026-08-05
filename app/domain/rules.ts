import type {
  ActivityDefinition,
  SocialEntryProjection,
  TrainingEntry,
} from "./types";

export const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const BACKDATE_DAYS = 7;

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function isBackdateAllowed(
  dateValue: string,
  now = new Date(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;
  const [year, month, day] = dateValue.split("-").map(Number);
  const selected = new Date(year, month - 1, day);
  if (
    selected.getFullYear() !== year ||
    selected.getMonth() !== month - 1 ||
    selected.getDate() !== day
  ) {
    return false;
  }
  const today = startOfLocalDay(now).getTime();
  const selectedTime = startOfLocalDay(selected).getTime();
  const earliest = today - BACKDATE_DAYS * 24 * 60 * 60 * 1000;
  return selectedTime >= earliest && selectedTime <= today;
}

export function canDeleteEntry(
  entry: Pick<TrainingEntry, "playerId" | "deleteEligibleUntil">,
  actorPlayerId: string,
  now = new Date(),
): boolean {
  return (
    entry.playerId === actorPlayerId &&
    now.getTime() < new Date(entry.deleteEligibleUntil).getTime()
  );
}

export function createDeleteDeadline(createdAt: Date): string {
  return new Date(createdAt.getTime() + DELETE_WINDOW_MS).toISOString();
}

export function effortPoints(
  entry: Pick<TrainingEntry, "effortLevel">,
): number {
  return Math.min(100, 30 + entry.effortLevel * 10);
}

export function toSocialEntry(entry: TrainingEntry): SocialEntryProjection {
  return {
    id: entry.id,
    playerId: entry.playerId,
    activityId: entry.activityId,
    occurredAt: entry.occurredAt,
    effortPoints: effortPoints(entry),
  };
}

export function getActivityInput(
  definitions: ActivityDefinition[],
  activityId: string,
): ActivityDefinition | undefined {
  return definitions.find((activity) => activity.id === activityId);
}

export function entriesWithinDays(
  entries: TrainingEntry[],
  days: number,
  now = new Date(),
): TrainingEntry[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return entries.filter((entry) => {
    const time = new Date(entry.occurredAt).getTime();
    return time >= cutoff && time <= now.getTime();
  });
}

export function currentStreak(
  entries: TrainingEntry[],
  now = new Date(),
): number {
  const uniqueDays = new Set(
    entries.map((entry) => entry.occurredAt.slice(0, 10)),
  );
  let streak = 0;
  const cursor = startOfLocalDay(now);
  if (!uniqueDays.has(toDateInput(cursor)))
    cursor.setDate(cursor.getDate() - 1);
  while (uniqueDays.has(toDateInput(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function toDateInput(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function earliestAllowedDate(now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() - BACKDATE_DAYS);
  return toDateInput(date);
}
