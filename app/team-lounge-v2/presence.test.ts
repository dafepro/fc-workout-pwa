import { describe, expect, it } from "vitest";
import { defaultAvatar } from "../avatar/config";
import { mergeLoungePresence } from "./presence";

describe("Team Lounge V2 presence projection", () => {
  it("uses the Zoomigo roster for safe names and avatar art", () => {
    const mason = defaultAvatar();
    const result = mergeLoungePresence({
      currentPlayerID: "player-mason",
      roster: [
        {
          playerID: "player-mason",
          displayName: "Mason C.",
          avatarConfiguration: mason,
        },
      ],
      participants: [
        {
          participantId: "player-mason",
          avatarEntityId: "avatar:player-mason",
          status: "active",
        },
      ],
      projections: [
        {
          entityId: "avatar:player-mason",
          screen: { x: 120, y: 240 },
          visible: true,
          inViewport: true,
        },
      ],
    });

    expect(result).toEqual([
      {
        playerID: "player-mason",
        displayName: "You",
        accessibleName: "Mason C., you",
        current: true,
        avatarConfiguration: mason,
        screen: { x: 120, y: 240 },
      },
    ]);
  });

  it("omits unknown, disconnected, and off-screen participants", () => {
    const projection = {
      entityId: "avatar:player-outsider",
      screen: { x: 20, y: 40 },
      visible: true,
      inViewport: true,
    };
    expect(
      mergeLoungePresence({
        currentPlayerID: "player-mason",
        roster: [],
        participants: [
          {
            participantId: "player-outsider",
            avatarEntityId: projection.entityId,
            status: "active",
          },
        ],
        projections: [projection],
      }),
    ).toEqual([]);
  });
});
