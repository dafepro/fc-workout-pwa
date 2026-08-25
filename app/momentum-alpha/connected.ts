import type {
  ActivityDefinition,
  TrainingDashboard,
  TrainingEntry,
  TrainingEntryInput,
} from "../domain/types";
import { plannedActivityTarget } from "../domain/rules";
import type {
  CompletionChoice,
  ExtraActivity,
  Feeling,
  MomentumHistoryEntry,
  MomentumState,
  PlanSelection,
} from "./model";
import { momentumAlphaCopy } from "./content";

export interface MomentumPlanContent {
  dateLabel: string;
  activity: string;
  workload: string;
  instruction: string;
  goal: string;
  stretch: string;
  reasons: string[];
}

export interface MomentumAlternativeContent {
  id: Exclude<PlanSelection, "prescribed">;
  title: string;
  detail: string;
  effect: string;
  goal: string;
  stretch: string;
}

export interface MomentumPresentation {
  plan: MomentumPlanContent;
  alternatives: MomentumAlternativeContent[];
  recovery: { title: string; detail: string };
  extras: { id: ExtraActivity; label: string }[];
}

export interface ConnectedMomentumModel extends MomentumPresentation {
  state: MomentumState;
  teamName: string;
  recentPlanFollowers: number;
  now: Date;
  assignment: TrainingDashboard["currentAssignment"];
  planDay: TrainingDashboard["currentPlanDay"];
  activitiesBySelection: Partial<Record<PlanSelection, ActivityDefinition>>;
  activitiesByExtra: Partial<Record<ExtraActivity, ActivityDefinition>>;
  recoveryActivity: ActivityDefinition | null;
}

const selectionSlots: Exclude<PlanSelection, "prescribed">[] = [
  "ball-control",
  "low-impact",
];
const extraSlots: ExtraActivity[] = ["ball-control", "easy-walk", "mobility"];

export function connectedMomentumModel(
  dashboard: TrainingDashboard,
  entries: TrainingEntry[],
  currentPlayerID: string,
  now: Date,
  plannedRestComplete = false,
): ConnectedMomentumModel {
  const planDay = dashboard.currentPlanDay;
  const assignment = planDay ? null : dashboard.currentAssignment;
  const recommendation = dashboard.todayRecommendation;
  const plannedActivityID =
    planDay && planDay.kind !== "rest"
      ? (planDay.blocks.find((block) => !block.completed) ?? planDay.blocks[0])
          ?.activityDefinitionId
      : (assignment?.activityDefinitionId ??
        recommendation.activityDefinitionId);
  const primaryActivity = plannedActivityID
    ? (dashboard.activities.find(
        (activity) => activity.id === plannedActivityID,
      ) ?? null)
    : assignment
      ? (dashboard.activities.find(
          (activity) => activity.id === assignment.activityDefinitionId,
        ) ?? null)
      : null;
  const playerEntries = entries
    .filter((entry) => entry.playerId === currentPlayerID)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const assignmentEntry = assignment?.completed
    ? [...playerEntries]
        .reverse()
        .find((entry) => entry.assignmentId === assignment.id)
    : undefined;
  const recoveryActivity =
    dashboard.activities.find(
      (activity) => activity.id === "recovery-walk-jog",
    ) ?? null;
  const alternativeActivities = dashboard.activities
    .filter((activity) => activity.id !== primaryActivity?.id)
    .slice(0, selectionSlots.length);
  const activitiesBySelection: ConnectedMomentumModel["activitiesBySelection"] =
    primaryActivity ? { prescribed: primaryActivity } : {};
  const alternatives = alternativeActivities.map((activity, index) => {
    const id = selectionSlots[index];
    activitiesBySelection[id] = activity;
    return alternativeContent(id, activity, activity.defaultValue);
  });
  const extraActivities = dashboard.activities.slice(0, extraSlots.length);
  const activitiesByExtra: ConnectedMomentumModel["activitiesByExtra"] = {};
  const extras = extraActivities.map((activity, index) => {
    const id = extraSlots[index];
    activitiesByExtra[id] = activity;
    return {
      id,
      label: `${activity.name} · ${formatValue(activity.defaultValue, activity.unit)}`,
    };
  });
  const history = playerEntries.map((entry) =>
    historyEntry(entry, dashboard.activities),
  );
  const primaryComplete = Boolean(
    (planDay?.completed ?? assignment?.completed ?? recommendation.completed) ||
      plannedRestComplete,
  );

  return {
    state: {
      version: 1,
      dayKind: planDay
        ? planDay.kind === "rest"
          ? "rest"
          : "training"
        : assignment || recommendation.kind !== "rest"
          ? "training"
          : "rest",
      personalMomentum: Math.min(
        92,
        20 +
          dashboard.summary.currentStreak * 8 +
          Math.min(24, dashboard.summary.rolling30Sessions * 2),
      ),
      teamContribution: dashboard.summary.weeklySessions > 0 ? 1 : 0,
      primaryComplete,
      primaryChoice: assignmentEntry
        ? assignmentEntry.value > (assignment?.targetValue ?? Infinity)
          ? "stretch"
          : "goal"
        : null,
      planSelection: "prescribed",
      feeling: null,
      recoveryComplete: playerEntries.some(
        (entry) => entry.activityId === recoveryActivity?.id,
      ),
      history,
    },
    teamName: dashboard.team.name,
    recentPlanFollowers: dashboard.teamPulse.activeThisWeek,
    now,
    assignment,
    planDay,
    activitiesBySelection,
    activitiesByExtra,
    recoveryActivity,
    plan: planContent(
      planDay,
      assignment,
      recommendation,
      primaryActivity,
      now,
    ),
    alternatives,
    recovery: recoveryActivity
      ? {
          title: recoveryActivity.name,
          detail: momentumAlphaCopy.connected.relaxedPace(
            formatValue(recoveryActivity.defaultValue, recoveryActivity.unit),
          ),
        }
      : {
          title: momentumAlphaCopy.connected.genericRecovery,
          detail: momentumAlphaCopy.connected.genericRecoveryDetail,
        },
    extras,
  };
}

export function momentumCompletionInput(
  model: ConnectedMomentumModel,
  input: {
    choice: CompletionChoice;
    feeling: Feeling;
    planSelection: PlanSelection;
    note?: string;
  },
): TrainingEntryInput {
  const activity = model.activitiesBySelection[input.planSelection];
  if (!activity)
    throw new Error(momentumAlphaCopy.connected.activityUnavailable);
  const planBlock = model.planDay?.blocks.find((block) => !block.completed);
  const target =
    input.planSelection === "prescribed" && model.assignment
      ? model.assignment.targetValue
      : input.planSelection === "prescribed"
        ? plannedActivityTarget(activity, planBlock)
        : activity.defaultValue;
  const value =
    input.choice === "stretch"
      ? steppedValue(target * 1.25, activity.step, activity.max)
      : target;
  const levels = feelingLevels(input.feeling);
  return {
    activityId: activity.id,
    assignmentId:
      input.planSelection === "prescribed" ? model.assignment?.id : undefined,
    plan:
      input.planSelection === "prescribed" && model.planDay && planBlock
        ? {
            planId: model.planDay.planId,
            dayIndex: model.planDay.dayIndex,
            blockIndex: planBlock.blockIndex,
          }
        : undefined,
    occurredAt: model.now.toISOString(),
    value,
    unit: activity.unit,
    inputKind: activity.inputKind,
    note: input.note,
    ...levels,
  };
}

export function momentumRecoveryInput(
  model: ConnectedMomentumModel,
): TrainingEntryInput {
  const activity = model.recoveryActivity;
  if (!activity)
    throw new Error(momentumAlphaCopy.connected.recoveryUnavailable);
  return activityInput(activity, model.now, 2, 1);
}

export function momentumExtraInput(
  model: ConnectedMomentumModel,
  extra: ExtraActivity,
): TrainingEntryInput {
  const activity = model.activitiesByExtra[extra];
  if (!activity)
    throw new Error(momentumAlphaCopy.connected.activityUnavailable);
  return activityInput(activity, model.now, 3, 2);
}

function planContent(
  planDay: TrainingDashboard["currentPlanDay"],
  assignment: TrainingDashboard["currentAssignment"],
  recommendation: TrainingDashboard["todayRecommendation"],
  activity: ActivityDefinition | null,
  now: Date,
): MomentumPlanContent {
  if (planDay?.kind === "rest") {
    return {
      dateLabel: dateLabel(now),
      activity: momentumAlphaCopy.connected.restActivity,
      workload: momentumAlphaCopy.connected.restWorkload,
      instruction: momentumAlphaCopy.connected.restInstruction,
      goal: momentumAlphaCopy.connected.restGoal,
      stretch: momentumAlphaCopy.connected.restStretch,
      reasons: [
        momentumAlphaCopy.connected.recommendationReasons[
          recommendation.explanationKey
        ],
      ],
    };
  }
  if (planDay) {
    const plannedBlock =
      planDay.blocks.find((block) => !block.completed) ?? planDay.blocks[0];
    const activityName =
      activity?.name ?? plannedBlock?.label ?? planDay.templateName;
    const target = activity
      ? plannedActivityTarget(activity, plannedBlock)
      : null;
    return {
      dateLabel: dateLabel(now),
      activity: activityName,
      workload: `${planDay.durationMinutes} min · ${capitalize(planDay.intensity)}`,
      instruction:
        activity?.instructions[0] ??
        activity?.description ??
        momentumAlphaCopy.connected.unavailableActivityInstruction,
      goal:
        activity && target !== null
          ? `Goal · ${formatValue(target, activity.unit)}`
          : momentumAlphaCopy.connected.unavailableActivityGoal,
      stretch:
        activity && target !== null
          ? `Stretch · ${formatValue(steppedValue(target * 1.25, activity.step, activity.max), activity.unit)}`
          : momentumAlphaCopy.connected.unavailableActivityStretch,
      reasons: [
        momentumAlphaCopy.connected.recommendationReasons[
          recommendation.explanationKey
        ],
      ],
    };
  }
  if (!assignment && recommendation.source === "suggestion" && activity) {
    const target = recommendation.targetValue ?? activity.defaultValue;
    const workloadValue =
      recommendation.durationMinutes > 0
        ? `${recommendation.durationMinutes} min`
        : formatValue(target, recommendation.targetUnit ?? activity.unit);
    return {
      dateLabel: dateLabel(now),
      activity: activity.name,
      workload: `${workloadValue} · ${capitalize(recommendation.intensity)}`,
      instruction: activity.instructions[0] ?? activity.description,
      goal: `Goal · ${formatValue(target, recommendation.targetUnit ?? activity.unit)}`,
      stretch: momentumAlphaCopy.connected.unavailableActivityStretch,
      reasons: [
        momentumAlphaCopy.connected.recommendationReasons[
          recommendation.explanationKey
        ],
      ],
    };
  }
  if (!assignment || !activity) {
    return {
      dateLabel: dateLabel(now),
      activity: momentumAlphaCopy.connected.restActivity,
      workload: momentumAlphaCopy.connected.restWorkload,
      instruction: momentumAlphaCopy.connected.restInstruction,
      goal: momentumAlphaCopy.connected.restGoal,
      stretch: momentumAlphaCopy.connected.restStretch,
      reasons: [...momentumAlphaCopy.connected.restReasons],
    };
  }
  const stretch = steppedValue(
    assignment.targetValue * 1.25,
    activity.step,
    activity.max,
  );
  return {
    dateLabel: dateLabel(now),
    activity: activity.name,
    workload:
      activity.id === "recovery-walk-jog"
        ? momentumAlphaCopy.connected.recoveryWorkload
        : momentumAlphaCopy.connected.assignedWorkload,
    instruction: activity.instructions[0] ?? activity.description,
    goal: `Goal · ${formatValue(assignment.targetValue, assignment.targetUnit)}`,
    stretch: `Stretch · ${formatValue(stretch, assignment.targetUnit)}`,
    reasons: [
      momentumAlphaCopy.connected.recommendationReasons[
        recommendation.explanationKey
      ],
    ],
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function alternativeContent(
  id: Exclude<PlanSelection, "prescribed">,
  activity: ActivityDefinition,
  target: number,
): MomentumAlternativeContent {
  const stretch = steppedValue(target * 1.25, activity.step, activity.max);
  return {
    id,
    title: activity.name,
    detail: momentumAlphaCopy.connected.approvedAlternative(
      formatValue(target, activity.unit),
    ),
    effect: momentumAlphaCopy.connected.savedSessionEffect,
    goal: `Goal · ${formatValue(target, activity.unit)}`,
    stretch: `Stretch · ${formatValue(stretch, activity.unit)}`,
  };
}

function historyEntry(
  entry: TrainingEntry,
  activities: ActivityDefinition[],
): MomentumHistoryEntry {
  const activity = activities.find((item) => item.id === entry.activityId);
  const recovery = entry.activityId === "recovery-walk-jog";
  return {
    id: entry.id,
    title: activity?.name ?? momentumAlphaCopy.connected.savedActivity,
    detail: formatValue(entry.value, entry.unit),
    kind: recovery ? "recovery" : "primary",
    momentumEffect: recovery ? "supportive" : "full",
  };
}

function activityInput(
  activity: ActivityDefinition,
  now: Date,
  effortLevel: number,
  exhaustionLevel: number,
): TrainingEntryInput {
  return {
    activityId: activity.id,
    occurredAt: now.toISOString(),
    value: activity.defaultValue,
    unit: activity.unit,
    inputKind: activity.inputKind,
    effortLevel,
    exhaustionLevel,
  };
}

function feelingLevels(
  feeling: Feeling,
): Pick<TrainingEntryInput, "effortLevel" | "exhaustionLevel"> {
  if (feeling === "good") return { effortLevel: 4, exhaustionLevel: 2 };
  if (feeling === "tired") return { effortLevel: 3, exhaustionLevel: 4 };
  return { effortLevel: 2, exhaustionLevel: 5 };
}

function steppedValue(value: number, step: number, max: number): number {
  return Math.min(max, Math.ceil(value / step) * step);
}

function dateLabel(now: Date): string {
  return `Today · ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(now)}`;
}

function formatValue(value: number, unit: string): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${unit}`;
}
