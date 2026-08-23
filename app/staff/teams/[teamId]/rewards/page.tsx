import { notFound } from "next/navigation";

import { devAccessEnabled } from "../../../../api/backend";
import { requireStaffSession } from "../../../guard";
import { TeamRewardsPrototype } from "../../../console/team/rewards/TeamRewardsPrototype";

export default async function CoachTeamRewardsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireStaffSession();
  if (!devAccessEnabled()) notFound();
  const { teamId } = await params;
  return <TeamRewardsPrototype teamId={teamId} connected />;
}
