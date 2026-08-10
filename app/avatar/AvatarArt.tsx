import { LAYER_ART } from "./art";
import { resolveAvatar } from "./config";
import type { AvatarConfiguration } from "./types";

/** Drawn inside the existing .avatar span so the circle, white border, and
 * shadow are reused rather than rebuilt. The span keeps the accessible name, so
 * this is decorative and no option slug is ever announced. */
export function AvatarArt({
  config,
  fallbackBackground,
}: {
  config: AvatarConfiguration;
  fallbackBackground: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className="avatar-art"
      aria-hidden="true"
      focusable="false"
    >
      {resolveAvatar(config, fallbackBackground).map(({ kind, option }) => (
        <g
          key={kind}
          className={`avatar-art__layer avatar-art__layer--${kind}`}
        >
          {LAYER_ART[kind](option)}
        </g>
      ))}
    </svg>
  );
}
