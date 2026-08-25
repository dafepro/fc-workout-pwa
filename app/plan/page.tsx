"use client";

import Link from "next/link";
import { useOptionalTraining } from "../state/training-context";
import { PlanOverview } from "../player/components/PlanOverview";
import { playerExperienceCopy } from "../player/content";

export default function PlayerPlanPage() {
  const training = useOptionalTraining();
  const plan = training?.dashboard?.currentPlan;
  const copy = playerExperienceCopy.focusedToday;

  if (training?.dashboardStatus === "loading") {
    return (
      <div className="player-page plan-page" aria-busy="true">
        Opening your plan…
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="player-page plan-page plan-page--empty">
        <h1>{copy.fullPlanTitle}</h1>
        <p>{copy.planUnavailable}</p>
        <Link href="/">← {copy.backToToday}</Link>
      </div>
    );
  }
  return (
    <div className="player-page plan-page">
      <PlanOverview plan={plan} />
    </div>
  );
}
