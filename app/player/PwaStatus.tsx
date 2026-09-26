"use client";
import { qualityCopy } from "../content/quality-copy";

import { useEffect, useState } from "react";
import { useHasPlayerDrafts } from "../state/player-drafts";

/** Updates are explicit: another tab accepting an update never reloads this form. */
export function PwaStatus() {
  const [offline, setOffline] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const dirty = useHasPlayerDrafts();
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const inspect = () => {
      if (active && registration?.waiting) setWaiting(registration.waiting);
    };
    const updateFound = () => {
      installing?.removeEventListener("statechange", inspect);
      installing = registration?.installing ?? null;
      installing?.addEventListener("statechange", inspect);
    };
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js?v=6", { updateViaCache: "none" })
        .then((value) => {
          if (!active) return;
          registration = value;
          inspect();
          updateFound();
          registration.addEventListener("updatefound", updateFound);
          void registration.update().catch(() => undefined);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      registration?.removeEventListener("updatefound", updateFound);
      installing?.removeEventListener("statechange", inspect);
    };
  }, []);
  function update() {
    if (dirty || !waiting) return;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  }
  return (
    <>
      {offline ? (
        <div className="pwa-status" role="status">
          {qualityCopy.offline}
        </div>
      ) : null}
      {waiting ? (
        <div className="pwa-status" role="status">
          <span>
            {dirty ? qualityCopy.updateDraft : qualityCopy.updateReady}
          </span>
          <button
            className="button button--outline"
            disabled={dirty}
            onClick={update}
          >
            {qualityCopy.update}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function InstallHelp() {
  return (
    <details className="install-help">
      <summary>{qualityCopy.install}</summary>
      <p>{qualityCopy.installSteps}</p>
      <p>{qualityCopy.connectionNeeded}</p>
    </details>
  );
}
