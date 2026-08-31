import type { ReactNode } from "react";
import { layerPalette } from "../config";
import type { AvatarConfiguration } from "../types";
import { KIT_BODY_PATH } from "./kits";

function RareKitShell({
  body,
  accent,
  children,
}: {
  body: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <g className="avatar-kit avatar-kit--rare">
      <path className="avatar-kit__body" d={KIT_BODY_PATH} fill={body} />
      <path
        d="M3 65q8-5 15-6M61 65q-8-5-15-6"
        fill="none"
        stroke={accent}
        strokeWidth="4"
        opacity="0.8"
      />
      <path
        d="M21 47 27 45.5Q32 51 37 45.5L43 47Q39 55 32 56T21 47Z"
        fill={accent}
      />
      <path d="M27 47.5Q32 52 37 47.5L32 55Z" fill="white" opacity="0.88" />
      {children}
    </g>
  );
}

function NebulaArmor({ body, accent }: RarePalette) {
  return (
    <RareKitShell body={body} accent={accent}>
      <path
        d="M9 59 21 53l5 8-8 7-9-3zm46 0-12-6-5 8 8 7 9-3z"
        fill={accent}
        opacity="0.82"
      />
      <path d="M22 57h20l5 25H17z" fill="#17143d" opacity="0.62" />
      <path d="m32 58 5 7-5 10-5-10z" fill="#87e7ff" opacity="0.88" />
      <path
        d="M18 75q14-14 28 0"
        fill="none"
        stroke="#d49cff"
        strokeWidth="2.2"
      />
      <ellipse
        cx="32"
        cy="72"
        rx="13"
        ry="4.5"
        fill="none"
        stroke="#7fffd4"
        strokeWidth="1.2"
        strokeDasharray="2 3"
      />
      <circle cx="22" cy="63" r="1.4" fill="white" />
      <circle cx="42" cy="67" r="1.2" fill="#fff6a0" />
      <circle cx="25" cy="77" r="1" fill="#92f7ff" />
      <circle cx="40" cy="78" r="1.5" fill="white" />
      <path
        d="M13 62 7 58m44 4 6-4"
        stroke="#bdf5ff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </RareKitShell>
  );
}

function PhoenixFlight({ body, accent }: RarePalette) {
  return (
    <RareKitShell body={body} accent={accent}>
      <path
        d="M31.5 57c-8 3-12 9-12 17 4-4 7-5 10-5-5 5-5 9-2 13 2-5 4-7 6-9 1 4 3 7 6 9 1-5 0-9-4-13 4 0 7 2 10 5-1-9-5-14-14-17z"
        fill="#ff8b3d"
      />
      <path
        d="M32 61c-4 5-5 10-2 16 1-4 2-6 3-8 1 3 2 5 4 7 1-6-1-11-5-15z"
        fill="#fff09b"
      />
      <path
        d="M10 60q10 0 17 7-11-3-18 2zm44 0q-10 0-17 7 11-3 18 2z"
        fill={accent}
        opacity="0.88"
      />
      <path
        d="M7 66q9 1 15 7M57 66q-9 1-15 7"
        fill="none"
        stroke="#ffd46b"
        strokeWidth="2"
      />
      <path
        d="M12 75h8m24 0h8"
        stroke="#ffefbd"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="15" cy="58" r="1.5" fill="#fff3a8" />
      <circle cx="49" cy="58" r="1.5" fill="#fff3a8" />
    </RareKitShell>
  );
}

interface RarePalette {
  body: string;
  accent: string;
}

function palette(config: AvatarConfiguration): RarePalette {
  const { color, accent } = layerPalette(config, "kitPalette");
  return { body: color, accent };
}

export const RARE_KIT_ART: Record<
  string,
  (config: AvatarConfiguration) => ReactNode
> = {
  "nebula-armor": (config) => <NebulaArmor {...palette(config)} />,
  "phoenix-flight": (config) => <PhoenixFlight {...palette(config)} />,
};
