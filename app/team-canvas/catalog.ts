import type { StampAsset } from "./model";

export const TEAM_CANVAS_STAMPS: readonly StampAsset[] = [
  { id: "bolt", kind: "emoji", glyph: "⚡", label: "Bolt" },
  { id: "fire", kind: "emoji", glyph: "🔥", label: "Fire" },
  { id: "star", kind: "emoji", glyph: "🌟", label: "Star" },
  { id: "rocket", kind: "emoji", glyph: "🚀", label: "Rocket" },
  { id: "lion", kind: "emoji", glyph: "🦁", label: "Lion" },
  { id: "cheetah", kind: "emoji", glyph: "🐆", label: "Cheetah" },
  { id: "shield", kind: "emoji", glyph: "🛡️", label: "Shield" },
  { id: "target", kind: "emoji", glyph: "🎯", label: "Target" },
  { id: "soccer", kind: "emoji", glyph: "⚽", label: "Soccer ball" },
  { id: "rainbow", kind: "emoji", glyph: "🌈", label: "Rainbow" },
  { id: "strong", kind: "emoji", glyph: "💪", label: "Strong" },
  { id: "runner", kind: "emoji", glyph: "🏃", label: "Runner" },
  { id: "eagle", kind: "emoji", glyph: "🦅", label: "Eagle" },
  { id: "party", kind: "emoji", glyph: "🎉", label: "Celebration" },
  { id: "sparkles", kind: "emoji", glyph: "✨", label: "Sparkles" },
  {
    id: "spark-cleat",
    kind: "image",
    src: "/team-canvas/stamps/spark-cleat.png",
    alt: "Spark cleat",
  },
  {
    id: "zoomigo-mark",
    kind: "image",
    src: "/favicon.svg",
    alt: "ZoomiGo mark",
  },
];

export const TEAM_CANVAS_BACKGROUNDS = [
  { id: "grass-gradient", label: "Grass glow", src: null },
  {
    id: "soccer-field",
    label: "Soccer field",
    src: "/team-canvas/backgrounds/soccer-field.png",
  },
  {
    id: "creature-quest-town",
    label: "Creature Quest Town",
    src: "/team-canvas/backgrounds/creature-quest-town.png",
  },
  {
    id: "cosmic-stadium",
    label: "Cosmic stadium",
    src: "/team-canvas/backgrounds/cosmic-stadium.png",
  },
  { id: "tactics-board", label: "Coach’s tactics board", src: null },
] as const;

export const TEAM_CANVAS_TEXT_STYLES = [
  { id: "block", label: "Block" },
  { id: "rally", label: "Rally" },
  { id: "speed", label: "Speed" },
  { id: "outline", label: "Outline" },
  { id: "bubble", label: "Bubble" },
] as const;

export function teamCanvasStamp(assetID: string): StampAsset {
  return (
    TEAM_CANVAS_STAMPS.find(({ id }) => id === assetID) ?? TEAM_CANVAS_STAMPS[0]
  );
}

export function teamCanvasBackground(assetID: string): string | null {
  return TEAM_CANVAS_BACKGROUNDS.find(({ id }) => id === assetID)?.src ?? null;
}
