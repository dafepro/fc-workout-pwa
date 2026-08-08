import { requireStaffSession } from "../../guard";
import { routes } from "../../../content/routes";
import { consoleCopy } from "../../console/copy";
import { PlayerRepair } from "../../admin/players/[playerId]/PlayerRepair";

export default async function CoachPlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  await requireStaffSession();
  const { playerId } = await params;
  return (
    <PlayerRepair
      playerId={playerId}
      backHref={routes.staffConsoleHome}
      backLabel={consoleCopy.home.teams}
    />
  );
}
