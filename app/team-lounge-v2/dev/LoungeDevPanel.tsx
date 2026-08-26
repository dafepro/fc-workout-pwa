import type { RuntimeDiagnostics } from "@canvas-physics/client";

export function LoungeDevPanel({
  diagnostics,
  showCollisionMap,
  onShowCollisionMapChange,
}: {
  diagnostics: RuntimeDiagnostics | null;
  showCollisionMap: boolean;
  onShowCollisionMapChange(value: boolean): void;
}) {
  return (
    <details className="team-lounge-v2__dev-panel">
      <summary>
        Lounge diagnostics <span>DEV</span>
      </summary>
      <label>
        <input
          type="checkbox"
          checked={showCollisionMap}
          onChange={(event) =>
            onShowCollisionMapChange(event.currentTarget.checked)
          }
        />
        Show collision map
      </label>
      {diagnostics ? (
        <dl>
          <div>
            <dt>Role</dt>
            <dd>{diagnostics.isHost ? "Host" : "Peer"}</dd>
          </div>
          <div>
            <dt>Render</dt>
            <dd>{Math.round(diagnostics.renderFps)} fps</dd>
          </div>
          <div>
            <dt>Simulation</dt>
            <dd>{Math.round(diagnostics.simulationHz)} Hz</dd>
          </div>
          <div>
            <dt>Correction</dt>
            <dd>{diagnostics.reconcileError.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Sync buffer</dt>
            <dd>{diagnostics.interpolationDepth} frames</dd>
          </div>
          <div>
            <dt>Extrapolated</dt>
            <dd>{diagnostics.extrapolations}</dd>
          </div>
        </dl>
      ) : (
        <p>Waiting for a presented frame…</p>
      )}
    </details>
  );
}
