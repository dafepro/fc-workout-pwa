import type {
  CurrentTrainingPlanDay,
  TrainingPlanWindow,
} from "../domain/types";

export function PlanWeekStrip({ plan }: { plan: TrainingPlanWindow }) {
  return (
    <section
      className="card plan-week-strip"
      aria-label={`Your ${plan.dayCount}-day plan`}
    >
      <div className="plan-week-strip__heading">
        <div>
          <p className="eyebrow">Your plan</p>
          <h2>{plan.templateName}</h2>
        </div>
        <strong>
          Day {plan.dayNumber} of {plan.dayCount}
        </strong>
      </div>
      <ol>
        {plan.days.map((day) => (
          <PlanDay
            key={day.dayIndex}
            day={day}
            todayIndex={plan.today.dayIndex}
          />
        ))}
      </ol>
      <Link className="plan-week-strip__link" href="/plan">
        View full {plan.dayCount}-day plan <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

function PlanDay({
  day,
  todayIndex,
}: {
  day: CurrentTrainingPlanDay;
  todayIndex: number;
}) {
  const relation = day.dayIndex - todayIndex;
  const status =
    relation === 0
      ? "Today"
      : relation > 0
        ? "Upcoming"
        : day.completed
          ? "Done"
          : day.kind === "rest"
            ? "Rest"
            : "Missed";
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
  const label = formatWeekday(day.occursOn, "short");
  return (
    <li
      className={className}
      aria-label={relation > 0 ? `Locked ${label}` : undefined}
    >
      <small>{label}</small>
      <span aria-hidden="true">
        {day.kind === "rest" ? "–" : day.completed ? "✓" : "●"}
      </span>
      <strong>{status}</strong>
    </li>
  );
}

export function formatWeekday(day: string, length: "short" | "long") {
  return new Intl.DateTimeFormat("en-US", {
    weekday: length,
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
import Link from "next/link";
