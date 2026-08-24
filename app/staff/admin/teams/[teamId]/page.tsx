import { requireOperator } from "../../guard";
import { LegacyAssignmentHistory } from "../../../console/team/LegacyAssignmentHistory";
import { TrainingPlanPrototype } from "../../../console/team/training-plans/TrainingPlanPrototype";

export default async function OperatorTeamTrainingPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireOperator();
  const { teamId } = await params;
  return (
    <>
      <TrainingPlanPrototype teamId={teamId} />
      <LegacyAssignmentHistory teamId={teamId} />
    </>
  );
}
