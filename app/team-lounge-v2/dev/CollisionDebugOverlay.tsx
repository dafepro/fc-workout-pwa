import { beachBoardwalkCanvas } from "../scene/beach-boardwalk";

export function CollisionDebugOverlay() {
  return (
    <svg
      className="team-lounge-v2__collision-map"
      viewBox="0 0 100 150"
      aria-label="Development collision map"
    >
      {beachBoardwalkCanvas.staticGeometry.map((geometry) => {
        const rotation = `${((geometry.rotation ?? 0) * 180) / Math.PI} ${geometry.position.x} ${geometry.position.y}`;
        if (geometry.shape.type === "circle") {
          return (
            <circle
              key={geometry.id}
              cx={geometry.position.x}
              cy={geometry.position.y}
              r={geometry.shape.radius}
            />
          );
        }
        if (geometry.shape.type !== "rect") return null;
        return (
          <rect
            key={geometry.id}
            x={geometry.position.x - geometry.shape.width / 2}
            y={geometry.position.y - geometry.shape.height / 2}
            width={geometry.shape.width}
            height={geometry.shape.height}
            rx={1.2}
            transform={`rotate(${rotation})`}
          />
        );
      })}
    </svg>
  );
}
