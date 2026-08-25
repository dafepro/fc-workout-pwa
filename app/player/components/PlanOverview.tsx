import Link from "next/link";
import type {
  CurrentTrainingPlanDay,
  TrainingPlanWindow,
} from "../../domain/types";
import { playerExperienceCopy } from "../content";
import { formatWeekday } from "./PlanWeekStrip";

export function PlanOverview({ plan }: { plan: TrainingPlanWindow }) {
  const copy = playerExperienceCopy.focusedToday;

  return (
    <section className="plan-overview">
      <Link
        className="plan-overview__back"
        href="/"
        aria-label={copy.backToToday}
      >
        ← {copy.backToToday}
      </Link>
      <header>
        <p className="player-eyebrow">{copy.fullPlanTitle}</p>
        <h1>{plan.templateName}</h1>
        <p>{copy.planDay(plan.dayNumber, plan.dayCount)}</p>
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
  const copy = playerExperienceCopy.focusedToday;
  const relation = day.dayIndex - todayIndex;
  const status =
    relation === 0
      ? copy.todayStatus
      : relation > 0
        ? copy.upcoming
        : day.completed
          ? copy.completed
          : day.kind === "rest"
            ? copy.plannedRest
            : copy.missed;
  const title =
    day.kind === "rest"
      ? "Planned recovery day"
      : (day.blocks[0]?.label ?? day.templateName);
  const weekday = formatWeekday(day.occursOn, "long");

  return (
    <article
      className={`plan-overview__day plan-overview__day--${status.toLowerCase()}`}
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
