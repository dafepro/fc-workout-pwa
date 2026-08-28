import { describe, expect, it } from "vitest";

import type { Player } from "../domain/types";
import { resolveLoungeAvatarOverlays } from "./lounge-presence";

const mason: Player = {
  id: "player-mason",
  firstName: "Mason",
  lastInitial: "C.",
  initials: "MC",
  avatarColor: "#6e56cf",
  weeklySessions: 1,
  effortPoints: 4,
  currentStreak: 1,
  consistency: 1,
};

const ava: Player = {
  ...mason,
  id: "player-ava",
  firstName: "Ava",
  lastInitial: "R.",
  initials: "AR",
};

describe("Lounge presence projection", () => {
  it("keeps the signed-in player visible when presence temporarily omits them", () => {
    expect(
      resolveLoungeAvatarOverlays({
        currentPlayer: mason,
        roster: [mason, ava],
        participants: [
          {
            userId: ava.id,
            avatarEntityId: `avatar:${ava.id}`,
            status: "active",
          },
        ],
        projections: [
          {
            entityId: `avatar:${mason.id}`,
            screen: { x: 120, y: 240 },
            inViewport: true,
          },
          {
            entityId: `avatar:${ava.id}`,
            screen: { x: 80, y: 180 },
            inViewport: true,
          },
        ],
      }),
    ).toEqual([
      {
        player: mason,
        position: { x: 120, y: 240 },
        current: true,
      },
      {
        player: ava,
        position: { x: 80, y: 180 },
        current: false,
      },
    ]);
  });

  it("does not show a disconnected teammate from a retained avatar entity", () => {
    expect(
      resolveLoungeAvatarOverlays({
        currentPlayer: mason,
        roster: [mason, ava],
        participants: [
          {
            userId: ava.id,
            avatarEntityId: `avatar:${ava.id}`,
            status: "disconnected",
          },
        ],
        projections: [
          {
            entityId: `avatar:${mason.id}`,
            screen: { x: 120, y: 240 },
            inViewport: true,
          },
          {
            entityId: `avatar:${ava.id}`,
            screen: { x: 80, y: 180 },
            inViewport: true,
          },
        ],
      }),
    ).toEqual([
      {
        player: mason,
        position: { x: 120, y: 240 },
        current: true,
      },
    ]);
  });

  it("uses the current-player fallback while Canvas rebuilds local projection", () => {
    expect(
      resolveLoungeAvatarOverlays({
        currentPlayer: mason,
        roster: [mason],
        participants: [],
        projections: [],
        currentAvatarProjection: {
          screen: { x: 128, y: 256 },
          inViewport: true,
        },
      }),
    ).toEqual([
      {
        player: mason,
        position: { x: 128, y: 256 },
        current: true,
      },
    ]);
  });
});
