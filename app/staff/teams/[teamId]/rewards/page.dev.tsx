import { TeamRewardPanel } from "../../../console/team/TeamRewardPanel.dev";

export default async function CoachTeamRewardPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return <TeamRewardPanel teamId={teamId} />;
}
