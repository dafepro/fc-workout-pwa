import { ReactNode } from "react";

import { requireOperator } from "../../guard";
import { routes } from "../../../../content/routes";
import { consoleCopy } from "../../../console/copy";
import { TeamShell } from "../../../console/team/TeamShell";
import { operatorSections } from "../../../console/team/sections";

export default async function OperatorTeamLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  await requireOperator();
  const { teamId } = await params;
  return (
    <TeamShell
      teamId={teamId}
      back={{ href: routes.staffAdminTeams, label: consoleCopy.teams.title }}
      sections={operatorSections(teamId)}
    >
      {children}
    </TeamShell>
  );
}
