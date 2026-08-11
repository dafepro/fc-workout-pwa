import type { ReactNode } from "react";
import { INK } from "./geometry";

type KitPattern = "bolt" | "stripe" | "hoops" | "keeper" | "split" | "classic";

function Kit({
  body,
  accent,
  secondary = body,
  pattern = "bolt",
}: {
  body: string;
  accent: string;
  secondary?: string;
  pattern?: KitPattern;
}) {
  return (
    <>
      <path
        d="M3 82V61c0-7 7-12.5 18-15.5h22C54 48.5 61 54 61 61v21z"
        fill={body}
        stroke={INK}
        strokeWidth="1.5"
      />
      <path
        d="M3 62q7-10 17-13v16H3zM61 62q-7-10-17-13v16h17z"
        fill={secondary}
      />
      <path d="M20 45.5 32 55l12-9.5z" fill={accent} />
      <path d="M27 47.5 32 54l5-6.5z" fill="white" opacity="0.9" />
      <KitPatternArt pattern={pattern} accent={accent} secondary={secondary} />
    </>
  );
}

function KitPatternArt({
  pattern,
  accent,
  secondary,
}: {
  pattern: KitPattern;
  accent: string;
  secondary: string;
}) {
  if (pattern === "stripe") {
    return <path d="M27 54h10v28H27z" fill={accent} opacity="0.9" />;
  }
  if (pattern === "hoops") {
    return (
      <>
        <path d="M17 58h30v5H17zM13 70h38v5H13z" fill={accent} opacity="0.9" />
      </>
    );
  }
  if (pattern === "keeper") {
    return (
      <>
        <path d="M17 56h30v21H17z" fill={accent} opacity="0.32" />
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
    return <path d="M32 54h18l5 28H32z" fill={secondary} opacity="0.95" />;
  }
  if (pattern === "classic") {
    return (
      <>
        <path d="m16 80 23-26h8L24 82z" fill={accent} opacity="0.9" />
        <path d="M10 73h44" stroke={secondary} strokeWidth="2" opacity="0.8" />
      </>
    );
  }
  return (
    <path d="m32 57-3.6 5.2h3.2L30 68l6-7.5h-3.4l1.6-3.5z" fill={accent} />
  );
}

export const KIT_ART: Record<string, ReactNode> = {
  violet: <Kit body="#6f5bd3" accent="#c8f52a" />,
  ocean: <Kit body="#3e70ee" accent="#7be3d2" pattern="stripe" />,
  coral: <Kit body="#ff806f" accent="#ffca63" />,
  lime: <Kit body="#c8f52a" accent="#6954ee" secondary="#a8da16" />,
  midnight: <Kit body="#24234f" accent="#a99af5" pattern="hoops" />,
  keeper: (
    <Kit body="#22a87a" accent="#c8f52a" secondary="#167e60" pattern="keeper" />
  ),
  sunset: (
    <Kit body="#ff806f" accent="#ffca63" secondary="#6954ee" pattern="split" />
  ),
  classic: (
    <Kit
      body="#f7f8ff"
      accent="#3e70ee"
      secondary="#cfd4e3"
      pattern="classic"
    />
  ),
};
