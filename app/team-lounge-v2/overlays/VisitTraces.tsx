import { memo } from "react";
import { AvatarArt } from "../../avatar/AvatarArt";
import type { AvatarConfiguration } from "../../avatar/types";
import type { LoungeVisitTraceOverlay } from "../visit-traces";

const VisitAvatarArt = memo(function VisitAvatarArt({
  config,
}: {
  config: AvatarConfiguration;
}) {
  return <AvatarArt config={config} />;
});

export function VisitTraces({
  traces,
}: {
  traces: readonly LoungeVisitTraceOverlay[];
}) {
  return (
    <div className="team-lounge-v2__visit-traces">
      {traces.map((trace) => (
        <div
          key={trace.playerID}
          className="team-lounge-v2__visit-trace"
          role="img"
          aria-label={trace.accessibleName}
          style={{
            transform: `translate3d(${trace.screen.x}px, ${trace.screen.y}px, 0) translate(-50%, -50%)`,
          }}
        >
          <span className="team-lounge-v2__visit-footprints" aria-hidden>
            ••
          </span>
          <span className="team-lounge-v2__visit-avatar" aria-hidden>
            <VisitAvatarArt config={trace.avatarConfiguration} />
          </span>
          <span className="team-lounge-v2__visit-name" aria-hidden>
            {trace.displayName} visited
          </span>
        </div>
      ))}
    </div>
  );
}
