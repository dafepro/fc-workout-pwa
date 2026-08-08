import { requireOperator } from "../../guard";
import { TeamRoster } from "./TeamRoster";

export default async function TeamRosterPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireOperator();
  const { teamId } = await params;
  return <TeamRoster teamId={teamId} />;
}
