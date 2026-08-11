import type { ReactNode } from "react";
import type { AvatarConfiguration } from "../types";
import { INK, LEFT_EYE_X, RIGHT_EYE_X, EYE_LINE } from "./geometry";

function Eyes() {
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

function Smile() {
  return (
    <path
      d="M27.5 43q4.5 5 9 0"
      fill="none"
      stroke={INK}
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  );
}

function RoundPerson({ primary, accent }: Palette) {
  return (
    <>
      <circle cx="32" cy="34" r="17.5" fill={primary} />
      <path d="M15 31q1-16 17-16t17 16q-7-7-17-7t-17 7z" fill={accent} />
      <ellipse cx="25" cy="39" rx="7" ry="5" fill="white" opacity="0.1" />
      <Eyes />
      <Smile />
    </>
  );
}

function TallPerson({ primary, accent }: Palette) {
  return (
    <>
      <ellipse cx="32" cy="34" rx="14.5" ry="19" fill={primary} />
      <path
        d="M17.5 29q2-16 14.5-16 13 0 14.5 16l-7-8-4 4-5-5-6 7z"
        fill={accent}
      />
      <path d="M20 37q12 5 24 0" stroke="white" strokeOpacity="0.12" />
      <Eyes />
      <Smile />
    </>
  );
}

function CurlyPerson({ primary, accent }: Palette) {
  return (
    <>
      <ellipse cx="32" cy="35" rx="17" ry="16.5" fill={primary} />
      {[18, 23, 29, 35, 41, 46].map((x, index) => (
        <circle key={x} cx={x} cy={index % 2 ? 18 : 20} r="6" fill={accent} />
      ))}
      <circle cx="17" cy="28" r="5" fill={accent} />
      <circle cx="47" cy="28" r="5" fill={accent} />
      <ellipse cx="39" cy="40" rx="7" ry="5" fill="white" opacity="0.1" />
      <Eyes />
      <Smile />
    </>
  );
}

function Dog({ primary, accent }: Palette) {
  return (
    <>
      <ellipse cx="13" cy="36" rx="6.5" ry="11" fill={accent} />
      <ellipse cx="51" cy="36" rx="6.5" ry="11" fill={accent} />
      <ellipse cx="32" cy="34" rx="18" ry="17.5" fill={primary} />
      <path d="M18 25q14-15 28 0-14-8-28 0z" fill={accent} />
      <ellipse cx="32" cy="45" rx="10.5" ry="7.5" fill="white" opacity="0.7" />
      <ellipse cx="32" cy="42" rx="3.6" ry="2.8" fill={INK} />
      <Eyes />
    </>
  );
}

function Cheetah({ primary, accent }: Palette) {
  return (
    <>
      <circle cx="18.5" cy="20" r="6" fill={primary} />
      <circle cx="45.5" cy="20" r="6" fill={primary} />
      <ellipse cx="32" cy="34.5" rx="17.5" ry="17" fill={primary} />
      <g fill={accent} opacity="0.75">
        {[19, 25, 32, 39, 45].map((x, index) => (
          <circle key={x} cx={x} cy={index % 2 ? 25 : 29} r="1.5" />
        ))}
      </g>
      <ellipse cx="32" cy="44.5" rx="9.5" ry="7" fill="white" opacity="0.72" />
      <path d="m28.6 42 3.4 3.4 3.4-3.4z" fill={accent} />
      <Eyes />
    </>
  );
}

function Fox({ primary, accent }: Palette) {
  return (
    <>
      <path d="M14 27 17 12l11 9zM50 27l-3-15-11 9z" fill={accent} />
      <ellipse cx="32" cy="35" rx="17.5" ry="17" fill={primary} />
      <path d="M18 29q14-12 28 0-14-6-28 0z" fill={accent} />
      <path
        d="M20 36q4 13 12 15 8-2 12-15-6 6-12 6t-12-6z"
        fill="white"
        opacity="0.78"
      />
      <path d="m28.7 42 3.3 3 3.3-3z" fill={INK} />
      <Eyes />
    </>
  );
}

interface Palette {
  primary: string;
  accent: string;
}

function palette(config: AvatarConfiguration): Palette {
  return {
    primary: config.avatarColor,
    accent: config.accentColor,
  };
}

export const HEAD_ART: Record<
  string,
  (config: AvatarConfiguration) => ReactNode
> = {
  "person-round": (config) => <RoundPerson {...palette(config)} />,
  "person-tall": (config) => <TallPerson {...palette(config)} />,
  "person-curls": (config) => <CurlyPerson {...palette(config)} />,
  dog: (config) => <Dog {...palette(config)} />,
  cheetah: (config) => <Cheetah {...palette(config)} />,
  fox: (config) => <Fox {...palette(config)} />,
};
