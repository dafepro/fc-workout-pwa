"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useOptionalAuth } from "../../state/auth-context";
import type { MomentumProgressState } from "../momentum-progress";

export type TodayPreview = "real" | "training" | "rest" | "complete";
export type TeamAccessPreview = "real" | "locked";
export type TeamLoungeVersion = "v1" | "v2";

export interface PlayerDevSettings {
  momentumVisible: boolean;
  momentumBand: "real" | MomentumProgressState;
  today: TodayPreview;
  teamAccess: TeamAccessPreview;
  teamLoungeVersion: TeamLoungeVersion;
  rewardsVisible: boolean;
}

interface PlayerDevSettingsContextValue {
  enabled: boolean;
  settings: PlayerDevSettings;
  update(patch: Partial<PlayerDevSettings>): void;
  reset(): void;
}

const STORAGE_KEY = "zoomigo-player-dev-settings-v1";
export const defaultPlayerDevSettings: PlayerDevSettings = {
  momentumVisible: true,
  momentumBand: "real",
  today: "real",
  teamAccess: "real",
  teamLoungeVersion: "v1",
  rewardsVisible: true,
};

const PlayerDevSettingsContext =
  createContext<PlayerDevSettingsContextValue | null>(null);

export function PlayerDevSettingsProvider({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const auth = useOptionalAuth();
  const runtimeEnabled =
    enabled ??
    auth?.developerControlsEnabled ??
    process.env.NODE_ENV !== "production";
  const [settings, setSettings] = useState(() => loadSettings(runtimeEnabled));

  const value = useMemo<PlayerDevSettingsContextValue>(
    () => ({
      enabled: runtimeEnabled,
      settings,
      update(patch) {
        if (!runtimeEnabled) return;
        setSettings((current) => {
          const next = { ...current, ...patch };
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Storage is optional; controls still work for this page load.
          }
          return next;
        });
      },
      reset() {
        if (!runtimeEnabled) return;
        setSettings(defaultPlayerDevSettings);
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // Storage is optional; the in-memory reset still succeeds.
        }
      },
    }),
    [runtimeEnabled, settings],
  );

  return (
    <PlayerDevSettingsContext.Provider value={value}>
      {children}
    </PlayerDevSettingsContext.Provider>
  );
}

export function usePlayerDevSettings(): PlayerDevSettingsContextValue {
  const value = useContext(PlayerDevSettingsContext);
  if (!value) {
    throw new Error(
      "usePlayerDevSettings must be used inside PlayerDevSettingsProvider",
    );
  }
  return value;
}

function parseSettings(raw: string): PlayerDevSettings {
  const parsed = JSON.parse(raw) as Partial<PlayerDevSettings>;
  const momentumBands = ["real", "ready", "started", "building", "on-a-roll"];
  const todayValues = ["real", "training", "rest", "complete"];
  const teamAccessValues = ["real", "locked"];
  const teamLoungeVersions = ["v1", "v2"];
  return {
    momentumVisible:
      typeof parsed.momentumVisible === "boolean"
        ? parsed.momentumVisible
        : defaultPlayerDevSettings.momentumVisible,
    momentumBand: momentumBands.includes(parsed.momentumBand ?? "")
      ? (parsed.momentumBand as PlayerDevSettings["momentumBand"])
      : defaultPlayerDevSettings.momentumBand,
    today: todayValues.includes(parsed.today ?? "")
      ? (parsed.today as TodayPreview)
      : defaultPlayerDevSettings.today,
    teamAccess: teamAccessValues.includes(parsed.teamAccess ?? "")
      ? (parsed.teamAccess as TeamAccessPreview)
      : defaultPlayerDevSettings.teamAccess,
    teamLoungeVersion: teamLoungeVersions.includes(
      parsed.teamLoungeVersion ?? "",
    )
      ? (parsed.teamLoungeVersion as TeamLoungeVersion)
      : defaultPlayerDevSettings.teamLoungeVersion,
    rewardsVisible:
      typeof parsed.rewardsVisible === "boolean"
        ? parsed.rewardsVisible
        : defaultPlayerDevSettings.rewardsVisible,
  };
}

function loadSettings(enabled: boolean): PlayerDevSettings {
  if (!enabled || typeof window === "undefined")
    return defaultPlayerDevSettings;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? parseSettings(stored) : defaultPlayerDevSettings;
  } catch {
    return defaultPlayerDevSettings;
  }
}
