"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { routes } from "../../content/routes";
import { ConsoleError, consoleRequest, messageFor } from "./api";

interface Resource<T> {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => void;
}

/** One loader for every console list, so an expired session lands everyone back
 * at the door rather than on a screen full of failures. */
export function useResource<T>(path: string): Resource<T> {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{
    key: string;
    data: T | null;
    error: string;
  } | null>(null);

  // Whether a load is in flight is derived rather than stored, so the effect
  // never has to set state synchronously to announce that it started.
  const key = `${attempt}:${path}`;

  useEffect(() => {
    let active = true;
    consoleRequest<T>(path).then(
      (value) => {
        if (active) setSettled({ key, data: value, error: "" });
      },
      (caught: unknown) => {
        if (!active) return;
        if (caught instanceof ConsoleError && caught.signedOut) {
          router.replace(routes.staffSignIn);
          return;
        }
        setSettled({ key, data: null, error: messageFor(caught) });
      },
    );
    return () => {
      active = false;
    };
  }, [key, path, router]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  const fresh = settled?.key === key;
  return {
    // A reload keeps the previous rows on screen rather than blanking the page.
    data: settled?.data ?? null,
    error: fresh ? settled.error : "",
    loading: !fresh,
    reload,
  };
}
