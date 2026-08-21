import {
  backendBaseURL,
  backendHeaders,
  readAnySessionCookie,
} from "./backend";

export type SignedInAs = "player" | "staff" | null;

/**
 * Resolves who, if anyone, a browser is already signed in as, so a sign-in page
 * can send them where they belong (REQ-104) instead of asking again. A backend
 * that is unreachable or unconfigured resolves to nobody: an unnecessary
 * sign-in page is a far better failure than a redirect loop.
 */
export async function signedInAs(cookieHeader: string): Promise<SignedInAs> {
  const token = readAnySessionCookie(cookieHeader);
  const baseURL = backendBaseURL();
  if (!token || !baseURL) return null;
  let response: Response;
  try {
    response = await fetch(`${baseURL}/v1/auth/session`, {
      headers: backendHeaders({ Authorization: `Bearer ${token}` }),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const session = (await response.json().catch(() => ({}))) as {
    role?: string;
  };
  if (!session.role) return null;
  return session.role === "player" ? "player" : "staff";
}
