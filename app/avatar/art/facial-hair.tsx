import type { ReactNode } from "react";
import { INK } from "./geometry";

export const FACIAL_HAIR_ART: Record<string, ReactNode> = {
  none: null,
  mustache: (
    <path
      className="avatar-facial-hair--mustache"
      d="M32 41q-3.5-2.5-7 1 3.5 4.5 7 1 3.5 3.5 7-1-3.5-3.5-7-1z"
      fill={INK}
    />
  ),
  goatee: (
    <path
      className="avatar-facial-hair--goatee"
      d="M28.5 48.5q3.5 1.8 7 0l-1.1 5.8-2.4 2.4-2.4-2.4z"
      fill={INK}
      opacity="0.9"
    />
  ),
};
