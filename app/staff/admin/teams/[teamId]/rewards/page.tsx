import { notFound } from "next/navigation";

import { devAccessEnabled } from "../../../../../api/backend";
import { requireOperator } from "../../../guard";
import { TeamRewardsPrototype } from "../../../../console/team/rewards/TeamRewardsPrototype";

export default async function OperatorTeamRewardsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireOperator();
  if (!devAccessEnabled()) notFound();
  const { teamId } = await params;
  return <TeamRewardsPrototype teamId={teamId} connected />;
}
