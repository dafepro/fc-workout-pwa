import { ReactNode } from "react";

import { requireStaffSession } from "../../guard";
import { routes } from "../../../content/routes";
import { consoleCopy } from "../../console/copy";
import { TeamShell } from "../../console/team/TeamShell";
import { coachSections } from "../../console/team/sections";

export default async function CoachTeamLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  await requireStaffSession();
  const { teamId } = await params;
  return (
    <TeamShell
      teamId={teamId}
      back={{ href: routes.staffConsoleHome, label: consoleCopy.home.teams }}
      sections={coachSections(teamId)}
    >
      {children}
    </TeamShell>
  );
}
