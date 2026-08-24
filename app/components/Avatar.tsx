import { AvatarArt } from "../avatar/AvatarArt";
import { playerColor } from "../avatar/color";
import { migrateAvatarConfiguration } from "../avatar/config";
import type { AvatarConfiguration } from "../avatar/types";
import type { Player } from "../domain/types";

export function Avatar({
  player,
  size = "medium",
  completed = false,
  config,
  isCurrentPlayer = false,
}: {
  player: Player;
  size?: "small" | "medium" | "large";
  completed?: boolean;
  config?: AvatarConfiguration;
  isCurrentPlayer?: boolean;
}) {
  const validConfig = migrateAvatarConfiguration(config);
  const initials =
    `${player.firstName[0] ?? ""}${player.lastInitial[0] ?? ""}`.toUpperCase();

  return (
    <span
      className={`avatar avatar--${size}${isCurrentPlayer ? " avatar--self" : ""}`}
      style={validConfig ? undefined : { background: playerColor(player.id) }}
      aria-label={`${player.firstName} ${player.lastInitial}${isCurrentPlayer ? ", you" : ""}`}
      title={`${player.firstName} ${player.lastInitial}`}
    >
      {validConfig ? (
        <AvatarArt config={validConfig} />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
      {isCurrentPlayer ? (
        <span className="avatar__self-marker" aria-hidden="true">
          ✦
        </span>
      ) : null}
      {completed ? <span className="avatar__check">✓</span> : null}
    </span>
  );
}
