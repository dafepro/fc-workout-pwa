"use client";
import { qualityCopy } from "../content/quality-copy";
import { lazy, Suspense } from "react";
import Link from "next/link";
import { useAuth } from "../state/auth-context";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { worldCopy as copy } from "./copy";
const World = lazy(() => import("./TeamWorld"));
export default function TeamWorldPage() {
  const { connected, runtime, currentPlayer } = useAuth();
  return (
    <section className="page">
      <header>
        <Link href="/team">{copy.back}</Link>
        <h1>{copy.title}</h1>
        <details>
          <summary>{qualityCopy.worldIdentity}</summary>
          <PlayerAvatar
            player={currentPlayer}
            size="small"
            emphasizeSelf={false}
          />
          <p>{qualityCopy.worldRepresentation}</p>
          <Link href="/me/avatar">{qualityCopy.editPortrait}</Link>
        </details>
      </header>
      {connected ? (
        <Suspense fallback={<p role="status">{copy.loading}</p>}>
          <World key={runtime.currentTeam.id} teamID={runtime.currentTeam.id} />
        </Suspense>
      ) : (
        <p role="status">{copy.connectedOnly}</p>
      )}
    </section>
  );
}
