"use client";

import Link from "next/link";
import { teamCanvasCopy } from "../../team-canvas/content";
import { TeamCanvasWidget } from "../team-canvas/TeamCanvasWidget";
import { playerExperienceCopy } from "../content";
import { usePlayerDevSettings } from "../dev/PlayerDevSettings";
import { TeamRewardsPreview } from "./TeamRewardsPreview";

export function ConsolidatedTeam() {
  const dev = usePlayerDevSettings();
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
        <TeamCanvasWidget />
      )}
    </div>
  );
}
