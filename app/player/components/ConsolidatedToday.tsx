"use client";

import { useState } from "react";
import { players } from "../../data/mockData";
import type { MomentumPlanContent } from "../../momentum-alpha/connected";
import { useMomentumAlpha } from "../../momentum-alpha/state";
import { useOptionalTraining } from "../../state/training-context";
import { useTeamCanvas } from "../../team-canvas/state";
import { usePlayerDevSettings } from "../dev/PlayerDevSettings";
import { playerExperienceCopy } from "../content";
import type { TrainingDashboard } from "../../domain/types";
import { CompactPlayerStatus } from "./CompactPlayerStatus";
import { PlanWeekStrip } from "./PlanWeekStrip";
import { TodayPlanHero } from "./TodayPlanHero";
import { TodaySecondaryActions } from "./TodaySecondaryActions";

export function ConsolidatedToday() {
  const momentum = useMomentumAlpha();
  const canvas = useTeamCanvas();
  const training = useOptionalTraining();
  const dev = usePlayerDevSettings();
  const [retrying, setRetrying] = useState(false);
  const prototypePlayer = players[0];
  const livePlanComplete =
    canvas.connectedStatus === "local"
      ? canvas.state.primaryComplete
      : connectedTodayComplete(training?.dashboard ?? null);
  const connectedPresentation = training?.dashboard
    ? connectedTodayPresentation(training.dashboard, momentum.presentation.plan)
    : null;
  const restDay =
    dev.settings.today === "rest" ||
    (dev.settings.today === "real" &&
      (connectedPresentation?.restDay ??
        (momentum.state.dayKind === "rest" ||
          (canvas.connectedStatus === "local" &&
            canvas.state.dayKind === "rest"))));
  const momentumScore = training?.dashboard?.summary.momentumScore ?? 68;
  const checkInStreak =
    training?.dashboard?.summary.currentCheckInStreak ??
    prototypePlayer.currentStreak;
  const unlockedByToday =
    dev.settings.today === "complete"
      ? true
      : dev.settings.today === "training" || dev.settings.today === "rest"
        ? false
        : livePlanComplete;
  const unlocked =
    dev.settings.teamAccess === "locked" ? false : unlockedByToday;
  const previewingToday = dev.settings.today !== "real";
  const planWindow = training?.dashboard?.currentPlan ?? null;
  const source = connectedPresentation?.source ?? "recommendation";
  const todayPlan = connectedPresentation?.plan ?? momentum.presentation.plan;
  const actionUnavailable = connectedPlanActionUnavailable(
    training?.dashboard ?? null,
  );

  async function retryDashboard() {
    if (!training) return;
    setRetrying(true);
    await training.refreshDashboard();
    setRetrying(false);
  }

  if (
    training?.connected &&
    training.dashboardStatus === "error" &&
    !training.dashboard
  ) {
    return (
      <TodayDashboardError
        retrying={retrying}
        onRetry={() => void retryDashboard()}
      />
    );
  }

  if (
    canvas.connectedStatus === "loading" ||
    momentum.loading ||
    (training?.connected && training.dashboardStatus === "loading")
  ) {
    return (
      <div className="player-page player-page--today" aria-busy="true">
        <p className="player-opening">Opening today’s plan…</p>
      </div>
    );
  }

  return (
    <div className="player-page player-page--today">
      {dev.settings.momentumVisible ? (
        <CompactPlayerStatus
          momentumScore={momentumScore}
          checkInStreak={checkInStreak}
        />
      ) : null}

      <TodayPlanHero
        source={source}
        restDay={restDay}
        complete={unlockedByToday}
        previewOnly={previewingToday}
        actionUnavailable={actionUnavailable}
        connectedError={canvas.connectedError}
        plan={todayPlan}
        onComplete={(input) => canvas.complete(input)}
        onRecordRest={() => canvas.recordRest()}
      />

      {planWindow ? <PlanWeekStrip plan={planWindow} /> : null}

      <TodaySecondaryActions
        teamLocked={!unlocked}
        prizeBoxesConnected={training?.connected ?? false}
      />
    </div>
  );
}

export function TodayDashboardError({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry(): void;
}) {
  const copy = playerExperienceCopy.focusedToday;
  return (
    <div className="player-page player-page--today">
      <section className="today-dashboard-error" role="alert">
        <p className="player-eyebrow">{copy.today}</p>
        <h1>{copy.planLoadFailed}</h1>
        <p>{copy.planLoadFailedBody}</p>
        <button type="button" disabled={retrying} onClick={onRetry}>
          {retrying ? copy.retrying : copy.retry}
        </button>
      </section>
    </div>
  );
}

export function connectedTodayComplete(
  dashboard: TrainingDashboard | null,
): boolean {
  return (
    dashboard?.currentPlanDay?.completed ??
    dashboard?.currentAssignment?.completed ??
    dashboard?.todayRecommendation.completed ??
    false
  );
}

export function connectedPlanActionUnavailable(
  dashboard: TrainingDashboard | null,
): boolean {
  const day = dashboard?.currentPlanDay;
  if (!dashboard || !day || day.kind === "rest" || day.completed) return false;
  const block =
    day.blocks.find((candidate) => !candidate.completed) ?? day.blocks[0];
  return Boolean(
    block &&
      !dashboard.activities.some(
        (activity) => activity.id === block.activityDefinitionId,
      ),
  );
}

export function connectedTodayPresentation(
  dashboard: TrainingDashboard,
  projectedPlan: MomentumPlanContent,
): {
  source: "coach-plan" | "team-default" | "recommendation";
  restDay: boolean;
  plan: MomentumPlanContent;
} {
  if (dashboard.todayRecommendation.source !== "suggestion") {
    return {
      source:
        dashboard.todayRecommendation.source === "coach_plan"
          ? "coach-plan"
          : "team-default",
      restDay: dashboard.currentPlanDay?.kind === "rest",
      plan: projectedPlan,
    };
  }
  return {
    source: "recommendation",
    restDay: dashboard.todayRecommendation.kind === "rest",
    plan: projectedPlan,
  };
}
