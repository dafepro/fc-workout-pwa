import { requireStaffSession } from "../../../guard";
import { TeamRewardsPrototype } from "../../../console/team/rewards/TeamRewardsPrototype";

export default async function CoachTeamRewardsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireStaffSession();
  const { teamId } = await params;
  return <TeamRewardsPrototype teamId={teamId} connected />;
}
