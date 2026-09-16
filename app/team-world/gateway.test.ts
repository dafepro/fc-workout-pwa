import { describe, expect, it } from "vitest";
import { parseWorldTicket } from "./gateway";

describe("Team World credentials", () => {
  const valid = {
    ticket: "a".repeat(43),
    teamId: "one",
    roomId: "world-v3-" + "a".repeat(64),
    relayUrl: "wss://world.example.test/room",
    expiresInSeconds: 30,
  };
  it("accepts a bounded room-scoped ticket", () => {
    expect(parseWorldTicket(valid, "one")).toEqual(valid);
  });
  it.each([
    { ...valid, teamId: "other" },
    { ...valid, roomId: "team:one:world:v3" },
    { ...valid, relayUrl: "https://world.example.test/room" },
    { ...valid, relayUrl: "ws://world.example.test/room" },
    { ...valid, relayUrl: "wss://secret@world.example.test/room" },
    { ...valid, relayUrl: "wss://world.example.test/room?token=secret" },
    { ...valid, ticket: "" },
    { ...valid, expiresInSeconds: 3600 },
  ])("rejects a mismatched or unsafe credential", (value) => {
    expect(() => parseWorldTicket(value, "one")).toThrow();
  });
});
