export type PlanDayKind = "training" | "recovery" | "rest";
export type PlanIntensity = "easy" | "steady" | "hard";
export type PlanFocus = "speed" | "endurance" | "recovery";

export interface TrainingPlanBlock {
  activityDefinitionId: string;
  label: string;
  durationMinutes: number;
}

export interface TrainingPlanDay {
  offset: number;
  kind: PlanDayKind;
  focus: PlanFocus;
  durationMinutes: number;
  intensity: PlanIntensity;
  blocks: readonly TrainingPlanBlock[];
}

export interface TrainingPlanTemplate {
  id: string;
  version: number;
  name: string;
  summary: string;
  days: readonly TrainingPlanDay[];
}

export interface PublishedTrainingPlanDay {
  index: number;
  occursOn: string;
  kind: PlanDayKind;
  focus: PlanFocus;
  durationMinutes: number;
  intensity: PlanIntensity;
  blocks: readonly TrainingPlanBlock[];
}

export interface TrainingPlan {
  id: string;
  teamId: string;
  templateId: string;
  templateVersion: number;
  templateName: string;
  templateSummary: string;
  startsOn: string;
  endsOn: string;
  status: "published" | "cancelled";
  createdAt: string;
  cancelledAt?: string;
  replacesPlanId?: string;
  replacedByPlanId?: string;
  days: readonly PublishedTrainingPlanDay[];
}

export function editablePlanDays(
  days: readonly TrainingPlanDay[] | readonly PublishedTrainingPlanDay[],
): TrainingPlanDay[] {
  return days.map((day, offset) => ({
    offset,
    kind: day.kind,
    focus: day.focus,
    durationMinutes: day.durationMinutes,
    intensity: day.intensity,
    blocks: (day.blocks ?? []).map((block) => ({
      activityDefinitionId: block.activityDefinitionId,
      label: block.label,
      durationMinutes: block.durationMinutes,
    })),
  }));
}

export interface DatedTrainingPlanDay extends TrainingPlanDay {
  date: string;
  dayLabel: string;
}

export function buildDatedPlan(
  template: TrainingPlanTemplate,
  startsOn: string,
): DatedTrainingPlanDay[] {
  const start = parseCalendarDate(startsOn);
  return template.days.map((day) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + day.offset);
    return {
      ...day,
      date: date.toISOString().slice(0, 10),
      dayLabel: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(date),
    };
  });
}

function parseCalendarDate(value: string): Date {
  const parts = value.split("-").map(Number);
  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isInteger(part)) ||
    parts[0] < 1 ||
    parts[1] < 1 ||
    parts[1] > 12 ||
    parts[2] < 1 ||
    parts[2] > 31
  ) {
    throw new Error("Plan start date is invalid.");
  }
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
}
