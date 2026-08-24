"use client";

import {
  players,
  recentTeamActivities,
  WEEKLY_GOAL,
} from "../../data/mockData";
import { useMomentumAlpha } from "../../momentum-alpha/state";
import { useOptionalTraining } from "../../state/training-context";
import { useTeamCanvas } from "../../team-canvas/state";
import { TeamRewardsPreview } from "./TeamRewardsPreview";
import { usePlayerDevSettings } from "../dev/PlayerDevSettings";
import { MomentumStatus } from "./MomentumStatus";
import { DailyDropCard } from "./DailyDropCard";
import { TeamPulse } from "./TeamPulse";
import { WhatsNext } from "./WhatsNext";

const prototypePulse = {
  activeThisWeek: 8,
  unlocked: true,
  recentActivities: recentTeamActivities,
};

const emptyPulse = {
  activeThisWeek: 0,
  unlocked: false,
  recentActivities: [],
};

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
  const previewingToday =
    dev.settings.today !== "real" || dev.settings.whatsNext !== "real";
  const liveCooldownComplete =
    canvas.connectedStatus === "local"
      ? canvas.state.cooldownComplete
      : (canvas.connectedProjection?.cooldownComplete ??
        momentum.state.recoveryComplete);
  const assignmentEntry = training?.dashboard?.currentAssignment
    ? training.entries.find(
        (entry) =>
          entry.assignmentId === training.dashboard?.currentAssignment?.id,
      )
    : undefined;
  const liveRecentEffort = training?.connected
    ? assignmentEntry?.effortLevel
    : canvas.state.effort;
  const liveRecentTiredness = training?.connected
    ? assignmentEntry?.exhaustionLevel
    : canvas.state.tiredness;
  const cooldownComplete =
    dev.settings.whatsNext === "lounge" || dev.settings.whatsNext === "all-set"
      ? true
      : dev.settings.whatsNext === "cooldown" ||
          dev.settings.whatsNext === "recovery"
        ? false
        : liveCooldownComplete;
  const recentEffort =
    dev.settings.whatsNext === "recovery" ? 6 : liveRecentEffort;
  const recentTiredness =
    dev.settings.whatsNext === "recovery" ? 6 : liveRecentTiredness;
  const whatsNextTeamAvailable =
    dev.settings.whatsNext === "all-set" ? false : unlocked;
  const pulse =
    training?.dashboard?.teamPulse ??
    (training?.connected ? emptyPulse : prototypePulse);

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
          momentumScore={momentumScore}
          weeklyCheckIns={weeklyMomentumCredits}
          weeklyGoal={weeklyGoal}
          checkInStreak={checkInStreak}
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
        teamAvailable={whatsNextTeamAvailable}
        previewOnly={previewingToday}
        recentEffort={recentEffort}
        recentTiredness={recentTiredness}
        connectedError={canvas.connectedError}
        plan={momentum.presentation.plan}
        planWindow={training?.dashboard?.currentPlan}
        recovery={momentum.presentation.recovery}
        onComplete={(input) => canvas.complete(input)}
        onRecordRest={() => canvas.recordRest()}
        onRecordCooldown={() => canvas.recordCooldown()}
      />

      <DailyDropCard connected={training?.connected ?? false} />

      <TeamRewardsPreview placement="today" />

      <TeamPulse
        activeThisWeek={pulse.activeThisWeek}
        activities={pulse.recentActivities}
        teamId={training?.dashboard?.team.id ?? "team-hill-striders"}
        unlocked={unlocked && pulse.unlocked}
        onSendReaction={
          training?.sendReaction ??
          (async () => ({
            id: crypto.randomUUID(),
            remainingForRecipientWindow: 4,
          }))
        }
      />
    </div>
  );
}
