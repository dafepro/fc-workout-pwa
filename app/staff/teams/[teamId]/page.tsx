import { requireStaffSession } from "../../guard";
import { LegacyAssignmentHistory } from "../../console/team/LegacyAssignmentHistory";
import { TrainingPlanPrototype } from "../../console/team/training-plans/TrainingPlanPrototype";

/** Training is the landing section because the published plan is the coach's
 * primary way to shape the team's next activity. */
export default async function CoachTeamTrainingPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireStaffSession();
  const { teamId } = await params;
  return (
    <>
      <TrainingPlanPrototype teamId={teamId} />
      <LegacyAssignmentHistory teamId={teamId} />
    </>
  );
}
