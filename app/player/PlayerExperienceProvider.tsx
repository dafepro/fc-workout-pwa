"use client";

import { MomentumAlphaProvider } from "../momentum-alpha/state";
import { TeamCanvasProvider } from "../team-canvas/state";
import { PlayerDevSettingsProvider } from "./dev/PlayerDevSettings";

export function PlayerExperienceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlayerDevSettingsProvider>
      <MomentumAlphaProvider>
        <TeamCanvasProvider>{children}</TeamCanvasProvider>
      </MomentumAlphaProvider>
    </PlayerDevSettingsProvider>
  );
}
