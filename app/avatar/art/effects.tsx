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
  confetti: (
    <g className="avatar-effect avatar-effect--animated">
      <rect
        x="7"
        y="12"
        width="3"
        height="7"
        rx="1"
        fill="#c8f52a"
        transform="rotate(-22 8.5 15.5)"
      />
      <rect
        x="18"
        y="5"
        width="3"
        height="7"
        rx="1"
        fill="#ff806f"
        transform="rotate(28 19.5 8.5)"
      />
      <rect
        x="46"
        y="9"
        width="3"
        height="7"
        rx="1"
        fill="#66d0ff"
        transform="rotate(18 47.5 12.5)"
      />
      <rect
        x="53"
        y="25"
        width="3"
        height="7"
        rx="1"
        fill="#f3ad16"
        transform="rotate(-30 54.5 28.5)"
      />
      <rect
        x="5"
        y="42"
        width="3"
        height="7"
        rx="1"
        fill="#7be3d2"
        transform="rotate(24 6.5 45.5)"
      />
      <rect
        x="52"
        y="52"
        width="3"
        height="7"
        rx="1"
        fill="#c99cff"
        transform="rotate(32 53.5 55.5)"
      />
      <circle cx="14" cy="29" r="2" fill="#f3ad16" />
      <circle cx="47" cy="38" r="2" fill="#ff806f" />
      <path d="m12 58 2-5 2 5-2 4zM43 19l2-5 2 5-2 4z" fill="#c8f52a" />
    </g>
  ),
};
