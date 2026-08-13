import { requireStaffSession } from "../../../guard";
import { routes } from "../../../../content/routes";
import { RosterPanel } from "../../../console/team/RosterPanel";

export default async function CoachTeamRosterPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireStaffSession();
  const { teamId } = await params;
  return (
    <RosterPanel
      teamId={teamId}
      playerBase={routes.staffPlayers}
      operator={false}
    />
  );
}
