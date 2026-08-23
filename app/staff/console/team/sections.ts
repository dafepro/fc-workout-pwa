import { routes } from "../../../content/routes";
import { consoleCopy } from "../copy";
import type { TeamSection } from "./TeamShell";

/**
 * Both personas see the same team jobs, differing only in which route tree they
 * hang off. Dev-only prototypes are inserted here so the two layouts cannot
 * drift apart.
 */
export function coachSections(
  teamId: string,
  rewardsEnabled = false,
): TeamSection[] {
  const sections: TeamSection[] = [
    { href: routes.staffTeam(teamId), label: consoleCopy.sections.training },
    {
      href: routes.staffTeamProgress(teamId),
      label: consoleCopy.sections.progress,
    },
    {
      href: routes.staffTeamRoster(teamId),
      label: consoleCopy.sections.roster,
    },
  ];
  if (rewardsEnabled) {
    sections.splice(2, 0, {
      href: routes.staffTeamRewards(teamId),
      label: consoleCopy.sections.rewards,
    });
  }
  return sections;
}

export function operatorSections(
  teamId: string,
  rewardsEnabled = false,
): TeamSection[] {
  const sections: TeamSection[] = [
    {
      href: routes.staffAdminTeam(teamId),
      label: consoleCopy.sections.training,
    },
    {
      href: routes.staffAdminTeamProgress(teamId),
      label: consoleCopy.sections.progress,
    },
    {
      href: routes.staffAdminTeamRoster(teamId),
      label: consoleCopy.sections.roster,
    },
  ];
  if (rewardsEnabled) {
    sections.splice(2, 0, {
      href: routes.staffAdminTeamRewards(teamId),
      label: consoleCopy.sections.rewards,
    });
  }
  return sections;
}
