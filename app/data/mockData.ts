import type {
  ActivityDefinition,
  Player,
  TeamPulseActivity,
  TrainingEntry,
} from "../domain/types";
import { createDeleteDeadline } from "../domain/rules";
import { activityPresentation } from "../content/activities";

export const CURRENT_PLAYER_ID = "mason";
export const TEAM_NAME = "Hill Striders U12";
export const WEEKLY_GOAL = 3;

export const activities: ActivityDefinition[] = [
  {
    id: "hill-sprints",
    name: "Hill Sprints",
    inputKind: "repetitions",
    unit: "reps",
    min: 1,
    max: 20,
    step: 1,
    defaultValue: 8,
    ...activityPresentation["hill-sprints"],
  },
  {
    id: "timed-run-walk",
    name: "Timed Run / Walk",
    inputKind: "duration",
    unit: "minutes",
    min: 1,
    max: 90,
    step: 1,
    defaultValue: 20,
    ...activityPresentation["timed-run-walk"],
  },
  {
    id: "distance-run",
    name: "Distance Run",
    inputKind: "distance",
    unit: "miles",
    min: 0.25,
    max: 10,
    step: 0.25,
    defaultValue: 1,
    ...activityPresentation["distance-run"],
  },
  {
    id: "recovery-walk-jog",
    name: "Recovery Walk / Jog",
    inputKind: "duration",
    unit: "minutes",
    min: 1,
    max: 90,
    step: 1,
    defaultValue: 20,
    ...activityPresentation["recovery-walk-jog"],
  },
];

export const players: Player[] = [
  {
    id: "mason",
    firstName: "Mason",
    lastInitial: "C.",
    initials: "MC",
    avatarColor: "#c7f23a",
    weeklySessions: 2,
    effortPoints: 520,
    currentStreak: 5,
    consistency: 5,
  },
  {
    id: "ava",
    firstName: "Ava",
    lastInitial: "R.",
    initials: "AR",
    avatarColor: "#7be3d2",
    weeklySessions: 3,
    effortPoints: 610,
    currentStreak: 6,
    consistency: 5,
  },
  {
    id: "ethan",
    firstName: "Ethan",
    lastInitial: "M.",
    initials: "EM",
    avatarColor: "#ffca63",
    weeklySessions: 3,
    effortPoints: 590,
    currentStreak: 4,
    consistency: 4,
  },
  {
    id: "liam",
    firstName: "Liam",
    lastInitial: "J.",
    initials: "LJ",
    avatarColor: "#a9b7ff",
    weeklySessions: 2,
    effortPoints: 480,
    currentStreak: 3,
    consistency: 4,
  },
  {
    id: "noah",
    firstName: "Noah",
    lastInitial: "K.",
    initials: "NK",
    avatarColor: "#ff8f79",
    weeklySessions: 2,
    effortPoints: 460,
    currentStreak: 4,
    consistency: 3,
  },
  {
    id: "zoe",
    firstName: "Zoe",
    lastInitial: "T.",
    initials: "ZT",
    avatarColor: "#c99cff",
    weeklySessions: 1,
    effortPoints: 390,
    currentStreak: 2,
    consistency: 3,
  },
  {
    id: "jayden",
    firstName: "Jayden",
    lastInitial: "B.",
    initials: "JB",
    avatarColor: "#66d0ff",
    weeklySessions: 1,
    effortPoints: 360,
    currentStreak: 2,
    consistency: 3,
  },
  {
    id: "lucas",
    firstName: "Lucas",
    lastInitial: "A.",
    initials: "LA",
    avatarColor: "#ffd76e",
    weeklySessions: 1,
    effortPoints: 340,
    currentStreak: 1,
    consistency: 2,
  },
  {
    id: "isabella",
    firstName: "Isabella",
    lastInitial: "M.",
    initials: "IM",
    avatarColor: "#f39ed5",
    weeklySessions: 3,
    effortPoints: 550,
    currentStreak: 5,
    consistency: 4,
  },
  {
    id: "mia",
    firstName: "Mia",
    lastInitial: "S.",
    initials: "MS",
    avatarColor: "#8fe38d",
    weeklySessions: 3,
    effortPoints: 530,
    currentStreak: 3,
    consistency: 5,
  },
  {
    id: "caleb",
    firstName: "Caleb",
    lastInitial: "D.",
    initials: "CD",
    avatarColor: "#efad77",
    weeklySessions: 2,
    effortPoints: 440,
    currentStreak: 2,
    consistency: 3,
  },
  {
    id: "sophia",
    firstName: "Sophia",
    lastInitial: "P.",
    initials: "SP",
    avatarColor: "#8bd6ca",
    weeklySessions: 3,
    effortPoints: 570,
    currentStreak: 4,
    consistency: 4,
  },
];

export const recentTeamActivities: TeamPulseActivity[] = [
  pulseActivity(1, 0, "Today"),
  pulseActivity(3, 1, "Today"),
  pulseActivity(5, 3, "Yesterday"),
  pulseActivity(9, 1, "Recently"),
  pulseActivity(4, 2, "Recently"),
];

function pulseActivity(
  playerIndex: number,
  activityIndex: number,
  recency: TeamPulseActivity["recency"],
): TeamPulseActivity {
  const player = players[playerIndex];
  const activity = activities[activityIndex];
  return {
    playerId: player.id,
    firstName: player.firstName,
    lastInitial: player.lastInitial.replace(/\.$/, ""),
    activityName: activity.name,
    recency,
  };
}

function isoDaysAgo(days: number, hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 15, 0, 0);
  return date.toISOString();
}

function mockEntry(
  id: string,
  daysAgo: number,
  activityId: TrainingEntry["activityId"],
  value: number,
  unit: string,
  effortLevel: number,
  exhaustionLevel: number,
): TrainingEntry {
  const occurredAt = isoDaysAgo(daysAgo, 17);
  const createdAt = new Date(occurredAt);
  return {
    id,
    playerId: CURRENT_PLAYER_ID,
    activityId,
    occurredAt,
    value,
    unit,
    effortLevel,
    exhaustionLevel,
    createdAt: createdAt.toISOString(),
    deleteEligibleUntil: createDeleteDeadline(createdAt),
  };
}

export const initialEntries: TrainingEntry[] = [
  mockEntry("mock-1", 1, "hill-sprints", 8, "reps", 4, 4),
  mockEntry("mock-2", 3, "recovery-walk-jog", 20, "minutes", 3, 2),
  mockEntry("mock-3", 8, "timed-run-walk", 18, "minutes", 5, 5),
  mockEntry("mock-4", 12, "distance-run", 1.5, "miles", 4, 4),
  mockEntry("mock-5", 18, "hill-sprints", 8, "reps", 5, 5),
  mockEntry("mock-6", 25, "recovery-walk-jog", 22, "minutes", 2, 2),
];
