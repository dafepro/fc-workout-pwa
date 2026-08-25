"use client";

import { players } from "../../data/mockData";
import type { MomentumPlanContent } from "../../momentum-alpha/connected";
import { useMomentumAlpha } from "../../momentum-alpha/state";
import { useOptionalTraining } from "../../state/training-context";
import { useTeamCanvas } from "../../team-canvas/state";
import { usePlayerDevSettings } from "../dev/PlayerDevSettings";
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

  if (canvas.connectedStatus === "loading" || momentum.loading) {
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
        connectedError={canvas.connectedError}
        plan={todayPlan}
        onComplete={(input) => canvas.complete(input)}
        onRecordRest={() => canvas.recordRest()}
      />

      {planWindow ? <PlanWeekStrip plan={planWindow} /> : null}

      <TodaySecondaryActions teamLocked={!unlocked} />
    </div>
  );
}

export function connectedTodayComplete(
  dashboard: TrainingDashboard | null,
): boolean {
  return (
    dashboard?.currentPlanDay?.completed ??
    dashboard?.currentAssignment?.completed ??
    false
  );
}

export function connectedTodayPresentation(
  dashboard: TrainingDashboard,
  projectedPlan: MomentumPlanContent,
): {
  source: "coach-plan" | "recommendation";
  restDay: boolean;
  plan: MomentumPlanContent;
} {
  if (dashboard.currentPlanDay || dashboard.currentAssignment) {
    return {
      source: "coach-plan",
      restDay: dashboard.currentPlanDay?.kind === "rest",
      plan: projectedPlan,
    };
  }

  const activity =
    dashboard.activities.find(
      (candidate) => candidate.id === "recovery-walk-jog",
    ) ?? dashboard.activities[0];
  if (!activity) {
    return { source: "recommendation", restDay: false, plan: projectedPlan };
  }

  return {
    source: "recommendation",
    restDay: false,
    plan: {
      dateLabel: projectedPlan.dateLabel,
      activity: activity.name,
      workload: `${activity.defaultValue.toLocaleString("en-US")} ${activity.unit} · Easy`,
      instruction: activity.instructions[0] ?? activity.description,
      goal: `Goal · ${activity.defaultValue.toLocaleString("en-US")} ${activity.unit}`,
      stretch: projectedPlan.stretch,
      reasons: [
        "Nothing is scheduled today, so this keeps the effort light and useful.",
      ],
    },
  };
}
