import { describe, expect, it } from "vitest";

import { allowsPlayerRoute } from "./routes";

describe("player API route allowlist", () => {
  it("allows only the player Daily Drop contract", () => {
    expect(allowsPlayerRoute("GET", "v1/me/daily-drop")).toBe(true);
    expect(allowsPlayerRoute("POST", "v1/me/daily-drop/claim")).toBe(true);
    expect(allowsPlayerRoute("GET", "v1/me/prize-boxes")).toBe(true);
    expect(allowsPlayerRoute("POST", "v1/me/prize-boxes/claim-daily")).toBe(
      true,
    );
    expect(
      allowsPlayerRoute("POST", "v1/me/prize-boxes/prize-box-one/open"),
    ).toBe(true);
    expect(allowsPlayerRoute("GET", "v1/me/unlocks")).toBe(true);
    expect(
      allowsPlayerRoute("POST", "v1/me/unlocks/avatar-head-dog/viewed"),
    ).toBe(true);

    expect(allowsPlayerRoute("POST", "v1/me/daily-drop")).toBe(false);
    expect(allowsPlayerRoute("GET", "v1/me/daily-drop/claim")).toBe(false);
    expect(allowsPlayerRoute("DELETE", "v1/me/unlocks/avatar-head-dog")).toBe(
      false,
    );
  });

  it("allows the current team reward and its protected image", () => {
    expect(allowsPlayerRoute("GET", "v1/teams/team-one/reward")).toBe(true);
    expect(
      allowsPlayerRoute(
        "GET",
        "v1/teams/team-one/reward-media/reward-media-one",
      ),
    ).toBe(true);
  });

  it("does not broaden reward access", () => {
    expect(
      allowsPlayerRoute("POST", "v1/teams/team-one/reward-media/media-one"),
    ).toBe(false);
    expect(allowsPlayerRoute("GET", "v1/staff/teams/team-one/rewards")).toBe(
      false,
    );
  });

  it("allows the Canvas socket contract but not retired live transports", () => {
    expect(allowsPlayerRoute("GET", "v1/teams/team-one/canvas")).toBe(true);
    expect(
      allowsPlayerRoute("POST", "v1/teams/team-one/canvas/socket-ticket"),
    ).toBe(true);
    expect(allowsPlayerRoute("GET", "v1/teams/team-one/canvas/events")).toBe(
      false,
    );
    expect(allowsPlayerRoute("PUT", "v1/teams/team-one/canvas/avatar")).toBe(
      false,
    );
  });
});
