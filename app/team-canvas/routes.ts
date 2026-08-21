import type { TeamCanvasState } from "./model";

export const teamCanvasRoutes = {
  today: "/team-canvas",
  team: "/team-canvas/team",
  me: "/team-canvas/me",
} as const;

export function entryRouteFor(state: TeamCanvasState): string {
  return state.primaryComplete ? teamCanvasRoutes.team : teamCanvasRoutes.today;
}
