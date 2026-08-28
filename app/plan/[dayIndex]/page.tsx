"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { copy } from "../../content/copy";
import { formatWeekday } from "../../player/PlanWeekStrip";
import { useTraining } from "../../state/training-context";

export default function PlayerPlanDayPage() {
  const params = useParams<{ dayIndex: string }>();
  const training = useTraining();
  const plan = training.dashboard?.currentPlan;
  const day = plan?.days.find(
    ({ dayIndex }) => dayIndex === Number(params.dayIndex),
  );

  if (training.dashboardStatus === "loading") {
    return (
      <div className="player-page plan-detail" aria-busy="true">
        Opening plan day…
      </div>
    );
  }
  if (!plan || !day) {
    return (
      <div className="player-page plan-detail plan-page--empty">
        <Link className="plan-detail__back" href="/plan">
          ← {copy.today.fullPlanTitle}
        </Link>
        <h1>Plan day unavailable</h1>
      </div>
    );
  }

  const future = day.dayIndex > plan.today.dayIndex;
  const today = day.dayIndex === plan.today.dayIndex;
  const rest = day.kind === "rest";
  const title = rest
    ? "Planned recovery day"
    : (day.blocks[0]?.label ?? day.templateName);

  return (
    <article className="player-page plan-detail">
      <Link className="plan-detail__back" href={today ? "/" : "/plan"}>
        ← {today ? copy.today.backToToday : copy.today.fullPlanTitle}
      </Link>
      <header>
        <div>
          <span>{today ? "Today" : formatWeekday(day.occursOn, "long")}</span>
          {future ? <span>◆ Upcoming</span> : null}
        </div>
        <h1>{title}</h1>
        <p>{copy.today.planDay(day.dayIndex + 1, plan.dayCount)}</p>
      </header>
      <section>
        <h2>Overview</h2>
        <p>
          {rest
            ? "Use today for recovery. No workout is scheduled."
            : `${day.durationMinutes} minutes at ${day.intensity} intensity, focused on ${day.focus}.`}
        </p>
      </section>
      {future ? (
        <section className="plan-detail__locked">
          <h2>Come back {formatWeekday(day.occursOn, "long")}</h2>
          <p>
            Future plan days are visible for context, but cannot be started
            early.
          </p>
        </section>
      ) : !rest ? (
        <section>
          <h2>Workout</h2>
          <ol>
            {day.blocks.map((block) => (
              <li key={block.blockIndex}>
                {block.label} · {block.durationMinutes} min
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
