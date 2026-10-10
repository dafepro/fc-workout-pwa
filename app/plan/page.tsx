"use client";

import Link from "next/link";
import { copy } from "../content/copy";
import { PlanOverview } from "../player/PlanOverview";
import { useTraining } from "../state/training-context";
import { LoadError } from "../components/LoadError";

export default function PlayerPlanPage() {
  const training = useTraining();
  const plan = training.dashboard?.currentPlan;

  if (training.dashboardStatus === "loading") {
    return (
      <div className="player-page plan-page" aria-busy="true">
        Opening your plan…
      </div>
    );
  }
  if (training.dashboardStatus === "error")
    return (
      <div className="player-page plan-page">
        <h1>{copy.today.fullPlanTitle}</h1>
        <LoadError
          message="Your plan couldn’t be loaded. Try again to see your current schedule."
          onRetry={() => void training.refreshDashboard()}
        />
      </div>
    );
  if (!plan) {
    return (
      <div className="player-page plan-page plan-page--empty">
        <Link className="plan-overview__back" href="/">
          ← {copy.today.backToToday}
        </Link>
        <h1>{copy.today.fullPlanTitle}</h1>
        <p>{copy.today.planUnavailable}</p>
      </div>
    );
  }
  return (
    <div className="player-page plan-page">
      <PlanOverview plan={plan} />
    </div>
  );
}
