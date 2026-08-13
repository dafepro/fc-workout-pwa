import { requireStaffSession } from "../../guard";
import { AssignmentPanel } from "../../console/team/AssignmentPanel";

/** Training is the landing section: the live assignment and who has completed
 * it is the question a coach opens the team to answer. */
export default async function CoachTeamTrainingPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireStaffSession();
  const { teamId } = await params;
  return <AssignmentPanel teamId={teamId} />;
}
