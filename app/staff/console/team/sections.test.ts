import { describe, expect, it } from "vitest";

import { routes } from "../../../content/routes";
import { coachSections, operatorSections } from "./sections";

describe("team console sections", () => {
  it("keeps the reward prototype out of a production section list", () => {
    expect(
      coachSections("team-1").some(
        (section) => section.href === routes.staffTeamRewards("team-1"),
      ),
    ).toBe(false);
  });

  it("adds the reward workspace for both dev staff route trees", () => {
    expect(coachSections("team-1", true)).toContainEqual({
      href: routes.staffTeamRewards("team-1"),
      label: "Rewards",
    });
    expect(operatorSections("team-1", true)).toContainEqual({
      href: routes.staffAdminTeamRewards("team-1"),
      label: "Rewards",
    });
  });
});
