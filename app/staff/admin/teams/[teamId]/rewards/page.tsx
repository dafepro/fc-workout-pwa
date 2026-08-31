import { requireOperator } from "../../../guard";
import { TeamRewardPanel } from "../../../../console/team/TeamRewardPanel";

export default async function OperatorTeamRewardPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireOperator();
  const { teamId } = await params;
  return <TeamRewardPanel teamId={teamId} />;
}
