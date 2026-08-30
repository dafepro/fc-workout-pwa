"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "../components/useHydrated";

export function PrizeDialog({
  children,
  labelledBy,
  onClose,
  restoreFocusTo,
}: {
  children: ReactNode;
  labelledBy: string;
  onClose(): void;
  restoreFocusTo?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const host = useHydrated() ? document.body : null;

  useEffect(() => {
    if (!host || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    dialog
      .querySelector<HTMLElement>(
        "[autofocus], button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      )
      ?.focus();
    return () => {
      if (restoreFocusTo) {
        document.getElementById(restoreFocusTo)?.focus();
      } else if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected
      ) {
        previousFocus.focus();
      }
    };
  }, [host, restoreFocusTo]);

  if (!host) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="prize-dialog"
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="prize-dialog__panel">{children}</div>
    </dialog>,
    host,
  );
}
