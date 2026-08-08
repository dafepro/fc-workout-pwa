import { env } from "cloudflare:workers";
import {
  missingBackendCodeFor,
  resolveBackendBaseURL,
  resolveBackendRequired,
} from "./backend-config";

export const SESSION_COOKIE = "__Host-zoomigo_session";
export const LOCAL_SESSION_COOKIE = "zoomigo_session_local";

export function backendBaseURL(): string | null {
  const workerValue = (env as { ZOOMIGO_API_BASE_URL?: string })
    .ZOOMIGO_API_BASE_URL;
  return resolveBackendBaseURL(
    workerValue?.trim() || process.env.ZOOMIGO_API_BASE_URL,
  );
}

export function backendRequired(): boolean {
  const workerValue = (env as { ZOOMIGO_REQUIRE_BACKEND?: string })
    .ZOOMIGO_REQUIRE_BACKEND;
  return resolveBackendRequired(
    workerValue?.trim() || process.env.ZOOMIGO_REQUIRE_BACKEND,
  );
}

export function missingBackendCode(): string {
  return missingBackendCodeFor(backendRequired());
}

export function sessionCookieName(request: Request): string {
  return new URL(request.url).protocol === "https:"
    ? SESSION_COOKIE
    : LOCAL_SESSION_COOKIE;
}

export function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function readSessionCookie(request: Request): string | null {
  return readCookie(
    request.headers.get("cookie") ?? "",
    sessionCookieName(request),
  );
}

// A server component has no Request, so it cannot tell the secure cookie name
// from the local one the way sessionCookieName does. Both names are ours and
// only one is ever set, so reading either is unambiguous.
export function readAnySessionCookie(cookieHeader: string): string | null {
  return (
    readCookie(cookieHeader, SESSION_COOKIE) ??
    readCookie(cookieHeader, LOCAL_SESSION_COOKIE)
  );
}

export function setSessionCookie(
  request: Request,
  token: string,
  rememberDevice: boolean,
): string {
  const secure = new URL(request.url).protocol === "https:";
  const attributes = [
    `${sessionCookieName(request)}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) attributes.push("Secure");
  if (rememberDevice) attributes.push(`Max-Age=${30 * 24 * 60 * 60}`);
  return attributes.join("; ");
}

export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:";
  return [
    `${sessionCookieName(request)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}

export function jsonError(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function limitedBody(
  request: Request,
  maximumBytes: number,
): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maximumBytes) throw new Error("request_too_large");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new Error("request_too_large");
  }
  return body;
}

export function forwardedHeaders(response: Response): Headers {
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const name of ["content-type", "x-request-id", "retry-after"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}
