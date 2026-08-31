import { describe, expect, it } from "vitest";

import { routes } from "../../../content/routes";
import { coachSections, operatorSections } from "./sections";

describe("team console sections", () => {
  it("ships Team Reward in both production staff portals", () => {
    expect(coachSections("team-1")).toContainEqual({
      href: routes.staffTeamRewards("team-1"),
      label: "Team Reward",
    });
    expect(operatorSections("team-1")).toContainEqual({
      href: routes.staffAdminTeamRewards("team-1"),
      label: "Team Reward",
    });
  });
});
