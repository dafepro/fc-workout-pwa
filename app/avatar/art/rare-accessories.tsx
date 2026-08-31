import type { ReactNode } from "react";
import { layerPalette } from "../config";
import type { AvatarConfiguration } from "../types";
import { INK } from "./geometry";

function AstronautHelmet({ color, accent }: Palette) {
  return (
    <g className="avatar-hat avatar-hat--astronaut">
      <path
        d="M13 34q0-24 19-24t19 24"
        fill="none"
        stroke={INK}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M13 34q0-24 19-24t19 24"
        fill="none"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M17 31q1-16 15-16t15 16q-15-6-30 0z"
        fill="#8cecff"
        opacity="0.42"
        stroke={accent}
        strokeWidth="1.4"
      />
      <path
        d="M20 25q7-10 20-4"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        opacity="0.72"
        strokeLinecap="round"
      />
      <path d="M15 33h34v5H15z" fill={accent} />
      <rect x="25" y="11" width="14" height="4" rx="2" fill={accent} />
      <circle cx="29" cy="13" r="1" fill="#8dffb8" />
      <circle cx="33" cy="13" r="1" fill="#ffd66b" />
      <circle cx="37" cy="13" r="1" fill="#ff8ca8" />
      <rect x="11" y="26" width="5" height="9" rx="2" fill={accent} />
      <rect x="48" y="26" width="5" height="9" rx="2" fill={accent} />
    </g>
  );
}

function CrystalAntlers({ color, accent }: Palette) {
  return (
    <g className="avatar-hat avatar-hat--crystal-antlers">
      <path
        d="M17 31q15-8 30 0v6q-15-6-30 0z"
        fill={color}
        stroke={INK}
        strokeWidth="1.2"
      />
      <g
        fill="none"
        stroke={accent}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M23 29 16 19 13 8m5 12-8-2m7-5 6-7" />
        <path d="M41 29 48 19 51 8m-5 12 8-2m-7-5-6-7" />
      </g>
      <g fill="#b9f7ff" stroke={INK} strokeWidth="0.7">
        <path d="m10 18 3-5 3 5-3 4z" />
        <path d="m20 8 3-5 3 5-3 4z" />
        <path d="m48 18 3-5 3 5-3 4z" />
        <path d="m38 8 3-5 3 5-3 4z" />
        <path d="m29 27 3-8 3 8-3 6z" fill="#d7b4ff" />
      </g>
      <circle cx="21" cy="31" r="1.5" fill="white" />
      <circle cx="43" cy="31" r="1.5" fill="white" />
    </g>
  );
}

function HologramVisor({ color, accent }: Palette) {
  return (
    <g className="avatar-eyewear avatar-eyewear--hologram-visor">
      <path
        d="M14 31q18-7 36 0l-3 13q-15 5-30 0z"
        fill={color}
        opacity="0.64"
        stroke={accent}
        strokeWidth="1.6"
      />
      <path
        d="M17 34h30M18 38h28M20 42h24"
        stroke="#d8fbff"
        strokeWidth="0.8"
        opacity="0.72"
      />
      <circle
        cx="24"
        cy="37"
        r="5"
        fill="none"
        stroke="#80ffdb"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <circle
        cx="40"
        cy="37"
        r="5"
        fill="none"
        stroke="#ff9dea"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <circle cx="24" cy="37" r="1.4" fill="#80ffdb" />
      <circle cx="40" cy="37" r="1.4" fill="#ff9dea" />
      <path
        d="M14 33 9 30m41 3 5-3"
        stroke={accent}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="m31 31 1-4 1 4" fill="none" stroke="white" strokeWidth="1.2" />
    </g>
  );
}

function ClockworkGoggles({ color, accent }: Palette) {
  const teeth = [0, 45, 90, 135] as const;
  return (
    <g className="avatar-eyewear avatar-eyewear--clockwork">
      <path
        d="M11 34h42"
        stroke={accent}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {[23, 41].map((cx) => (
        <g key={cx}>
          {teeth.map((angle) => (
            <rect
              key={angle}
              x={cx - 1}
              y="27"
              width="2"
              height="4"
              rx="0.5"
              fill={accent}
              transform={`rotate(${angle} ${cx} 37)`}
            />
          ))}
          <circle
            cx={cx}
            cy="37"
            r="8"
            fill={accent}
            stroke={INK}
            strokeWidth="1.2"
          />
          <circle cx={cx} cy="37" r="5.5" fill={color} opacity="0.78" />
          <path
            d={`M${cx - 3} 35q3-3 6 0`}
            fill="none"
            stroke="white"
            strokeWidth="1.2"
            opacity="0.75"
          />
          <circle cx={cx} cy="37" r="1.4" fill="#ffe078" />
        </g>
      ))}
      <path d="M31 36q1-2 2 0" fill="none" stroke={INK} strokeWidth="1.4" />
    </g>
  );
}

interface Palette {
  color: string;
  accent: string;
}

function palette(
  config: AvatarConfiguration,
  key: "hatPalette" | "eyewearPalette",
): Palette {
  return layerPalette(config, key);
}

export const RARE_HAT_ART: Record<
  string,
  (config: AvatarConfiguration) => ReactNode
> = {
  astronaut: (config) => <AstronautHelmet {...palette(config, "hatPalette")} />,
  "crystal-antlers": (config) => (
    <CrystalAntlers {...palette(config, "hatPalette")} />
  ),
};

export const RARE_EYEWEAR_ART: Record<
  string,
  (config: AvatarConfiguration) => ReactNode
> = {
  "hologram-visor": (config) => (
    <HologramVisor {...palette(config, "eyewearPalette")} />
  ),
  clockwork: (config) => (
    <ClockworkGoggles {...palette(config, "eyewearPalette")} />
  ),
};
