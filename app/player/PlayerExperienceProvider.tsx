"use client";

import { MomentumAlphaProvider } from "../momentum-alpha/state";
import { TeamCanvasProvider } from "../team-canvas/state";

export function PlayerExperienceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MomentumAlphaProvider>
      <TeamCanvasProvider>{children}</TeamCanvasProvider>
    </MomentumAlphaProvider>
  );
}
