import Link from "next/link";
import type {
  CurrentTrainingPlanDay,
  TrainingPlanWindow,
} from "../../domain/types";
import { playerExperienceCopy } from "../content";

export function PlanWeekStrip({ plan }: { plan: TrainingPlanWindow }) {
  const copy = playerExperienceCopy.focusedToday;

  return (
    <section className="plan-week-strip" aria-label={copy.weekTitle}>
      <div className="plan-week-strip__heading">
        <div>
          <p className="player-eyebrow">{copy.weekTitle}</p>
          <strong>{plan.templateName}</strong>
        </div>
        <span>{copy.planDay(plan.dayNumber, plan.dayCount)}</span>
      </div>
      <ol aria-label="Plan days">
        {plan.days.map((day) => (
          <WeekDay
            key={day.dayIndex}
            day={day}
            todayIndex={plan.today.dayIndex}
          />
        ))}
      </ol>
      <Link className="plan-week-strip__link" href="/plan">
        {copy.fullPlan} <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

function WeekDay({
  day,
  todayIndex,
}: {
  day: CurrentTrainingPlanDay;
  todayIndex: number;
}) {
  const copy = playerExperienceCopy.focusedToday;
  const relation = day.dayIndex - todayIndex;
  const status =
    relation === 0
      ? copy.todayStatus
      : relation > 0
        ? copy.locked
        : day.completed
          ? copy.completed
          : day.kind === "rest"
            ? copy.plannedRest
            : copy.missed;
  const className =
    relation === 0
      ? "is-today"
      : relation > 0
        ? "is-locked"
        : day.completed
          ? "is-complete"
          : day.kind === "rest"
            ? "is-rest"
            : "is-missed";
  const weekday = formatWeekday(day.occursOn, "short");

  return (
    <li
      className={className}
      aria-label={relation > 0 ? `Locked ${weekday}` : undefined}
    >
      <small>{weekday}</small>
      <span aria-hidden="true">
        {relation === 0
          ? "●"
          : relation > 0
            ? "◆"
            : day.completed
              ? "✓"
              : day.kind === "rest"
                ? "–"
                : "×"}
      </span>
      <strong>{status}</strong>
    </li>
  );
}

export function formatWeekday(date: string, length: "short" | "long") {
  return new Intl.DateTimeFormat("en-US", {
    weekday: length,
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
