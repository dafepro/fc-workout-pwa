export type LoungeLoadingScene = "beach" | "starlight";

export function LoungeLoading({
  label,
  overlay = false,
  scene = "beach",
}: {
  label: string;
  overlay?: boolean;
  scene?: LoungeLoadingScene;
}) {
  return (
    <div
      className={`team-lounge-loading${overlay ? " team-lounge-loading--overlay" : ""}`}
      data-scene={scene}
      role="status"
    >
      <span className="team-lounge-loading__sprite" aria-hidden="true" />
      <span className="team-lounge-loading__label">{label}</span>
    </div>
  );
}
