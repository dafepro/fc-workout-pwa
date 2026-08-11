import type { ReactNode } from "react";

export const EFFECT_ART: Record<string, ReactNode> = {
  none: null,
  orbit: (
    <g className="avatar-effect avatar-effect--animated">
      <ellipse
        cx="32"
        cy="38"
        rx="27"
        ry="21"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        strokeDasharray="3 6"
        opacity="0.72"
      />
      <circle cx="7" cy="31" r="3" fill="#c8f52a" />
      <circle cx="53" cy="24" r="2.5" fill="#ffca63" />
      <circle cx="43" cy="58" r="2" fill="#7be3d2" />
    </g>
  ),
  pulse: (
    <rect
      className="avatar-effect avatar-effect--pulse"
      x="0"
      y="0"
      width="64"
      height="82"
      fill="white"
      opacity="0.04"
    />
  ),
};
