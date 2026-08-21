"use client";

import Link from "next/link";
import { PlayerAvatar } from "../../components/PlayerAvatar";
import { useOptionalAuth } from "../../state/auth-context";
import { teamCanvasCopy } from "../content";
import { teamCanvasMock } from "../mock-data";
import { teamCanvasRoutes } from "../routes";

export function TeamCanvasShell({ children }: { children: React.ReactNode }) {
  const auth = useOptionalAuth();
  const player = auth?.currentPlayer ?? teamCanvasMock.player;

  return (
    <div className="team-canvas-app">
      <header className="tc-header">
        <Link className="tc-brand" href={teamCanvasRoutes.today}>
          <span aria-hidden="true">Z</span>
          <strong>{teamCanvasCopy.brand}</strong>
        </Link>
        <Link
          className="tc-profile-link"
          href={teamCanvasRoutes.me}
          aria-label={teamCanvasCopy.openProfile(player.firstName)}
        >
          <PlayerAvatar player={player} size="small" emphasizeSelf={false} />
        </Link>
      </header>
      <main className="tc-main">{children}</main>
    </div>
  );
}
