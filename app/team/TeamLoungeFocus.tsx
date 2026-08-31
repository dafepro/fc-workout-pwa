"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { copy } from "../content/copy";
import type { Player, TeamMemberProjection } from "../domain/types";
import { useAuth } from "../state/auth-context";

const LazyTeamLounge = lazy(() =>
  import("../team-lounge/TeamLounge").then((module) => ({
    default: module.TeamLounge,
  })),
);

export function TeamLoungeFocus({
  player,
  teamID,
  unlocked,
  onBack,
}: {
  player: Player;
  teamID: string;
  unlocked: boolean;
  onBack: () => void;
}) {
  const { connected, runtime } = useAuth();
  const gateway = useMemo(() => runtime.social(), [runtime]);
  const [roster, setRoster] = useState<TeamMemberProjection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const loadRoster = useCallback(async () => {
    if (!unlocked) return;
    setFailed(false);
    try {
      setRoster((await gateway.teamActivity()).members);
    } catch {
      setFailed(true);
    }
  }, [gateway, unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    let active = true;
    void gateway.teamActivity().then(
      (projection) => active && setRoster(projection.members),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [gateway, unlocked]);

  return (
    <div className="team-lounge-focus">
      <header className="team-lounge-focus__header">
        <button type="button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          {copy.teamHub.backToTeam}
        </button>
        <div>
          <p className="eyebrow">{copy.teamHub.loungeEyebrow}</p>
          <h1>{copy.teamHub.loungeTitle}</h1>
        </div>
      </header>
      {unlocked && !roster && !failed ? (
        <section className="card notice" role="status">
          {copy.teamHub.rosterLoading}
        </section>
      ) : null}
      {unlocked && failed ? (
        <section className="notice notice--error" role="alert">
          <strong>{copy.teamHub.rosterFailed}</strong>
          <button type="button" onClick={() => void loadRoster()}>
            {copy.teamHub.retry}
          </button>
        </section>
      ) : null}
      {!unlocked || roster ? (
        <Suspense
          fallback={
            <section className="card notice" role="status">
              {copy.teamLounge.loading}
            </section>
          }
        >
          <LazyTeamLounge
            player={player}
            unlocked={unlocked}
            connected={connected}
            teamID={teamID}
            roster={roster ?? [player]}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
