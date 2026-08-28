import { requireOperator } from "../../guard";
import { devAccessEnabled } from "../../../../api/backend";
import { AssignmentPanel } from "../../../console/team/AssignmentPanel";
import { LegacyAssignmentHistory } from "../../../console/team/LegacyAssignmentHistory";
import { TrainingPlanBuilder } from "../../../console/team/training-plans/TrainingPlanBuilder";

export default async function OperatorTeamTrainingPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireOperator();
  const { teamId } = await params;
  if (!devAccessEnabled()) return <AssignmentPanel teamId={teamId} />;
  return (
    <>
      <TrainingPlanBuilder teamId={teamId} />
      <LegacyAssignmentHistory teamId={teamId} />
    </>
  );
}
