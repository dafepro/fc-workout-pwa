import type { ReactNode } from "react";
import { layerPalette } from "../config";
import type { AvatarConfiguration } from "../types";
import { INK } from "./geometry";

function PrismDragon({ primary, accent }: RarePalette) {
  return (
    <g className="avatar-head avatar-head--prism-dragon">
      <path d="M18 25 13 8l12 11zM46 25 51 8 39 19z" fill={accent} />
      <path d="m16 22-7-2 7 9zm32 0 7-2-7 9z" fill="#80f3ff" />
      <path
        d="M18 25 22 14l6 7 4-12 4 12 6-7 4 11z"
        fill="#c39cff"
        stroke={INK}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <ellipse cx="32" cy="35" rx="18" ry="17" fill={primary} />
      <path d="M17 30q15-13 30 0-15-6-30 0z" fill={accent} opacity="0.75" />
      <path d="m22 27 5-5 3 7zm20 0-5-5-3 7z" fill="#f7eeff" opacity="0.78" />
      <path
        d="M20 34q5-5 10 0-5 7-10 0zm24 0q-5-5-10 0 5 7 10 0z"
        fill="#fff5a6"
      />
      <circle cx="25" cy="34" r="2.2" fill={INK} />
      <circle cx="39" cy="34" r="2.2" fill={INK} />
      <ellipse cx="32" cy="44" rx="10" ry="7" fill={accent} opacity="0.38" />
      <circle cx="28" cy="43" r="1.3" fill={INK} />
      <circle cx="36" cy="43" r="1.3" fill={INK} />
      <path
        d="M27 48q5 4 10 0"
        fill="none"
        stroke={INK}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="m18 38-5 4 6 1zm28 0 5 4-6 1z" fill="#80f3ff" opacity="0.9" />
      <circle cx="22" cy="21" r="1.2" fill="white" />
      <circle cx="42" cy="21" r="1.2" fill="white" />
    </g>
  );
}

function MoonAxolotl({ primary, accent }: RarePalette) {
  const leftGills = ["M18 27 8 20", "M17 32 5 31", "M18 37 8 43"];
  const rightGills = ["M46 27 56 20", "M47 32 59 31", "M46 37 56 43"];
  return (
    <g className="avatar-head avatar-head--moon-axolotl">
      <g fill="none" stroke={accent} strokeWidth="4.5" strokeLinecap="round">
        {[...leftGills, ...rightGills].map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill="#ffc5f2">
        {[
          [7, 19],
          [5, 31],
          [8, 44],
          [57, 19],
          [59, 31],
          [56, 44],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.2" />
        ))}
      </g>
      <ellipse cx="32" cy="35" rx="18.5" ry="16.5" fill={primary} />
      <path d="M17 29q15-10 30 0-15-5-30 0z" fill={accent} opacity="0.34" />
      <circle cx="25" cy="34" r="3.2" fill={INK} />
      <circle cx="39" cy="34" r="3.2" fill={INK} />
      <circle cx="26" cy="33" r="1" fill="white" />
      <circle cx="40" cy="33" r="1" fill="white" />
      <path
        d="M27 42q5 5 10 0"
        fill="none"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="20" cy="39" r="2.8" fill="#ff89c6" opacity="0.5" />
      <circle cx="44" cy="39" r="2.8" fill="#ff89c6" opacity="0.5" />
      <path
        d="m32 18 1.5 3.3 3.5.4-2.6 2.4.7 3.5-3.1-1.8-3.1 1.8.7-3.5-2.6-2.4 3.5-.4z"
        fill="#fff6b0"
      />
      <circle cx="22" cy="24" r="1.2" fill="white" opacity="0.8" />
      <circle cx="42" cy="25" r="1.5" fill="white" opacity="0.65" />
    </g>
  );
}

interface RarePalette {
  primary: string;
  accent: string;
}

function palette(config: AvatarConfiguration): RarePalette {
  const { color, accent } = layerPalette(config, "headPalette");
  return { primary: color, accent };
}

export const RARE_HEAD_ART: Record<
  string,
  (config: AvatarConfiguration) => ReactNode
> = {
  "prism-dragon": (config) => <PrismDragon {...palette(config)} />,
  "moon-axolotl": (config) => <MoonAxolotl {...palette(config)} />,
};
