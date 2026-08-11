import type { ReactNode } from "react";
import { layerPalette } from "../config";
import type { AvatarConfiguration } from "../types";
import { INK } from "./geometry";

export const HAT_ART: Record<
  string,
  (config: AvatarConfiguration) => ReactNode
> = {
  none: () => null,
  cap: (config) => {
    const { color, accent } = layerPalette(config, "hatPalette");
    return (
      <>
        <path
          d="M16 25q2-13 16-13t16 13z"
          fill={color}
          stroke={INK}
          strokeWidth="1.4"
        />
        <path
          d="M31 24q13-3 22 3-12 3-22 1z"
          fill={accent}
          stroke={INK}
          strokeWidth="1.2"
        />
      </>
    );
  },
  beanie: (config) => {
    const { color, accent } = layerPalette(config, "hatPalette");
    return (
      <>
        <path
          d="M17 27q0-15 15-15t15 15z"
          fill={color}
          stroke={INK}
          strokeWidth="1.4"
        />
        <rect x="16" y="24" width="32" height="7" rx="3.5" fill={accent} />
        <circle cx="32" cy="10" r="4" fill={accent} />
      </>
    );
  },
  headband: (config) => {
    const { color } = layerPalette(config, "hatPalette");
    return (
      <path
        d="M13 25q19-8 38 0v5q-19-7-38 0z"
        fill={color}
        stroke={INK}
        strokeWidth="1.3"
      />
    );
  },
  crown: (config) => {
    const { color, accent } = layerPalette(config, "hatPalette");
    return (
      <path
        d="m17 27-3-15 11 7 7-12 7 12 11-7-3 15z"
        fill={color}
        stroke={accent}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    );
  },
};
