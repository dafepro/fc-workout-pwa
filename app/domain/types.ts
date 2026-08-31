import type { AvatarConfiguration } from "../avatar/types";

export type ActivityId =
  | "hill-sprints"
  | "timed-run-walk"
  | "distance-run"
  | "recovery-walk-jog";

export type InputKind = "repetitions" | "duration" | "distance";
export type CompletionOutcome = "as_listed" | "partial" | "extra";

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
  defaultValue: number;
  fieldLabel: string;
  description: string;
  /** What one unit of this activity is, where the number alone does not say it. */
  qualifier?: string;
  instructions: readonly string[];
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
  completionOutcome?: CompletionOutcome;
  createdAt: string;
  deleteEligibleUntil: string;
  assignmentId?: string;
  plan?: TrainingPlanProvenance;
}

export interface TrainingPlanProvenance {
  planId: string;
  dayIndex: number;
  blockIndex: number;
}

export type TrainingEntryInput = Pick<
  TrainingEntry,
  | "activityId"
  | "occurredAt"
  | "value"
  | "unit"
  | "effortLevel"
  | "exhaustionLevel"
> & {
  inputKind: InputKind;
  assignmentId?: string;
  plan?: TrainingPlanProvenance;
  completionOutcome: CompletionOutcome;
};

export interface ActivityDay {
  date: string;
  activityCount: number;
  effortPoints: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface TrainingAssignment {
  id: string;
  activityDefinitionId: ActivityId;
  /** Opaque: the catalog is seeded data a migration extends, not a closed set
   * the client gets to know. Pinning a literal here once made the product look
   * like it had exactly one workout. */
  catalogKey: string;
  targetValue: number;
  targetUnit: ActivityDefinition["unit"];
  startsOn: string;
  dueOn: string;
  completed: boolean;
}

export interface CurrentTrainingPlanDay {
  planId: string;
  dayIndex: number;
  templateName: string;
  occursOn: string;
  kind: "training" | "recovery" | "rest";
  focus: "speed" | "endurance" | "recovery";
  durationMinutes: number;
  intensity: "easy" | "steady" | "hard";
  completed: boolean;
  blocks: {
    blockIndex: number;
    activityDefinitionId: ActivityId;
    label: string;
    durationMinutes: number;
    completed: boolean;
  }[];
}

export interface TrainingPlanWindow {
  planId: string;
  templateName: string;
  dayNumber: number;
  dayCount: number;
  yesterday: CurrentTrainingPlanDay | null;
  today: CurrentTrainingPlanDay;
  tomorrow: CurrentTrainingPlanDay | null;
  days: CurrentTrainingPlanDay[];
}

export interface TrainingDashboard {
  team: SocialTeam;
  activities: ActivityDefinition[];
  currentAssignment: TrainingAssignment | null;
  currentPlanDay: CurrentTrainingPlanDay | null;
  currentPlan: TrainingPlanWindow | null;
  summary: {
    weeklySessions: number;
    weeklyMomentumCredits: number;
    rolling30Sessions: number;
    momentumScore: number;
    currentCheckInStreak: number;
    currentStreak: number;
    longestStreak: number;
    effortPoints: number;
    activityDays: ActivityDay[];
  };
  teamPulse: {
    activeThisWeek: number;
    unlocked: boolean;
    recentActivities: TeamPulseActivity[];
  };
  streakComparison: {
    templateKey: string;
    value: string;
    message: string;
  };
}

export interface TeamPulseActivity {
  playerId: string;
  firstName: string;
  lastInitial: string;
  activityName: string;
  recency: "Today" | "Yesterday" | "Recently";
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
  avatarConfiguration?: AvatarConfiguration;
}

export interface SocialTeam {
  id: string;
  name: string;
  weeklyGoal: number;
}

export type TeamGoalStatus = "completed" | "one_away" | "keep_going";

export interface TeamMemberProjection extends Player {
  consistencyDays: number;
  goalStatus: TeamGoalStatus;
  challengeCompleted: boolean;
}

export interface TeamChallengeProjection {
  id: string;
  activityDefinitionId: ActivityId;
  activityName: string;
  targetValue: number;
  targetUnit: ActivityDefinition["unit"];
  startsOn: string;
  dueOn: string;
  completedCount: number;
}

export interface TeamActivityProjection {
  team: SocialTeam;
  weekStart: string;
  weekEnd: string;
  teamSessions: number;
  membersMeetingGoal: number;
  currentChallenge: TeamChallengeProjection | null;
  members: TeamMemberProjection[];
}

export type TeamHubSignalKind =
  | "active_today"
  | "active_this_week"
  | "challenge_complete"
  | "weekly_goal_complete";

export interface TeamHubFocus {
  kind: "reward" | "challenge";
  id: string;
  title: string;
  description?: string;
  mediaId?: string;
  imageUrl?: string;
  current: number;
  target: number;
  unit: "team_days" | "teammates";
  endsOn?: string;
  dueOn?: string;
}

export interface TeamHubActivity {
  player: Player;
  signals: { kind: TeamHubSignalKind }[];
  reactionContext?: ReactionContext;
}

export interface TeamHubProjection {
  team: {
    id: string;
    name: string;
    weekStart: string;
    weekEnd: string;
  };
  access: {
    activityUnlocked: boolean;
    loungeUnlocked: boolean;
  };
  focus: TeamHubFocus[];
  activitySummary: { activeThisWeek: number };
  activity: TeamHubActivity[];
  lounge: {
    themeId: "beach-boardwalk";
    title: string;
  };
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

export type ReactionContext =
  | {
      type: "team_progress";
      teamId: string;
      period: "weekly";
    }
  | {
      type: "challenge";
      teamId: string;
      assignmentId: string;
      activityName?: string;
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

export interface ReactionBadgePage {
  items: ReactionBadge[];
  nextCursor: string | null;
}

export interface SendReactionResult {
  id: string;
  remainingForRecipientWindow: number;
}

export interface SocialEntryProjection {
  id: string;
  playerId: string;
  activityId: ActivityId;
  occurredAt: string;
  effortPoints: number;
}
