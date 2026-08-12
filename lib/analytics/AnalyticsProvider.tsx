"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { createAnalyticsClient, type AnalyticsClient } from "./client";
import { canonicalRoute } from "./route";

const AnalyticsContext = createContext<AnalyticsClient | null>(null);
const idleAfterMs = 60_000;

export function AnalyticsProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const client = useMemo(
    () =>
      createAnalyticsClient({
        enabled,
        send: async (batch) => {
          await fetch("/api/metrics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(batch),
            keepalive: true,
          });
        },
      }),
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    client.track("app_visit_started", {
      display_mode: window.matchMedia("(display-mode: standalone)").matches
        ? "standalone"
        : "browser",
      viewport:
        window.innerWidth < 640
          ? "small"
          : window.innerWidth < 1024
            ? "medium"
            : "large",
      online: navigator.onLine,
    });
    const installed = () => {
      client.track("app_installed", {});
      void client.flush();
    };
    const online = () =>
      client.track("connectivity_changed", { state: "online" });
    const offline = () =>
      client.track("connectivity_changed", { state: "offline" });
    window.addEventListener("appinstalled", installed);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const timer = window.setTimeout(() => void client.flush(), 5_000);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      void client.flush();
    };
  }, [client, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let startedAt = Date.now();
    let lastActiveAt = startedAt;
    const markActive = () => {
      if (document.visibilityState === "visible") lastActiveAt = Date.now();
    };
    for (const eventName of ["pointerdown", "keydown", "scroll"] as const) {
      window.addEventListener(eventName, markActive, { passive: true });
    }
    const summarize = () => {
      const activeMs = Math.max(
        0,
        Math.min(Date.now(), lastActiveAt + idleAfterMs) - startedAt,
      );
      startedAt = Date.now();
      lastActiveAt = startedAt;
      if (activeMs === 0) return;
      client.track("route_summary", {
        route: canonicalRoute(pathname),
        active_ms: Math.min(600_000, activeMs),
        views: 1,
      });
    };
    const summarizeWhenHidden = () => {
      if (document.visibilityState === "hidden") summarize();
    };
    document.addEventListener("visibilitychange", summarizeWhenHidden);
    window.addEventListener("pagehide", summarize);
    return () => {
      for (const eventName of ["pointerdown", "keydown", "scroll"] as const) {
        window.removeEventListener(eventName, markActive);
      }
      document.removeEventListener("visibilitychange", summarizeWhenHidden);
      window.removeEventListener("pagehide", summarize);
      summarize();
      void client.flush();
    };
  }, [client, enabled, pathname]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") void client.flush();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [client]);

  return (
    <AnalyticsContext.Provider value={client}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsClient {
  const client = useContext(AnalyticsContext);
  if (!client) {
    throw new Error("useAnalytics must be used inside AnalyticsProvider");
  }
  return client;
}
