import { requireOperator } from "../../../guard";
import { routes } from "../../../../../content/routes";
import { RosterPanel } from "../../../../console/team/RosterPanel";

export default async function OperatorTeamRosterPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireOperator();
  const { teamId } = await params;
  return (
    <RosterPanel
      teamId={teamId}
      playerBase={routes.staffAdminPlayers}
      operator
    />
  );
}
