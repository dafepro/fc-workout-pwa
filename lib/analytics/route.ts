export const routeNames = [
  "home",
  "log",
  "team",
  "leaders",
  "me",
  "session_detail",
  "avatar_builder",
  "momentum",
  "progress",
  "plan",
  "plan_day",
  "prize_boxes",
  "prize_collection",
  "login",
  "unknown",
] as const;

export type RouteName = (typeof routeNames)[number];

const exactRoutes: Record<string, RouteName> = {
  "/": "home",
  "/log": "log",
  "/team": "team",
  "/leaders": "leaders",
  "/me": "me",
  "/me/avatar": "avatar_builder",
  "/momentum": "momentum",
  "/progress": "progress",
  "/plan": "plan",
  "/prizes": "prize_boxes",
  "/prizes/all": "prize_collection",
  "/login": "login",
};

export function canonicalRoute(pathname: string): RouteName {
  if (pathname.includes("?") || pathname.includes("#")) return "unknown";
  const exact = exactRoutes[pathname];
  if (exact) return exact;
  if (/^\/sessions\/[^/]+$/.test(pathname)) return "session_detail";
  if (/^\/plan\/[^/]+$/.test(pathname)) return "plan_day";
  return "unknown";
}
