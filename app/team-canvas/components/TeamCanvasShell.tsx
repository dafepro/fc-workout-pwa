"use client";

import Link from "next/link";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { useOptionalAuth } from "../../state/auth-context";
import { teamCanvasCopy } from "../content";
import { teamCanvasMock } from "../mock-data";
import { teamCanvasRoutes } from "../routes";
import { useTeamCanvas } from "../state";

export function TeamCanvasShell({ children }: { children: React.ReactNode }) {
  const auth = useOptionalAuth();
  const { connectedStatus, state } = useTeamCanvas();
  const player = auth?.currentPlayer ?? teamCanvasMock.player;
  const teamUnlocked =
    connectedStatus === "ready" ||
    (connectedStatus === "local" && state.primaryComplete);

  return (
    <div className="team-canvas-app">
      <header className="tc-header">
        <Link className="tc-brand" href={teamCanvasRoutes.today}>
          <span aria-hidden="true">Z</span>
          <strong>{teamCanvasCopy.brand}</strong>
        </Link>
        <div className="tc-header__actions">
          <nav className="tc-navigation" aria-label={teamCanvasCopy.nav.label}>
            <Link href={teamCanvasRoutes.today}>
              {teamCanvasCopy.nav.today}
            </Link>
            {teamUnlocked ? (
              <Link href={teamCanvasRoutes.team}>
                {teamCanvasCopy.nav.team}
              </Link>
            ) : (
              <span aria-disabled="true">{teamCanvasCopy.nav.team}</span>
            )}
          </nav>
          <Link
            className="tc-profile-link"
            href={teamCanvasRoutes.me}
            aria-label={teamCanvasCopy.openProfile(player.firstName)}
          >
            <PlayerAvatar player={player} size="small" emphasizeSelf={false} />
          </Link>
        </div>
      </header>
      <main className="tc-main">{children}</main>
    </div>
  );
}
