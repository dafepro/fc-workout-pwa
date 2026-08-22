import { TeamCanvasWidget } from "../team-canvas/TeamCanvasWidget";
import { TeamRewardsPreview } from "./TeamRewardsPreview";

export function ConsolidatedTeam() {
  return (
    <div className="player-page player-page--team">
      <TeamRewardsPreview placement="team" />
      <TeamCanvasWidget />
    </div>
  );
}
