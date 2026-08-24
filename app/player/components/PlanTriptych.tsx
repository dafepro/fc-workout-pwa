import type { ReactNode } from "react";
import type {
  CurrentTrainingPlanDay,
  TrainingPlanWindow,
} from "../../domain/types";

export function PlanTriptych({
  plan,
  children,
}: {
  plan: TrainingPlanWindow;
  children: ReactNode;
}) {
  return (
    <section
      className="whats-next whats-next--triptych"
      aria-label="This week’s coach plan"
    >
      <header className="plan-triptych__heading">
        <div>
          <p className="player-eyebrow">
            Coach plan · Day {plan.dayNumber} of {plan.dayCount}
          </p>
          <h2>{plan.templateName}</h2>
        </div>
        <span>{focusLabel(plan.today.focus)}</span>
      </header>

      <div className="plan-triptych">
        <DayBookend day={plan.yesterday} position="yesterday" />
        <div className="plan-triptych__today">{children}</div>
        <DayBookend day={plan.tomorrow} position="tomorrow" />
      </div>
      <p className="plan-triptych__policy">
        Missed days stay missed. Your plan keeps moving—no catch-up workout.
      </p>
    </section>
  );
}

function DayBookend({
  day,
  position,
}: {
  day: CurrentTrainingPlanDay | null;
  position: "yesterday" | "tomorrow";
}) {
  const label = position === "yesterday" ? "Yesterday" : "Tomorrow";
  if (!day) {
    return (
      <aside className={`plan-bookend plan-bookend--${position} is-empty`}>
        <span>{label}</span>
        <strong>No plan day</strong>
      </aside>
    );
  }

  const activity =
    day.kind === "rest"
      ? "Rest"
      : (day.blocks.find((block) => !block.completed)?.label ??
        day.blocks.at(-1)?.label ??
        focusLabel(day.focus));
  const state =
    position === "tomorrow"
      ? "Preview"
      : day.completed
        ? day.kind === "rest"
          ? "Rest checked in"
          : "Completed"
        : "No check-in";

  return (
    <aside
      className={`plan-bookend plan-bookend--${position} is-${day.kind} ${day.completed ? "is-complete" : ""}`}
      aria-label={`${label}: ${activity}. ${state}.`}
    >
      <span>{label}</span>
      <strong>{activity}</strong>
      <small>{state}</small>
    </aside>
  );
}

function focusLabel(value: CurrentTrainingPlanDay["focus"]): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
