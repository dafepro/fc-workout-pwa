import type { Player } from "../domain/types";

export function Avatar({
  player,
  size = "medium",
  completed = false,
}: {
  player: Player;
  size?: "small" | "medium" | "large";
  completed?: boolean;
}) {
  return (
    <span
      className={`avatar avatar--${size}`}
      style={{ background: player.avatarColor }}
      aria-label={`${player.firstName} ${player.lastInitial}`}
      title={`${player.firstName} ${player.lastInitial}`}
    >
      <span aria-hidden="true">{player.initials}</span>
      {completed ? <span className="avatar__check">✓</span> : null}
    </span>
  );
}
