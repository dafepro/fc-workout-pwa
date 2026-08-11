import { AvatarArt } from "../avatar/AvatarArt";
import { playerColor } from "../avatar/color";
import { isAvatarConfiguration } from "../avatar/config";
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
  const validConfig = isAvatarConfiguration(config) ? config : null;
  const initials =
    `${player.firstName[0] ?? ""}${player.lastInitial[0] ?? ""}`.toUpperCase();

  return (
    <span
      className={`avatar avatar--${size}`}
      style={validConfig ? undefined : { background: playerColor(player.id) }}
      aria-label={`${player.firstName} ${player.lastInitial}`}
      title={`${player.firstName} ${player.lastInitial}`}
    >
      {validConfig ? (
        <AvatarArt config={validConfig} />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
      {completed ? <span className="avatar__check">✓</span> : null}
    </span>
  );
}
