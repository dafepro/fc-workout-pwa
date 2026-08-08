import { backendBaseURL } from "../api/backend";
import { readAnyStaffCookie } from "./api/staff-cookie";

export interface StaffWho {
  accountId: string;
  role: string;
  email: string;
}

/**
 * Resolves the staff session for a server component, so the console can send a
 * signed-in coach past the sign-in page and an operator straight to their own
 * home. A backend that is unreachable resolves to nobody: an unnecessary
 * sign-in page beats a redirect loop.
 */
export async function staffSessionFrom(
  cookieHeader: string,
): Promise<StaffWho | null> {
  const token = readAnyStaffCookie(cookieHeader);
  const baseURL = backendBaseURL();
  if (!token || !baseURL) return null;
  let response: Response;
  try {
    response = await fetch(`${baseURL}/v1/auth/staff-session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const session = (await response
    .json()
    .catch(() => ({}))) as Partial<StaffWho>;
  if (!session.role || !session.accountId) return null;
  return {
    accountId: session.accountId,
    role: session.role,
    email: session.email ?? "",
  };
}

export function isOperator(role: string): boolean {
  return role === "platform_admin";
}
