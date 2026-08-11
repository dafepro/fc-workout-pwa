import type { ReactNode } from "react";
import { layerPalette } from "../config";
import type { AvatarConfiguration } from "../types";
import { EYE_LINE, INK, LEFT_EYE_X, RIGHT_EYE_X } from "./geometry";

const BROW = EYE_LINE - 3.5;

function Aviators({ color, accent }: Palette) {
  return (
    <>
      <path
        d={`M18 ${BROW + 0.5}L14 ${BROW + 2.2}M46 ${BROW + 0.5}L50 ${BROW + 2.2}`}
        stroke={accent}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <path d={`M18.5 ${BROW}H45.5`} stroke={accent} strokeWidth="1.8" />
      {[LEFT_EYE_X, RIGHT_EYE_X].map((x) => (
        <path
          key={x}
          d={`M${x - 6} ${BROW}h12v3q0 5.6-6 5.6t-6-5.6z`}
          fill={color}
          opacity="0.85"
          stroke={accent}
          strokeWidth="0.8"
        />
      ))}
    </>
  );
}

function RoundGlasses({ color }: Palette) {
  return (
    <>
      <path
        d={`M${LEFT_EYE_X + 6} ${EYE_LINE}h${RIGHT_EYE_X - LEFT_EYE_X - 12}`}
        stroke={color}
        strokeWidth="2"
      />
      {[LEFT_EYE_X, RIGHT_EYE_X].map((x) => (
        <circle
          key={x}
          cx={x}
          cy={EYE_LINE}
          r="6"
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
      ))}
    </>
  );
}

function Goggles({ color, accent }: Palette) {
  return (
    <>
      <path d={`M13 ${EYE_LINE - 1}h38`} stroke={accent} strokeWidth="2.2" />
      {[LEFT_EYE_X, RIGHT_EYE_X].map((x) => (
        <rect
          key={x}
          x={x - 6.5}
          y={EYE_LINE - 5}
          width="13"
          height="10"
          rx="4.5"
          fill={color}
          fillOpacity="0.75"
          stroke={accent}
          strokeWidth="1.8"
        />
      ))}
    </>
  );
}

function Stars({ color, accent }: Palette) {
  const star = "M0-7 2-2 7-2.2 3 1 4.5 6 0 3-4.5 6-3-1-7-2.2-2-2z";
  return (
    <>
      <path d={`M17 ${EYE_LINE - 1}h30`} stroke={color} strokeWidth="2" />
      {[LEFT_EYE_X, RIGHT_EYE_X].map((x) => (
        <path
          key={x}
          d={star}
          transform={`translate(${x} ${EYE_LINE})`}
          fill={color}
          stroke={accent || INK}
          strokeWidth="1.1"
        />
      ))}
    </>
  );
}

interface Palette {
  color: string;
  accent: string;
}

function palette(config: AvatarConfiguration): Palette {
  return layerPalette(config, "eyewearPalette");
}

export const EYEWEAR_ART: Record<
  string,
  (config: AvatarConfiguration) => ReactNode
> = {
  none: () => null,
  aviators: (config) => <Aviators {...palette(config)} />,
  round: (config) => <RoundGlasses {...palette(config)} />,
  goggles: (config) => <Goggles {...palette(config)} />,
  stars: (config) => <Stars {...palette(config)} />,
};
