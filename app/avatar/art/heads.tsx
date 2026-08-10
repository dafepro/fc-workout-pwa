import type { ReactNode } from "react";
import { INK, LEFT_EYE_X, RIGHT_EYE_X, EYE_LINE } from "./geometry";

function Eyes({ radius = 2.7 }: { radius?: number }) {
  return (
    <>
      {[LEFT_EYE_X, RIGHT_EYE_X].map((x) => (
        <g key={x}>
          <circle cx={x} cy={EYE_LINE} r={radius} fill={INK} />
          <circle
            cx={x + 0.9}
            cy={EYE_LINE - 1}
            r={radius / 3}
            fill="white"
            opacity="0.9"
          />
        </g>
      ))}
    </>
  );
}

function DogHead() {
  return (
    <>
      <ellipse cx="13" cy="36" rx="6.5" ry="11" fill="#8a5427" />
      <ellipse cx="51" cy="36" rx="6.5" ry="11" fill="#8a5427" />
      <ellipse cx="32" cy="34" rx="18" ry="17.5" fill="#c98a45" />
      <path
        d="M32 16.5c6 0 11 3.4 13.6 8.4-3.8-2.6-8.4-4-13.6-4s-9.8 1.4-13.6 4c2.6-5 7.6-8.4 13.6-8.4z"
        fill="#8a5427"
      />
      <ellipse cx="32" cy="45" rx="10.5" ry="7.5" fill="#f4dcb8" />
      <ellipse cx="32" cy="42" rx="3.6" ry="2.8" fill={INK} />
      <path
        d="M32 45v2.6M32 47.6c-1.6 0-2.8-1-3.2-2M32 47.6c1.6 0 2.8-1 3.2-2"
        stroke={INK}
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
      <Eyes />
    </>
  );
}

function CheetahHead() {
  return (
    <>
      <circle cx="18.5" cy="20" r="6" fill="#e79f2c" />
      <circle cx="18.5" cy="20.5" r="3.2" fill="#f7d9a0" />
      <circle cx="45.5" cy="20" r="6" fill="#e79f2c" />
      <circle cx="45.5" cy="20.5" r="3.2" fill="#f7d9a0" />
      <ellipse cx="32" cy="34.5" rx="17.5" ry="17" fill="#f2b23c" />
      <g fill="#6b4416" opacity="0.75">
        <circle cx="19" cy="31" r="1.5" />
        <circle cx="17.5" cy="38" r="1.3" />
        <circle cx="22" cy="25" r="1.3" />
        <circle cx="45" cy="31" r="1.5" />
        <circle cx="46.5" cy="38" r="1.3" />
        <circle cx="42" cy="25" r="1.3" />
        <circle cx="32" cy="22.5" r="1.3" />
      </g>
      <ellipse cx="32" cy="44.5" rx="9.5" ry="7" fill="#fff3dc" />
      {/* The tear lines are the cheetah's signature, so they anchor to the shared
          eye line rather than to the muzzle. */}
      <path
        d={`M${LEFT_EYE_X - 1} ${EYE_LINE + 3}Q${LEFT_EYE_X - 1.5} ${EYE_LINE + 7} ${LEFT_EYE_X + 1.5} ${EYE_LINE + 9}`}
        stroke="#6b4416"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={`M${RIGHT_EYE_X + 1} ${EYE_LINE + 3}Q${RIGHT_EYE_X + 1.5} ${EYE_LINE + 7} ${RIGHT_EYE_X - 1.5} ${EYE_LINE + 9}`}
        stroke="#6b4416"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M28.6 42h6.8L32 45.4z" fill={INK} />
      <path
        d="M32 45.4v2.2"
        stroke={INK}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <Eyes />
    </>
  );
}

/** Deliberately not a naturalistic complexion: v1 ships one ZoomiGo-purple tone
 * for everyone so no player is asked to pick a skin color from four swatches. A
 * real, well-researched skin layer is deferred to its own change. */
function PlayerHead() {
  return (
    <>
      <ellipse cx="32" cy="35" rx="16" ry="16.5" fill="#a9b7ff" />
      <path
        d="M16.5 32c0-9 7-15 15.5-15s15.5 6 15.5 15c-2.5-4-7-6.5-15.5-6.5S19 28 16.5 32z"
        fill="#3b3268"
      />
      <rect x="15" y="27" width="34" height="4.5" rx="2.25" fill="#c8f52a" />
      <ellipse cx="32" cy="44" rx="6" ry="4" fill="#8f9de6" opacity="0.5" />
      <path
        d="M28.5 45.5c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <Eyes radius={2.4} />
    </>
  );
}

export const HEAD_ART: Record<string, ReactNode> = {
  dog: <DogHead />,
  cheetah: <CheetahHead />,
  player: <PlayerHead />,
};
