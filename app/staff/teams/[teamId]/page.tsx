import { requireStaffSession } from "../../guard";
import { routes } from "../../../content/routes";
import { consoleCopy } from "../../console/copy";
import { TeamRoster } from "../../admin/teams/[teamId]/TeamRoster";

export default async function CoachTeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  await requireStaffSession();
  const { teamId } = await params;
  return (
    <TeamRoster
      teamId={teamId}
      backHref={routes.staffConsoleHome}
      backLabel={consoleCopy.home.teams}
      playerHref={routes.staffPlayer}
      operator={false}
    />
  );
}
