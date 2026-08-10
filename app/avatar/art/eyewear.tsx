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
      <path
        d={`M18.5 ${BROW}H45.5`}
        stroke={INK}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {[LEFT_EYE_X, RIGHT_EYE_X].map((x) => (
        <path
          key={x}
          d={`M${x - 6} ${BROW}h12v3q0 5.6-6 5.6t-6-5.6z`}
          fill={INK}
          opacity="0.85"
        />
      ))}
      <path
        d={`M${LEFT_EYE_X + 6} ${BROW + 1.2}h${RIGHT_EYE_X - LEFT_EYE_X - 12}`}
        stroke={INK}
        strokeWidth="1.6"
      />
    </>
  );
}

function RoundShades() {
  return (
    <>
      <path
        d={`M${LEFT_EYE_X - 6} ${EYE_LINE - 1}L14.5 ${EYE_LINE - 3.5}M${RIGHT_EYE_X + 6} ${EYE_LINE - 1}L49.5 ${EYE_LINE - 3.5}`}
        stroke="#f3ad16"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
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
          fill={INK}
          opacity="0.82"
          stroke="#f3ad16"
          strokeWidth="1.8"
        />
      ))}
    </>
  );
}

function SportVisor() {
  return (
    <>
      <path
        d={`M13 ${BROW + 1.5}Q32 ${BROW - 15} 51 ${BROW + 1.5}Z`}
        fill="#c8f52a"
      />
      <path
        d={`M13 ${BROW + 1.5}Q32 ${BROW - 15} 51 ${BROW + 1.5}`}
        stroke="#88bd00"
        strokeWidth="1.4"
        fill="none"
      />
      <rect
        x="12"
        y={BROW - 0.5}
        width="40"
        height="4.2"
        rx="2.1"
        fill="#88bd00"
      />
    </>
  );
}

export const EYEWEAR_ART: Record<string, ReactNode> = {
  none: null,
  aviators: <Aviators />,
  round: <RoundShades />,
  visor: <SportVisor />,
};
