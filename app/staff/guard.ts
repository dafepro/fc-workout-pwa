import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { routes } from "../content/routes";
import { staffSessionFrom, type StaffWho } from "./session";

/**
 * Any signed-in staff account may reach a team or player screen; the API
 * decides whether this particular team or player is theirs to manage
 * (REQ-301, REQ-302, SEC-5). This is not the boundary, only the door.
 */
export async function requireStaffSession(): Promise<StaffWho> {
  const requestHeaders = await headers();
  const who = await staffSessionFrom(requestHeaders.get("cookie") ?? "");
  if (!who) redirect(routes.staffSignIn);
  return who;
}
