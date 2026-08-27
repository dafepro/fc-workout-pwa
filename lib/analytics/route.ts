export const routeNames = [
  "home",
  "log",
  "team",
  "me",
  "session_detail",
  "avatar_builder",
  "login",
  "unknown",
] as const;

export type RouteName = (typeof routeNames)[number];

const exactRoutes: Record<string, RouteName> = {
  "/": "home",
  "/log": "log",
  "/team": "team",
  "/me": "me",
  "/me/avatar": "avatar_builder",
  "/login": "login",
};

export function canonicalRoute(pathname: string): RouteName {
  if (pathname.includes("?") || pathname.includes("#")) return "unknown";
  const exact = exactRoutes[pathname];
  if (exact) return exact;
  if (/^\/sessions\/[^/]+$/.test(pathname)) return "session_detail";
  return "unknown";
}
