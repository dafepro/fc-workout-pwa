import type { ReactNode } from "react";
import { INK } from "./geometry";

export const FACIAL_HAIR_ART: Record<string, ReactNode> = {
  none: null,
  mustache: (
    <path
      d="M32 41q-3.5-2.5-7 1 3.5 4.5 7 1 3.5 3.5 7-1-3.5-3.5-7-1z"
      fill={INK}
    />
  ),
  goatee: (
    <path d="M28 42q4 2 8 0l-1.5 8-2.5 2-2.5-2z" fill={INK} opacity="0.9" />
  ),
};
