import { readCookie } from "../../api/backend";

/**
 * The staff session token never reaches the browser: it lives in a same-origin
 * HttpOnly cookie under its own name, so a staff sign-in never clears or
 * overwrites a player session in the same browser (REQ-207).
 *
 * The `__Host-` prefix forbids a `Domain` and requires `Path=/`, so the console
 * cookie cannot be path-scoped to `/staff` while keeping the prefix. Its own
 * name is what keeps the two apart.
 */
export const STAFF_SESSION_COOKIE = "__Host-zoomigo_staff";
export const LOCAL_STAFF_SESSION_COOKIE = "zoomigo_staff_local";

export function staffCookieName(request: Request): string {
  return new URL(request.url).protocol === "https:"
    ? STAFF_SESSION_COOKIE
    : LOCAL_STAFF_SESSION_COOKIE;
}

export function readStaffCookie(request: Request): string | null {
  return readCookie(
    request.headers.get("cookie") ?? "",
    staffCookieName(request),
  );
}

// A server component has no Request, so it cannot tell the secure cookie name
// from the local one. Both names are ours and only one is ever set.
export function readAnyStaffCookie(cookieHeader: string): string | null {
  return (
    readCookie(cookieHeader, STAFF_SESSION_COOKIE) ??
    readCookie(cookieHeader, LOCAL_STAFF_SESSION_COOKIE)
  );
}

/** No `Max-Age`: staff have no remembered device, so the cookie dies with the
 * browser as well as with the backend's own idle and absolute limits. */
export function setStaffCookie(request: Request, token: string): string {
  const attributes = [
    `${staffCookieName(request)}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (new URL(request.url).protocol === "https:") attributes.push("Secure");
  return attributes.join("; ");
}

export function clearStaffCookie(request: Request): string {
  const attributes = [
    `${staffCookieName(request)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (new URL(request.url).protocol === "https:") attributes.push("Secure");
  return attributes.join("; ");
}
