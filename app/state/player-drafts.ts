"use client";

import { useCallback, useSyncExternalStore } from "react";

const PREFIX = "zoomigo-draft:v1:";
const OWNER = "zoomigo-draft-owner:v1";
const lifetime = 2 * 60 * 60 * 1000;
const memory = new Map<string, { expires: number; value: unknown }>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const empty = () => null;

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function readPlayerDraft<T>(
  key: string,
  valid: (value: unknown) => value is T,
): T | null {
  try {
    const saved =
      memory.get(key) ?? JSON.parse(storage()?.getItem(PREFIX + key) ?? "null");
    if (!saved || saved.expires <= Date.now() || !valid(saved.value)) {
      memory.delete(key);
      storage()?.removeItem(PREFIX + key);
      return null;
    }
    memory.set(key, saved);
    return saved.value;
  } catch {
    return null;
  }
}

export function writePlayerDraft(key: string, value: unknown) {
  const saved = { expires: Date.now() + lifetime, value };
  memory.set(key, saved);
  try {
    storage()?.setItem(PREFIX + key, JSON.stringify(saved));
  } catch {
    /* Memory recovery still works when storage is full. */
  }
  notify();
}

export function removePlayerDraft(key: string) {
  memory.delete(key);
  try {
    storage()?.removeItem(PREFIX + key);
  } catch {
    /* Restricted storage. */
  }
  notify();
}

export function clearPlayerDrafts() {
  memory.clear();
  try {
    const store = storage();
    if (store)
      for (const key of Object.keys(store))
        if (key.startsWith(PREFIX) || key === OWNER) store.removeItem(key);
  } catch {
    /* Restricted storage. */
  }
  notify();
}

let owner: string | null = null;
export function activateDraftOwner(next: string) {
  let previous = owner;
  try {
    previous ??= storage()?.getItem(OWNER) ?? null;
  } catch {
    /* Memory ownership still works when storage is restricted. */
  }
  const player = next.split("/")[0];
  if (previous && previous.split("/")[0] !== player) clearPlayerDrafts();
  owner = player;
  try {
    storage()?.setItem(OWNER, player);
  } catch {
    /* Restricted storage. */
  }
}

export function usePlayerDraft<T>(
  key: string,
  valid: (value: unknown) => value is T,
) {
  const get = useCallback(() => readPlayerDraft(key, valid), [key, valid]);
  const value = useSyncExternalStore(subscribe, get, empty);
  return {
    value,
    set: (next: T) => writePlayerDraft(key, next),
    clear: () => removePlayerDraft(key),
  };
}

export function useHasPlayerDrafts() {
  return useSyncExternalStore(subscribe, hasPlayerDrafts, () => false);
}

function hasPlayerDrafts() {
  const now = Date.now();
  if ([...memory.values()].some((entry) => entry.expires > now)) return true;
  try {
    const store = storage();
    if (!store) return false;
    for (const key of Object.keys(store)) {
      if (!key.startsWith(PREFIX)) continue;
      try {
        const saved = JSON.parse(store.getItem(key) ?? "null");
        if (
          saved &&
          typeof saved.expires === "number" &&
          Number.isFinite(saved.expires) &&
          saved.expires > now &&
          Object.hasOwn(saved, "value")
        )
          return true;
      } catch {
        /* One malformed draft must not hide the remaining stored edits. */
      }
    }
  } catch {
    /* Restricted storage leaves the memory fallback available. */
  }
  return false;
}
