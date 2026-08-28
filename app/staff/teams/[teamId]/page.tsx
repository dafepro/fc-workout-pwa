import { requireStaffSession } from "../../guard";
import { devAccessEnabled } from "../../../api/backend";
import { AssignmentPanel } from "../../console/team/AssignmentPanel";
import { LegacyAssignmentHistory } from "../../console/team/LegacyAssignmentHistory";
import { TrainingPlanBuilder } from "../../console/team/training-plans/TrainingPlanBuilder";

/** Training is the landing section: the live assignment and who has completed
 * it is the question a coach opens the team to answer. */
export default async function CoachTeamTrainingPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireStaffSession();
  const { teamId } = await params;
  if (!devAccessEnabled()) return <AssignmentPanel teamId={teamId} />;
  return (
    <>
      <TrainingPlanBuilder teamId={teamId} />
      <LegacyAssignmentHistory teamId={teamId} />
    </>
  );
}
