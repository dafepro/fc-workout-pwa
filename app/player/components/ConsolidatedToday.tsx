"use client";

import { players, WEEKLY_GOAL } from "../../data/mockData";
import { useMomentumAlpha } from "../../momentum-alpha/state";
import { useOptionalTraining } from "../../state/training-context";
import { useTeamCanvas } from "../../team-canvas/state";
import { TeamRewardsPreview } from "./TeamRewardsPreview";
import { usePlayerDevSettings } from "../dev/PlayerDevSettings";
import { MomentumStatus } from "./MomentumStatus";
import { WhatsNext } from "./WhatsNext";

export function ConsolidatedToday() {
  const momentum = useMomentumAlpha();
  const canvas = useTeamCanvas();
  const training = useOptionalTraining();
  const dev = usePlayerDevSettings();
  const prototypePlayer = players[0];
  const livePlanComplete =
    canvas.connectedStatus === "local"
      ? canvas.state.primaryComplete
      : canvas.connectedStatus === "ready" || momentum.state.primaryComplete;
  const restDay =
    dev.settings.today === "rest" ||
    (dev.settings.today === "real" &&
      (momentum.state.dayKind === "rest" ||
        (canvas.connectedStatus === "local" &&
          canvas.state.dayKind === "rest")));
  const localRestCredit =
    !training?.connected &&
    dev.settings.today === "real" &&
    restDay &&
    canvas.state.completion === "rest"
      ? 1
      : 0;
  const weeklyMomentumCredits =
    (training?.dashboard?.summary.weeklyMomentumCredits ??
      prototypePlayer.weeklySessions) + localRestCredit;
  const weeklyGoal = training?.dashboard?.team.weeklyGoal ?? WEEKLY_GOAL;
  const currentStreak =
    training?.dashboard?.summary.currentStreak ?? prototypePlayer.currentStreak;
  const unlockedByToday =
    dev.settings.today === "complete"
      ? true
      : dev.settings.today === "training" || dev.settings.today === "rest"
        ? false
        : livePlanComplete;
  const unlocked =
    dev.settings.teamAccess === "locked" ? false : unlockedByToday;
  const previewingToday = dev.settings.today !== "real";
  const cooldownComplete =
    canvas.connectedStatus === "local"
      ? canvas.state.cooldownComplete
      : (canvas.connectedProjection?.cooldownComplete ??
        momentum.state.recoveryComplete);

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
        <MomentumStatus
          weeklySessions={weeklyMomentumCredits}
          weeklyGoal={weeklyGoal}
          currentStreak={currentStreak}
          restDay={restDay}
          planComplete={unlockedByToday}
          stateOverride={
            dev.settings.momentumBand === "real"
              ? undefined
              : dev.settings.momentumBand
          }
        />
      ) : null}

      <WhatsNext
        restDay={restDay}
        planComplete={unlockedByToday}
        cooldownComplete={cooldownComplete}
        teamAvailable={unlocked}
        previewOnly={previewingToday}
        connectedError={canvas.connectedError}
        plan={momentum.presentation.plan}
        recovery={momentum.presentation.recovery}
        extras={momentum.presentation.extras}
        onComplete={(input) => canvas.complete(input)}
        onRecordRest={() => canvas.recordRest()}
        onRecordCooldown={() => canvas.recordCooldown()}
        onRecordExtra={(activity) => momentum.recordExtra(activity)}
      />

      <TeamRewardsPreview placement="today" />
    </div>
  );
}
