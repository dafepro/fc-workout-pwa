import { requireOperator } from "../../guard";
import { AssignmentPanel } from "../../../console/team/AssignmentPanel";

export default async function OperatorTeamTrainingPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireOperator();
  const { teamId } = await params;
  return <AssignmentPanel teamId={teamId} />;
}
