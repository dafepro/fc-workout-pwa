"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useOptionalTraining } from "../../state/training-context";
import { playerExperienceCopy } from "../../player/content";
import { formatWeekday } from "../../player/components/PlanWeekStrip";

export default function PlayerPlanDayPage() {
  const params = useParams<{ dayIndex: string }>();
  const training = useOptionalTraining();
  const plan = training?.dashboard?.currentPlan;
  const dayIndex = Number(params.dayIndex);
  const day = plan?.days.find((candidate) => candidate.dayIndex === dayIndex);
  const copy = playerExperienceCopy.focusedToday;

  if (training?.dashboardStatus === "loading") {
    return (
      <div className="player-page plan-detail" aria-busy="true">
        Opening plan day…
      </div>
    );
  }
  if (!plan || !day) {
    return (
      <div className="player-page plan-detail plan-page--empty">
        <h1>Plan day unavailable</h1>
        <Link href="/plan">← {copy.fullPlan}</Link>
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
      <Link className="plan-detail__back" href="/plan">
        ← {copy.fullPlanTitle}
      </Link>
      <header>
        <div>
          <span>
            {today ? copy.today : formatWeekday(day.occursOn, "long")}
          </span>
          {future ? <span>◆ {copy.locked}</span> : null}
        </div>
        <h1>{title}</h1>
        <p>{copy.planDay(day.dayIndex + 1, plan.dayCount)}</p>
      </header>
      <section>
        <h2>{copy.overview}</h2>
        <p>
          {rest
            ? copy.restInstruction
            : `${day.durationMinutes} minutes at ${day.intensity} intensity, focused on ${day.focus}.`}
        </p>
      </section>
      {future ? (
        <section className="plan-detail__locked">
          <h2>{copy.comeBack(formatWeekday(day.occursOn, "long"))}</h2>
          <p>{copy.futureNote}</p>
        </section>
      ) : (
        <>
          <section>
            <h2>{copy.coachNote}</h2>
            <p>
              {rest
                ? "Use today to reset so you are ready for the next plan day."
                : "Focus on good movement and stop if anything hurts."}
            </p>
          </section>
          <section>
            <h2>{copy.instructions}</h2>
            {rest ? (
              <ol>
                <li>Hydrate.</li>
                <li>Keep movement light.</li>
                <li>Prepare for tomorrow.</li>
              </ol>
            ) : (
              <ol>
                {day.blocks.map((block) => (
                  <li key={block.blockIndex}>
                    {block.label} · {block.durationMinutes} min
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
      {today ? (
        <Link className="plan-detail__action" href="/">
          Go to today’s action
        </Link>
      ) : null}
    </article>
  );
}
