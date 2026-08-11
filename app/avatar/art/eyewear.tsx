import type { ReactNode } from "react";
import { EYE_LINE, INK, LEFT_EYE_X, RIGHT_EYE_X } from "./geometry";

const BROW = EYE_LINE - 3.5;

function Aviators() {
  return (
    <>
      <path
        d={`M18 ${BROW + 0.5}L14 ${BROW + 2.2}M46 ${BROW + 0.5}L50 ${BROW + 2.2}`}
        stroke={INK}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <path d={`M18.5 ${BROW}H45.5`} stroke={INK} strokeWidth="1.8" />
      {[LEFT_EYE_X, RIGHT_EYE_X].map((x) => (
        <path
          key={x}
          d={`M${x - 6} ${BROW}h12v3q0 5.6-6 5.6t-6-5.6z`}
          fill={INK}
          opacity="0.85"
        />
      ))}
    </>
  );
}

function RoundGlasses() {
  return (
    <>
      <path
        d={`M${LEFT_EYE_X + 6} ${EYE_LINE}h${RIGHT_EYE_X - LEFT_EYE_X - 12}`}
        stroke="#f3ad16"
        strokeWidth="2"
      />
      {[LEFT_EYE_X, RIGHT_EYE_X].map((x) => (
        <circle
          key={x}
          cx={x}
          cy={EYE_LINE}
          r="6"
          fill="none"
          stroke="#f3ad16"
          strokeWidth="2"
        />
      ))}
    </>
  );
}

function AquaGoggles() {
  return (
    <>
      <path d={`M13 ${EYE_LINE - 1}h38`} stroke="#184d72" strokeWidth="2.2" />
      {[LEFT_EYE_X, RIGHT_EYE_X].map((x) => (
        <rect
          key={x}
          x={x - 6.5}
          y={EYE_LINE - 5}
          width="13"
          height="10"
          rx="4.5"
          fill="#70e2f2"
          fillOpacity="0.75"
          stroke="#184d72"
          strokeWidth="1.8"
        />
      ))}
    </>
  );
}

function StarGlasses() {
  const star = "M0-7 2-2 7-2.2 3 1 4.5 6 0 3-4.5 6-3-1-7-2.2-2-2z";
  return (
    <>
      <path d={`M17 ${EYE_LINE - 1}h30`} stroke="#f3ad16" strokeWidth="2" />
      {[LEFT_EYE_X, RIGHT_EYE_X].map((x) => (
        <path
          key={x}
          d={star}
          transform={`translate(${x} ${EYE_LINE})`}
          fill="#f3ad16"
          stroke={INK}
          strokeWidth="1.1"
        />
      ))}
    </>
  );
}

export const EYEWEAR_ART: Record<string, ReactNode> = {
  none: null,
  aviators: <Aviators />,
  round: <RoundGlasses />,
  goggles: <AquaGoggles />,
  stars: <StarGlasses />,
};
