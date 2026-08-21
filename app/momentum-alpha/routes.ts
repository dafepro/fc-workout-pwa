import { routes } from "../content/routes";

export const momentumAlphaRoutes = {
  today: routes.momentumAlphaPrefix,
  team: `${routes.momentumAlphaPrefix}/team`,
  me: `${routes.momentumAlphaPrefix}/me`,
} as const;
