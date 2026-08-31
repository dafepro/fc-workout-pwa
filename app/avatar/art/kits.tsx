import type { ReactNode } from "react";
import { layerPalette } from "../config";
import type { AvatarConfiguration } from "../types";

export const KIT_BODY_PATH =
  "M3 82V61Q3 52 21 47L27 45.5Q32 51 37 45.5L43 47Q61 52 61 61V82Z";
import { INK } from "./geometry";

type KitPattern =
  | "bolt"
  | "stripe"
  | "chevron"
  | "diagonal"
  | "hoops"
  | "keeper"
  | "split"
  | "classic"
  | "checkers"
  | "starburst";

function Kit({
  body,
  accent,
  pattern = "bolt",
}: {
  body: string;
  accent: string;
  pattern?: KitPattern;
}) {
  return (
    <>
      <path
        className="avatar-kit__body"
        d={KIT_BODY_PATH}
        fill={body}
        stroke={INK}
        strokeWidth="1.5"
      />
      <path
        d="M3 61Q3 52 21 47v18H3zM61 61Q61 52 43 47v18h18z"
        fill={accent}
        opacity="0.3"
      />
      <path
        d="M21 47 27 45.5Q32 51 37 45.5L43 47Q39 55 32 56T21 47Z"
        fill={accent}
      />
      <path d="M27 47.5Q32 52 37 47.5L32 55Z" fill="white" opacity="0.88" />
      <KitPatternArt pattern={pattern} accent={accent} />
    </>
  );
}

function KitPatternArt({
  pattern,
  accent,
}: {
  pattern: KitPattern;
  accent: string;
}) {
  if (pattern === "stripe") {
    return <path d="M27 55h10v27H27z" fill={accent} opacity="0.9" />;
  }
  if (pattern === "hoops") {
    return (
      <path d="M17 58h30v5H17zM13 70h38v5H13z" fill={accent} opacity="0.9" />
    );
  }
  if (pattern === "chevron") {
    return (
      <path d="m14 59 18 9 18-9v6l-18 9-18-9z" fill={accent} opacity="0.9" />
    );
  }
  if (pattern === "diagonal") {
    return <path d="m16 82 23-27h9L25 82z" fill={accent} opacity="0.9" />;
  }
  if (pattern === "keeper") {
    return (
      <>
        <path d="M17 56h30v21H17z" fill={accent} opacity="0.3" />
        <path
          d="M22 60h20v13H22z"
          fill="none"
          stroke={accent}
          strokeWidth="1.8"
        />
        <circle cx="32" cy="66.5" r="3" fill={accent} />
      </>
    );
  }
  if (pattern === "split") {
    return <path d="M32 55h18l5 27H32z" fill={accent} opacity="0.72" />;
  }
  if (pattern === "classic") {
    return (
      <>
        <path d="m16 80 23-25h8L24 82z" fill={accent} opacity="0.9" />
        <path d="M10 73h44" stroke={accent} strokeWidth="2" opacity="0.55" />
      </>
    );
  }
  if (pattern === "checkers") {
    return (
      <g fill={accent} opacity="0.9">
        <path d="M17 57h8v8h-8zm16 0h8v8h-8zm-8 8h8v8h-8zm16 0h8v8h-8zm-24 8h8v8h-8zm16 0h8v8h-8z" />
      </g>
    );
  }
  if (pattern === "starburst") {
    return (
      <path
        d="m32 56 2.6 7 7.4-2.4-4.2 6.4 6.2 4.5-7.7.2L36 79l-4-6.2-4 6.2-.3-7.3-7.7-.2 6.2-4.5-4.2-6.4 7.4 2.4z"
        fill={accent}
        opacity="0.92"
      />
    );
  }
  return (
    <path d="m32 57-3.6 5.2h3.2L30 68l6-7.5h-3.4l1.6-3.5z" fill={accent} />
  );
}

function renderKit(config: AvatarConfiguration, pattern: KitPattern = "bolt") {
  const { color, accent } = layerPalette(config, "kitPalette");
  return <Kit body={color} accent={accent} pattern={pattern} />;
}

export const KIT_ART: Record<
  string,
  (config: AvatarConfiguration) => ReactNode
> = {
  violet: (config) => renderKit(config),
  ocean: (config) => renderKit(config, "stripe"),
  coral: (config) => renderKit(config, "chevron"),
  lime: (config) => renderKit(config, "diagonal"),
  midnight: (config) => renderKit(config, "hoops"),
  keeper: (config) => renderKit(config, "keeper"),
  sunset: (config) => renderKit(config, "split"),
  classic: (config) => renderKit(config, "classic"),
  checkers: (config) => renderKit(config, "checkers"),
  starburst: (config) => renderKit(config, "starburst"),
};
