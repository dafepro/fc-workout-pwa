"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactionPicker } from "../components/ReactionPicker";
import { copy } from "../content/copy";
import { createTeamHubGateway } from "../data/team-hub-gateway";
import type {
  ReactionType,
  TeamHubActivity,
  TeamHubProjection,
} from "../domain/types";
import { useAuth } from "../state/auth-context";
import { useTraining } from "../state/training-context";
import { TeamHub } from "./TeamHub";
import { TeamLoungeFocus } from "./TeamLoungeFocus";

export default function TeamPage() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const focused = searchParameters.get("view") === "lounge";
  const wasFocused = useRef(focused);
  const { dashboard, sendReaction } = useTraining();
  const { connected, currentPlayer, currentPlayerID, session } = useAuth();
  const teamID = session?.player?.teams[0]?.id ?? "team-hill-striders";
  const gateway = useMemo(
    () =>
      createTeamHubGateway(connected, teamID, {
        currentPlayerID,
        dashboard,
      }),
    [connected, currentPlayerID, dashboard, teamID],
  );
  const [hub, setHub] = useState<TeamHubProjection | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [cheerSelection, setCheerSelection] = useState<TeamHubActivity | null>(
    null,
  );
  const [sentLabel, setSentLabel] = useState("");

  const loadHub = useCallback(async () => {
    setStatus("loading");
    try {
      setHub(await gateway.current());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [gateway]);

  useEffect(() => {
    let active = true;
    void gateway.current().then(
      (projection) => {
        if (!active) return;
        setHub(projection);
        setStatus("ready");
      },
      () => active && setStatus("error"),
    );
    return () => {
      active = false;
    };
  }, [gateway]);

  useEffect(() => {
    if (wasFocused.current && !focused) {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>("[data-team-lounge-open]")
          ?.focus();
      });
    }
    wasFocused.current = focused;
  }, [focused]);

  async function react(type: ReactionType, emoji: string) {
    if (!cheerSelection?.reactionContext) return;
    setSentLabel("");
    await sendReaction(
      cheerSelection.player.id,
      type,
      cheerSelection.reactionContext,
    );
    setSentLabel(copy.cheers.sent(emoji, cheerSelection.player.firstName));
    setCheerSelection(null);
  }

  if (focused && hub) {
    return (
      <div className="page player-page player-page--team page--team">
        <TeamLoungeFocus
          connected={connected}
          player={currentPlayer}
          teamID={teamID}
          unlocked={hub.access.loungeUnlocked}
          onBack={() => router.push("/team")}
        />
      </div>
    );
  }

  return (
    <div className="page player-page player-page--team page--team">
      {status === "loading" && !hub ? (
        <section className="card notice" role="status">
          {copy.teamHub.loading}
        </section>
      ) : null}
      {status === "error" ? (
        <section className="notice notice--error" role="alert">
          <strong>{copy.teamHub.loadFailed}</strong>
          <button type="button" onClick={() => void loadHub()}>
            {copy.teamHub.retry}
          </button>
        </section>
      ) : null}
      {hub ? (
        <TeamHub
          hub={hub}
          onCheer={setCheerSelection}
          onOpenLounge={() => router.push("/team?view=lounge")}
        />
      ) : null}
      {sentLabel ? (
        <p className="reaction-sent-status pill pill--lime" role="status">
          {sentLabel}
        </p>
      ) : null}
      <ReactionPicker
        recipient={cheerSelection?.player ?? null}
        contextLabel={
          cheerSelection ? reactionContextLabel(cheerSelection, hub) : ""
        }
        onClose={() => setCheerSelection(null)}
        onSend={react}
      />
    </div>
  );
}

function reactionContextLabel(
  row: TeamHubActivity,
  hub: TeamHubProjection | null,
): string {
  const context = row.reactionContext;
  if (context?.type === "challenge") {
    const challenge = hub?.focus.find(
      (item) => item.kind === "challenge" && item.id === context.assignmentId,
    );
    return challenge ? `${challenge.title} challenge` : "Team challenge";
  }
  return copy.cheers.contextLabels.team_progress;
}
