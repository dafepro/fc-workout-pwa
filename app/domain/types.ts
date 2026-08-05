export type ActivityId =
  | "hill-sprints"
  | "timed-run-walk"
  | "distance-run"
  | "recovery-walk-jog";

export type InputKind = "repetitions" | "duration" | "distance";

export interface ActivityDefinition {
  id: ActivityId;
  name: string;
  shortName: string;
  icon: string;
  inputKind: InputKind;
  unit: "reps" | "minutes" | "miles";
  min: number;
  max: number;
  step: number;
  fieldLabel: string;
  description: string;
}

export interface TrainingEntry {
  id: string;
  playerId: string;
  activityId: ActivityId;
  occurredAt: string;
  value: number;
  unit: string;
  effortLevel: number;
  exhaustionLevel: number;
  createdAt: string;
  deleteEligibleUntil: string;
}

export interface ActivityDay {
  date: string;
  activityCount: number;
  effortPoints: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface Player {
  id: string;
  firstName: string;
  lastInitial: string;
  avatarColor: string;
  initials: string;
  weeklySessions: number;
  effortPoints: number;
  currentStreak: number;
  consistency: number;
}

export type ReactionType =
  | "clap"
  | "fire"
  | "strong"
  | "hustle"
  | "runner"
  | "wind"
  | "robot-leg"
  | "do-it";

export interface Reaction {
  id: string;
  senderPlayerId: string;
  targetPlayerId: string;
  type: ReactionType;
  createdAt: string;
}

export type ReactionPeriod = "weekly" | "thirty_days" | "season";
export type ReactionMetric = "effort" | "streaks" | "consistency";

export type ReactionContext =
  | {
      type: "team_progress";
      teamId: string;
      period: "weekly";
    }
  | {
      type: "leaderboard";
      teamId: string;
      period: ReactionPeriod;
      metric: ReactionMetric;
    };

export interface ReactionBadge {
  id: string;
  sender: {
    id: string;
    displayName: string;
  };
  reactionType: ReactionType;
  emoji: string;
  message: string;
  context: ReactionContext;
  createdAt: string;
  readAt: string | null;
}

export interface SendReactionResult {
  id: string;
  remainingForRecipientToday: number;
}

export interface SocialEntryProjection {
  id: string;
  playerId: string;
  activityId: ActivityId;
  occurredAt: string;
  effortPoints: number;
}
