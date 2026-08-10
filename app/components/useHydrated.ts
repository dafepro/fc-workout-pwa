"use client";

import { useSyncExternalStore } from "react";

// Never changes after the first client render, so it never needs to notify.
const neverChanges = () => () => {};

/**
 * Reports whether React has taken over the server-rendered markup.
 *
 * A form whose only real submit path is an `onSubmit` handler is not usable
 * until that handler exists. Gating its submit control on this keeps an early
 * click from falling through to the browser's own submission, which navigates
 * and sends nothing the app asked for.
 */
export function useHydrated(): boolean {
  // The server snapshot is the value React renders into HTML; the client
  // snapshot is what it uses once hydrating. The difference is the signal.
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}
