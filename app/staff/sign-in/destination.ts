import { routes } from "../../content/routes";

export function staffSignInDestination(devAccess: boolean, signedIn: boolean) {
  if (signedIn) return routes.staffConsoleHome;
  return devAccess ? routes.devAccess : null;
}

export function staffSetupDestination(devAccess: boolean) {
  return devAccess ? routes.devAccess : null;
}
