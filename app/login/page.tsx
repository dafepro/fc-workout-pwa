import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signedInAs } from "../api/session-role";
import { devAccessEnabled } from "../api/backend";
import { routes } from "../content/routes";
import { LoginEntry } from "./LoginEntry";

export default async function LoginPage() {
  const requestHeaders = await headers();
  const who = await signedInAs(requestHeaders.get("cookie") ?? "");
  if (who === "player") redirect(routes.playerHome);
  if (who === "staff") redirect(routes.staffConsoleHome);
  return <LoginEntry devAccess={devAccessEnabled()} />;
}
