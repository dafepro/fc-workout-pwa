import { routes } from "../../../content/routes";
import { consoleCopy } from "../copy";
import type { TeamSection } from "./TeamShell";

/**
 * The same three sections either persona sees, differing only in which route
 * tree they hang off. Kept in one place so a fourth (assessments) is a line
 * here rather than an edit in two layouts that can drift apart.
 */
export function coachSections(teamId: string): TeamSection[] {
  const sections: TeamSection[] = [
    { href: routes.staffTeam(teamId), label: consoleCopy.sections.training },
    {
      href: routes.staffTeamProgress(teamId),
      label: consoleCopy.sections.progress,
    },
    {
      href: routes.staffTeamRewards(teamId),
      label: consoleCopy.sections.reward,
    },
    {
      href: routes.staffTeamRoster(teamId),
      label: consoleCopy.sections.roster,
    },
  ];
  return sections;
}

export function operatorSections(teamId: string): TeamSection[] {
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
      href: routes.staffAdminTeamRewards(teamId),
      label: consoleCopy.sections.reward,
    },
    {
      href: routes.staffAdminTeamRoster(teamId),
      label: consoleCopy.sections.roster,
    },
  ];
  return sections;
}
