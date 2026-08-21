import { normalizeAvatar } from "../avatar/config";
import type { AvatarConfiguration } from "../avatar/types";
import type { Player } from "../domain/types";
import type { ProjectedBoardPiece } from "./model";

function player(
  id: string,
  firstName: string,
  lastInitial: string,
  avatarColor: string,
): Player {
  return {
    id,
    firstName,
    lastInitial,
    initials: `${firstName[0]}${lastInitial[0]}`,
    avatarColor,
    weeklySessions: 0,
    effortPoints: 0,
    currentStreak: 0,
    consistency: 0,
  };
}

function avatar(options: AvatarConfiguration): AvatarConfiguration {
  return normalizeAvatar(options);
}

export const teamCanvasMock = {
  player: player("mason", "Mason", "C.", "#ff785a"),
  playerAvatar: avatar({
    head: "person-round",
    kit: "lime",
    hat: "cap",
    eyewear: "stars",
    effect: "orbit",
    headPalette: "#66d0ff:#302c61",
    kitPalette: "#183e2b:#c8f52a",
    hatPalette: "#ff785a:#241d3d",
    eyewearPalette: "#f3ad16:#241d3d",
    backgroundColor: "#dff7c5",
  }),
  team: {
    id: "team-hill-striders",
    name: "Hill Striders",
  },
  completers: [
    {
      player: player("player-ari", "Ari", "R.", "#4f7cff"),
      avatar: avatar({
        head: "person-curls",
        kit: "ocean",
        hat: "headband",
        eyewear: "round",
        effect: "pulse",
        headPalette: "#ffd36a:#583821",
        kitPalette: "#2768d8:#72d9ff",
        hatPalette: "#ff785a:#f7df7b",
        eyewearPalette: "#302c61:#66d0ff",
        backgroundColor: "#cfe6ff",
      }),
      x: 20,
      y: 22,
      starDayKeys: ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20"],
    },
    {
      player: player("player-elena", "Elena", "V.", "#9d62d8"),
      avatar: avatar({
        head: "person-tall",
        kit: "coral",
        hat: "beanie",
        eyewear: "aviators",
        effect: "none",
        headPalette: "#b98cff:#302c61",
        kitPalette: "#ff785a:#ffe27a",
        hatPalette: "#755ee8:#f5b8ff",
        eyewearPalette: "#241d3d:#f3ad16",
        backgroundColor: "#f1dcff",
      }),
      x: 73,
      y: 24,
      starDayKeys: ["2026-08-18", "2026-08-19", "2026-08-20"],
    },
    {
      player: player("player-noah", "Noah", "K.", "#e9a62d"),
      avatar: avatar({
        head: "cheetah",
        kit: "midnight",
        hat: "none",
        eyewear: "goggles",
        effect: "orbit",
        headPalette: "#f3ad16:#5f3218",
        kitPalette: "#161d4e:#66d0ff",
        hatPalette: "#302c61:#66d0ff",
        eyewearPalette: "#c8f52a:#241d3d",
        backgroundColor: "#fff0bd",
      }),
      x: 27,
      y: 56,
      starDayKeys: [
        "2026-08-16",
        "2026-08-17",
        "2026-08-18",
        "2026-08-19",
        "2026-08-20",
      ],
    },
    {
      player: player("player-zoe", "Zoe", "T.", "#2d9b77"),
      avatar: avatar({
        head: "fox",
        kit: "keeper",
        hat: "crown",
        eyewear: "none",
        effect: "pulse",
        headPalette: "#ff8c5a:#6d2f26",
        kitPalette: "#2d9b77:#bdf7dc",
        hatPalette: "#f3ad16:#fff0a6",
        eyewearPalette: "#302c61:#66d0ff",
        backgroundColor: "#cdeedb",
      }),
      x: 76,
      y: 61,
      starDayKeys: ["2026-08-19", "2026-08-20"],
    },
  ],
  pastedPieces: [
    {
      id: "team-stamp-1",
      asset: { id: "bolt", kind: "emoji", glyph: "⚡", label: "Bolt" },
      x: 45,
      y: 18,
      size: 38,
      rotation: -14,
      dayKey: "2026-08-19",
      status: "pasted",
      editable: false,
    },
    {
      id: "team-stamp-2",
      asset: { id: "star", kind: "emoji", glyph: "🌟", label: "Star" },
      x: 54,
      y: 63,
      size: 34,
      rotation: 12,
      dayKey: "2026-08-19",
      status: "pasted",
      editable: false,
    },
  ] satisfies ProjectedBoardPiece[],
  peerLivePieces: [
    {
      id: "peer-live-lion",
      asset: { id: "lion", kind: "emoji", glyph: "🦁", label: "Lion" },
      x: 14,
      y: 78,
      size: 42,
      rotation: -6,
      dayKey: "2026-08-20",
      status: "live",
      editable: false,
    },
    {
      id: "peer-live-rocket",
      asset: { id: "rocket", kind: "emoji", glyph: "🚀", label: "Rocket" },
      x: 82,
      y: 42,
      size: 36,
      rotation: 18,
      dayKey: "2026-08-20",
      status: "live",
      editable: false,
    },
  ] satisfies ProjectedBoardPiece[],
  extras: [
    { id: "ball-touches" as const, label: "Easy ball touches · 10 minutes" },
    { id: "easy-walk" as const, label: "Easy walk · 15 minutes" },
    { id: "mobility" as const, label: "Mobility routine · 8 minutes" },
  ],
} as const;
