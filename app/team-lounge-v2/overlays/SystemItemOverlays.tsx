import type { CSSProperties } from "react";

export interface LoungeSystemItemOverlay {
  entityID: string;
  kind: "beach-ball";
  rotation: number;
  scale: number;
  screen: Readonly<{ x: number; y: number }>;
}

export function SystemItemOverlays({
  items,
}: {
  items: readonly LoungeSystemItemOverlay[];
}) {
  return (
    <div className="team-lounge-v2__system-item-overlays">
      {items.map(({ entityID, kind, rotation, scale, screen }) => (
        <span
          key={entityID}
          className={`team-lounge-v2__system-item team-lounge-v2__system-item--${kind}`}
          role="img"
          aria-label="Beach ball"
          style={
            {
              transform: `translate3d(${screen.x}px, ${screen.y}px, 0) translate(-50%, -50%) rotate(${rotation}rad)`,
              "--system-item-scale": scale,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
