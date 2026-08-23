import { describe, expect, it } from "vitest";

import { allowsPlayerRoute } from "./routes";

describe("player API route allowlist", () => {
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
});
