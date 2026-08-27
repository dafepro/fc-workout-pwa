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
  return (
    <li
      className={
        relation === 0 ? "is-today" : day.completed ? "is-complete" : ""
      }
    >
      <small>{weekday(day.occursOn)}</small>
      <span aria-hidden="true">
        {day.kind === "rest" ? "–" : day.completed ? "✓" : "●"}
      </span>
      <strong>{status}</strong>
    </li>
  );
}

function weekday(day: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
