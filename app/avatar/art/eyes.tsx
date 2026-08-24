import type { ReactNode } from "react";
import { EYE_LINE, INK, LEFT_EYE_X, RIGHT_EYE_X } from "./geometry";

function BrightEyes() {
  return (
    <>
      {[LEFT_EYE_X, RIGHT_EYE_X].map((x) => (
        <g key={x}>
          <circle cx={x} cy={EYE_LINE} r="2.6" fill={INK} />
          <circle cx={x + 0.8} cy={EYE_LINE - 0.9} r="0.8" fill="white" />
        </g>
      ))}
    </>
  );
}

export const EYE_ART: Record<string, ReactNode> = {
  bright: <BrightEyes />,
  focus: (
    <g fill="none" stroke={INK} strokeLinecap="round" strokeWidth="2.2">
      <path d="M21.5 32.5q3.5 2 7 0" />
      <path d="M35.5 32.5q3.5 2 7 0" />
    </g>
  ),
  happy: (
    <g fill="none" stroke={INK} strokeLinecap="round" strokeWidth="2.2">
      <path d="M21.5 34q3.5-4 7 0" />
      <path d="M35.5 34q3.5-4 7 0" />
    </g>
  ),
};
