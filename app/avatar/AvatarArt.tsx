import { LAYER_ART } from "./art";
import { resolveAvatar } from "./config";
import type {
  AvatarConfiguration,
  AvatarLayerKind,
  AvatarOption,
} from "./types";

export function AvatarArt({
  config,
  framing = "icon",
}: {
  config: AvatarConfiguration;
  framing?: "icon" | "studio";
}) {
  return (
    <svg
      viewBox={framing === "studio" ? "0 0 64 82" : "0 0 64 64"}
      className={`avatar-art${framing === "studio" ? " avatar-art--studio" : ""}`}
      aria-hidden="true"
      focusable="false"
    >
      {resolveAvatar(config).map(({ kind, option }) => (
        <g
          key={kind}
          className={`avatar-art__layer avatar-art__layer--${kind}`}
        >
          {LAYER_ART[kind](option, config)}
        </g>
      ))}
    </svg>
  );
}

const PART_VIEW_BOX: Record<AvatarLayerKind, string> = {
  background: "0 0 64 64",
  effect: "0 0 64 64",
  kit: "0 40 64 42",
  head: "8 7 48 49",
  eyes: "16 24 32 18",
  mouth: "20 36 24 18",
  facialHair: "20 35 24 20",
  hat: "8 5 48 30",
  eyewear: "10 20 44 26",
};

export function AvatarPartArt({
  kind,
  option,
  config,
}: {
  kind: AvatarLayerKind;
  option: AvatarOption;
  config: AvatarConfiguration;
}) {
  return (
    <svg
      viewBox={PART_VIEW_BOX[kind]}
      className="avatar-part-art"
      aria-hidden="true"
      focusable="false"
    >
      <g className={`avatar-part-art__layer avatar-part-art__layer--${kind}`}>
        {option.id === "none" ? (
          <path
            d="M19 19l26 26M45 19 19 45"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        ) : (
          LAYER_ART[kind](option, config)
        )}
      </g>
    </svg>
  );
}
