"use client";

import { consoleCopy, staffCopy } from "./copy";

import { useState } from "react";

/** Destructive console actions ask in the page rather than in a browser dialog,
 * so the question can say exactly what the action does and undoes. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  disabled,
  onConfirm,
}: {
  label: string;
  question: string;
  confirmLabel?: string;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        className="button button--danger-outline"
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="console-confirm" role="group" aria-label={label}>
      <p>{question}</p>
      <div className="console-actions">
        <button
          type="button"
          className="button button--danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              setAsking(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? staffCopy.working : (confirmLabel ?? label)}
        </button>
        <button
          type="button"
          className="button button--outline"
          disabled={busy}
          onClick={() => setAsking(false)}
        >
          {consoleCopy.cancel}
        </button>
      </div>
    </div>
  );
}
