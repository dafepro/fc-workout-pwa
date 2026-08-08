import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { routes } from "../content/routes";
import { CoachHome } from "./CoachHome";
import { isOperator, staffSessionFrom } from "./session";

export default async function StaffHomePage() {
  const requestHeaders = await headers();
  const who = await staffSessionFrom(requestHeaders.get("cookie") ?? "");
  if (!who) redirect(routes.staffSignIn);
  if (isOperator(who.role)) redirect(routes.staffAdmin);
  return <CoachHome email={who.email} />;
}
