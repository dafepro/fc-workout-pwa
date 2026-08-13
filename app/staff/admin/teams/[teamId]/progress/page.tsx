import { requireOperator } from "../../../guard";
import { routes } from "../../../../../content/routes";
import { TeamProgress } from "../../../../console/team/TeamProgress";

export default async function OperatorTeamProgressPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireOperator();
  const { teamId } = await params;
  return <TeamProgress teamId={teamId} playerBase={routes.staffAdminPlayers} />;
}
