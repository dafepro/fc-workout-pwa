import { copy } from "../content/copy";

export function LoadError({
  message,
  onRetry,
  busy = false,
}: {
  message: string;
  onRetry(): void;
  busy?: boolean;
}) {
  return (
    <div className="notice notice--error load-error" role="alert">
      <p>{message}</p>
      <button
        type="button"
        className="button button--outline"
        disabled={busy}
        onClick={onRetry}
      >
        {busy ? "Loading…" : copy.recovery.retry}
      </button>
    </div>
  );
}
