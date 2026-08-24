import type { ReactNode } from "react";
import { INK } from "./geometry";

export const MOUTH_ART: Record<string, ReactNode> = {
  smile: (
    <path
      d="M27.5 43q4.5 5 9 0"
      fill="none"
      stroke={INK}
      strokeLinecap="round"
      strokeWidth="1.6"
    />
  ),
  grin: (
    <path
      d="M26.5 42q5.5 7 11 0-1 7-5.5 7t-5.5-7z"
      fill="white"
      stroke={INK}
      strokeLinejoin="round"
      strokeWidth="1.4"
    />
  ),
  calm: (
    <path
      d="M28 45q4 1.4 8 0"
      fill="none"
      stroke={INK}
      strokeLinecap="round"
      strokeWidth="1.8"
    />
  ),
};
