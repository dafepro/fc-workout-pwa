import Link from "next/link";
import { copy } from "../content/copy";
import type {
  CurrentTrainingPlanDay,
  TrainingPlanWindow,
} from "../domain/types";
import { formatWeekday } from "./PlanWeekStrip";

export function PlanOverview({ plan }: { plan: TrainingPlanWindow }) {
  return (
    <section className="plan-overview">
      <Link className="plan-overview__back" href="/">
        ← {copy.today.backToToday}
      </Link>
      <header>
        <p className="eyebrow">{copy.today.fullPlanTitle}</p>
        <h1>{plan.templateName}</h1>
        <p>{copy.today.planDay(plan.dayNumber, plan.dayCount)}</p>
      </header>
      <div className="plan-overview__days">
        {plan.days.map((day) => (
          <PlanDayCard
            key={day.dayIndex}
            day={day}
            todayIndex={plan.today.dayIndex}
          />
        ))}
      </div>
    </section>
  );
}

function PlanDayCard({
  day,
  todayIndex,
}: {
  day: CurrentTrainingPlanDay;
  todayIndex: number;
}) {
  const relation = day.dayIndex - todayIndex;
  const status =
    relation === 0
      ? copy.today.todayStatus
      : relation > 0
        ? copy.today.upcoming
        : day.completed
          ? copy.today.completed
          : day.kind === "rest"
            ? copy.today.plannedRest
            : copy.today.missed;
  const title =
    day.kind === "rest"
      ? "Planned recovery day"
      : (day.blocks[0]?.label ?? day.templateName);
  const weekday = formatWeekday(day.occursOn, "long");

  return (
    <article
      className={`plan-overview__day plan-overview__day--${status.toLowerCase().replace(" ", "-")}`}
    >
      <Link
        href={`/plan/${day.dayIndex}`}
        aria-label={`${weekday}, ${title}, ${status}`}
      >
        <div>
          <small>{weekday}</small>
          <h2>{title}</h2>
          <p>
            {day.kind === "rest"
              ? "Recovery day"
              : `${day.durationMinutes} min · ${capitalize(day.intensity)}`}
          </p>
        </div>
        <span className="plan-overview__status">{status}</span>
        <span aria-hidden="true">›</span>
      </Link>
    </article>
  );
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
