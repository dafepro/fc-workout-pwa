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
        state: "current",
      },
      {
        player: ava,
        position: { x: 80, y: 180 },
        current: false,
        state: "active",
      },
    ]);
  });

  it("moves a completed disconnected teammate to a stable bench position", () => {
    expect(
      resolveLoungeAvatarOverlays({
        currentPlayer: mason,
        roster: [
          mason,
          {
            ...ava,
            weeklySessions: 3,
            goalStatus: "completed",
            challengeCompleted: true,
          } as Player & {
            goalStatus: "completed";
            challengeCompleted: true;
          },
        ],
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
        benchProjections: [{ screen: { x: 32, y: 312 }, inViewport: true }],
      }),
    ).toEqual([
      {
        player: mason,
        position: { x: 120, y: 240 },
        current: true,
        state: "current",
      },
      {
        player: expect.objectContaining({ id: ava.id }),
        position: { x: 32, y: 312 },
        current: false,
        state: "bench",
      },
    ]);
  });

  it("does not bench a teammate who has not completed the work", () => {
    expect(
      resolveLoungeAvatarOverlays({
        currentPlayer: mason,
        roster: [mason, ava],
        participants: [],
        projections: [
          {
            entityId: `avatar:${mason.id}`,
            screen: { x: 120, y: 240 },
            inViewport: true,
          },
        ],
        benchProjections: [{ screen: { x: 32, y: 312 }, inViewport: true }],
      }),
    ).toEqual([
      {
        player: mason,
        position: { x: 120, y: 240 },
        current: true,
        state: "current",
      },
    ]);
  });

  it("does not invent a current-player overlay without a Canvas projection", () => {
    expect(
      resolveLoungeAvatarOverlays({
        currentPlayer: mason,
        roster: [mason],
        participants: [],
        projections: [],
      }),
    ).toEqual([]);
  });
});
