import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { routes } from "../../content/routes";
import { isOperator, staffSessionFrom, type StaffWho } from "../session";

/**
 * Keeps the operator screens out of a coach's hands in the UI. It is not the
 * boundary: the API authorizes every request on its own and answers 403
 * regardless of what the browser renders (REQ-301, SEC-5).
 */
export async function requireOperator(): Promise<StaffWho> {
  const requestHeaders = await headers();
  const who = await staffSessionFrom(requestHeaders.get("cookie") ?? "");
  if (!who) redirect(routes.staffSignIn);
  if (!isOperator(who.role)) redirect(routes.staffConsoleHome);
  return who;
}
