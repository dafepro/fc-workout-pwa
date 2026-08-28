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
  const hasAssignment = Boolean(assignment && !assignment.completed);

  if (assignment?.completed || (day?.completed && !hasAssignment)) {
    const completedActivity = assignmentActivity?.name;
    return (
      <section
        className={`today-plan-hero today-plan-hero--complete${celebrating ? " is-celebrating" : ""}`}
        aria-labelledby="today-action-title"
        aria-live="polite"
      >
        <header className="today-plan-hero__header">
          <div>
            <span className="today-plan-hero__today">Today</span>
            <small>{copy.completion.eyebrow}</small>
          </div>
          <span className="today-plan-hero__complete-mark" aria-hidden="true">
            ✓
          </span>
        </header>
        <h1 id="today-action-title">{copy.completion.title}</h1>
        {completedActivity ? (
          <p className="today-plan-hero__goal">
            {copy.completion.activity(completedActivity)}
          </p>
        ) : null}
        <p className="today-plan-hero__fallback">
          {copy.completion.teamContribution(teamName)}
        </p>
        <Link className="today-plan-hero__primary" href="/team">
          {copy.completion.action} <span aria-hidden="true">→</span>
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
