import type { ReactNode } from "react";

import { layerPalette } from "../config";
import type { AvatarConfiguration } from "../types";

function plainBorder(config: AvatarConfiguration) {
  const { color } = layerPalette(config, "borderPalette");
  return (
    <circle
      className="avatar-border avatar-border--plain"
      cx="32"
      cy="32"
      r="29.5"
      fill="none"
      stroke={color}
      strokeWidth="5"
    />
  );
}

function runningGradientBorder(config: AvatarConfiguration) {
  const { color, accent } = layerPalette(config, "borderPalette");
  return (
    <g className="avatar-border avatar-border--running">
      <circle
        cx="32"
        cy="32"
        r="29.5"
        fill="none"
        stroke={accent}
        strokeWidth="5"
        opacity="0.85"
      />
      <circle
        className="avatar-border__runner avatar-border__runner--primary"
        cx="32"
        cy="32"
        r="29.5"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray="46 139.4"
        strokeLinecap="round"
      />
      <circle
        className="avatar-border__runner avatar-border__runner--accent"
        cx="32"
        cy="32"
        r="29.5"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeDasharray="18 13"
        strokeLinecap="round"
      />
    </g>
  );
}

export const BORDER_ART: Record<
  string,
  ((config: AvatarConfiguration) => ReactNode) | undefined
> = {
  none: undefined,
  plain: plainBorder,
  "running-gradient": runningGradientBorder,
};
