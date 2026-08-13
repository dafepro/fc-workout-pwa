import { requireStaffSession } from "../../../guard";
import { routes } from "../../../../content/routes";
import { TeamProgress } from "../../../console/team/TeamProgress";

export default async function CoachTeamProgressPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireStaffSession();
  const { teamId } = await params;
  return <TeamProgress teamId={teamId} playerBase={routes.staffPlayers} />;
}
