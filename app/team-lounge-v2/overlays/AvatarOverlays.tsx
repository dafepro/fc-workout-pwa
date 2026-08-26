import { memo } from "react";
import { AvatarArt } from "../../avatar/AvatarArt";
import type { AvatarConfiguration } from "../../avatar/types";
import type { LoungeParticipantOverlay } from "../presence";
import type { LoungeEmote } from "../social/emotes";

const LoungeAvatarArt = memo(function LoungeAvatarArt({
  config,
}: {
  config: AvatarConfiguration;
}) {
  return <AvatarArt config={config} />;
});

export function AvatarOverlays({
  participants,
  emotes = {},
  onCurrentAvatarPointerDown,
}: {
  participants: readonly LoungeParticipantOverlay[];
  emotes?: Readonly<Record<string, LoungeEmote>>;
  onCurrentAvatarPointerDown?(): void;
}) {
  return (
    <div className="team-lounge-v2__avatar-overlays" aria-live="off">
      {participants.map((participant) => (
        <div
          key={participant.playerID}
          className={`team-lounge-v2__participant${participant.current ? " team-lounge-v2__participant--current" : ""}`}
          aria-label={participant.accessibleName}
          onPointerDownCapture={
            participant.current ? onCurrentAvatarPointerDown : undefined
          }
          style={{
            transform: `translate3d(${participant.screen.x}px, ${participant.screen.y}px, 0) translate(-50%, -50%)`,
          }}
        >
          {emotes[participant.playerID] ? (
            <span className="team-lounge-v2__participant-emote" aria-hidden>
              {emotes[participant.playerID].symbol}
            </span>
          ) : null}
          <span className="team-lounge-v2__participant-avatar" aria-hidden>
            <LoungeAvatarArt config={participant.avatarConfiguration} />
          </span>
          <span className="team-lounge-v2__participant-name">
            {participant.displayName}
          </span>
        </div>
      ))}
    </div>
  );
}
