import { describe, expect, it } from "vitest";
import { canonicalRoute } from "./route";

describe("canonicalRoute", () => {
  it.each([
    ["/", "home"],
    ["/log", "log"],
    ["/team", "team"],
    ["/leaders", "leaders"],
    ["/me", "me"],
    ["/me/avatar", "avatar_builder"],
    ["/momentum", "momentum"],
    ["/progress", "progress"],
    ["/plan", "plan"],
    ["/plan/2", "plan_day"],
    ["/prizes", "prize_boxes"],
    ["/prizes/all", "prize_collection"],
    ["/sessions/entry-secret", "session_detail"],
    ["/login", "login"],
  ] as const)("maps %s without retaining identifiers", (path, expected) => {
    expect(canonicalRoute(path)).toBe(expected);
  });

  it("does not preserve unknown paths, query strings, or fragments", () => {
    expect(canonicalRoute("/sessions/secret?token=private#pin")).toBe(
      "unknown",
    );
    expect(canonicalRoute("/staff/admin/players/player-secret")).toBe(
      "unknown",
    );
  });
});
