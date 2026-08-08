import { requireOperator } from "../../guard";
import { PlayerRepair } from "./PlayerRepair";

export default async function PlayerRepairPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  await requireOperator();
  const { playerId } = await params;
  return <PlayerRepair playerId={playerId} />;
}
