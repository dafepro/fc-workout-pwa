"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

import { consoleCopy } from "./copy";

/**
 * SEC-4, REQ-509. What this wraps can never be produced again, so it opens over
 * the screen rather than somewhere in it -- a coach on a phone submitted the
 * form at the bottom of a scroll and the PIN appeared at the top, off-screen --
 * and it closes by exactly one path: tick the acknowledgement, then Done.
 * Escape and a tap outside are both refused, because both are things a thumb
 * does by accident while holding a phone at a practice.
 */
export function RevealDialog({
  acknowledgement,
  onDismiss,
  children,
}: {
  acknowledgement: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="console-dialog"
      aria-labelledby="reveal-dialog-title"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="console-dialog__body">
        {children}
        <label className="console-dialog__acknowledge">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          {acknowledgement}
        </label>
        <button
          type="button"
          className="button button--lime button--wide"
          disabled={!acknowledged}
          onClick={onDismiss}
        >
          {consoleCopy.reveal.done}
        </button>
      </div>
    </dialog>
  );
}
