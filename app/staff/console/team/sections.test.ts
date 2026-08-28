import { describe, expect, it } from "vitest";

import { routes } from "../../../content/routes";
import { coachSections, operatorSections } from "./sections";

describe("team console sections", () => {
  it("keeps Team Reward out of production navigation", () => {
    expect(coachSections("team-1")).toHaveLength(3);
    expect(operatorSections("team-1")).toHaveLength(3);
  });

  it("restores Team Reward in both development staff portals", () => {
    expect(coachSections("team-1", true)).toContainEqual({
      href: routes.staffTeamRewards("team-1"),
      label: "Team Reward",
    });
    expect(operatorSections("team-1", true)).toContainEqual({
      href: routes.staffAdminTeamRewards("team-1"),
      label: "Team Reward",
    });
  });
});
