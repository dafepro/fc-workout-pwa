"use client";

import Link from "next/link";
import { useOptionalTraining } from "../../state/training-context";
import { teamCanvasCopy } from "../../team-canvas/content";
import { TeamCanvasWidget } from "../team-canvas/TeamCanvasWidget";
import { playerExperienceCopy } from "../content";
import { usePlayerDevSettings } from "../dev/PlayerDevSettings";
import { TeamRewardsPreview } from "./TeamRewardsPreview";
import { TeamPulse } from "./TeamPulse";

export function ConsolidatedTeam() {
  const dev = usePlayerDevSettings();
  const training = useOptionalTraining();
  const pulse = training?.dashboard?.teamPulse;
  return (
    <div className="player-page player-page--team">
      <TeamRewardsPreview placement="team" />
      {dev.settings.teamAccess === "locked" ? (
        <section className="tc-locked" aria-labelledby="dev-team-lock-title">
          <span className="pill">
            {playerExperienceCopy.devConsole.forcedLock}
          </span>
          <h1 id="dev-team-lock-title">{teamCanvasCopy.locked.title}</h1>
          <p>{teamCanvasCopy.locked.body}</p>
          <Link href="/">{teamCanvasCopy.locked.action}</Link>
        </section>
      ) : (
        <>
          {training?.dashboard && pulse ? (
            <TeamPulse
              activeThisWeek={pulse.activeThisWeek}
              activities={pulse.recentActivities}
              teamId={training.dashboard.team.id}
              unlocked={pulse.unlocked}
              onSendReaction={training.sendReaction}
            />
          ) : null}
          <TeamCanvasWidget />
        </>
      )}
    </div>
  );
}
