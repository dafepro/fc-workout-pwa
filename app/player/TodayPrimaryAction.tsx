import Link from "next/link";
import type {
  ActivityDefinition,
  CurrentTrainingPlanDay,
  TrainingAssignment,
  TrainingPlanWindow,
} from "../domain/types";
import { copy } from "../content/copy";
import { TodayPlanHero } from "./TodayPlanHero";

export function TodayPrimaryAction({
  day,
  plan,
  assignment,
  activities,
  onRecordRest,
  celebrating = false,
  teamName = "your team",
}: {
  day: CurrentTrainingPlanDay | null;
  plan: TrainingPlanWindow | null;
  assignment: TrainingAssignment | null;
  activities: ActivityDefinition[];
  onRecordRest(planID: string, dayIndex: number): Promise<void>;
  celebrating?: boolean;
  teamName?: string;
}) {
  const nextPlanBlock = day?.blocks.find(({ completed }) => !completed);
  const planIsActionable =
    day?.kind === "rest" ||
    Boolean(
      nextPlanBlock &&
        activities.some(({ id }) => id === nextPlanBlock.activityDefinitionId),
    );
  const planOwnsToday = Boolean(day && plan);
  if (day && plan && !day.completed && planIsActionable) {
    return (
      <TodayPlanHero
        day={day}
        dayNumber={plan.dayNumber}
        dayCount={plan.dayCount}
        activities={activities}
        onRecordRest={onRecordRest}
        celebrating={celebrating}
      />
    );
  }

  const assignmentActivity = activities.find(
    ({ id }) => id === assignment?.activityDefinitionId,
  );
  const hasAssignment = Boolean(
    !planOwnsToday && assignment && !assignment.completed,
  );

  if (
    (planOwnsToday && day?.completed) ||
    (!planOwnsToday && assignment?.completed)
  ) {
    return (
      <section
        className={`today-completion${celebrating ? " is-celebrating" : ""}`}
        aria-labelledby="today-action-title"
        aria-live="polite"
      >
        <span className="today-completion__mark" aria-hidden="true">
          ✓
        </span>
        <div className="today-completion__body">
          <small>{copy.completion.eyebrow}</small>
          <h1 id="today-action-title">{copy.completion.title}</h1>
          <p className="today-completion__detail" aria-hidden={!celebrating}>
            {copy.completion.teamContribution(teamName)}
          </p>
        </div>
        <Link
          className="today-completion__action"
          href="/team"
          aria-label={copy.completion.action}
        >
          {copy.completion.compactAction} <span aria-hidden="true">→</span>
        </Link>
      </section>
    );
  }

  return (
    <section className="today-plan-hero" aria-labelledby="today-action-title">
      <header className="today-plan-hero__header">
        <div>
          <span className="today-plan-hero__today">Today</span>
          <small>{hasAssignment ? "Team workout" : "Your training"}</small>
        </div>
      </header>
      <h1 id="today-action-title">
        {hasAssignment
          ? (assignmentActivity?.name ?? "Record a workout")
          : "Record a workout"}
      </h1>
      {hasAssignment && assignment ? (
        <div className="today-plan-hero__metadata">
          <span>
            {assignment.targetValue} {assignment.targetUnit}
          </span>
          <span>Due {assignment.dueOn}</span>
        </div>
      ) : (
        <p className="today-plan-hero__fallback">
          Choose one of your team’s approved activities.
        </p>
      )}
      <Link className="today-plan-hero__primary" href="/log">
        {hasAssignment ? "Record this workout" : "Choose a workout"}
        <span aria-hidden="true"> →</span>
      </Link>
    </section>
  );
}
