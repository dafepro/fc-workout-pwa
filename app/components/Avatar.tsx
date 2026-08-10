import { AvatarArt } from "../avatar/AvatarArt";
import { playerColor } from "../avatar/color";
import type { AvatarConfiguration } from "../avatar/types";
import type { Player } from "../domain/types";

export function Avatar({
  player,
  size = "medium",
  completed = false,
  config,
}: {
  player: Player;
  size?: "small" | "medium" | "large";
  completed?: boolean;
  /** Given only for the signed-in player's own surfaces. Team and leaderboard
   * rows stay on initials, so nobody's chosen look can leak into another row. */
  config?: AvatarConfiguration;
}) {
  return (
    <span
      className={`avatar avatar--${size}`}
      style={config ? undefined : { background: player.avatarColor }}
      aria-label={`${player.firstName} ${player.lastInitial}`}
      title={`${player.firstName} ${player.lastInitial}`}
    >
      {config ? (
        <AvatarArt
          config={config}
          fallbackBackground={playerColor(player.id)}
        />
      ) : (
        <span aria-hidden="true">{player.initials}</span>
      )}
      {completed ? <span className="avatar__check">✓</span> : null}
    </span>
  );
}
