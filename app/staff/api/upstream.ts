import {
  backendBaseURL,
  forwardedHeaders,
  jsonError,
  limitedBody,
  missingBackendCode,
  sameOrigin,
} from "../../api/backend";
import { setStaffCookie } from "./staff-cookie";

export const MAXIMUM_BODY_BYTES = 8 * 1024;

/** Returns the backend base URL, or the response to send instead of using it. */
export function backendOrResponse(): string | Response {
  const baseURL = backendBaseURL();
  if (baseURL) return baseURL;
  return jsonError(
    503,
    missingBackendCode(),
    "The staff console is not configured.",
  );
}

/** Reads a same-origin JSON body, or returns the response to send instead. */
export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  if (!sameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "The request was not allowed.");
  }
  let raw: string;
  try {
    raw = await limitedBody(request, MAXIMUM_BODY_BYTES);
  } catch {
    return jsonError(413, "request_too_large", "The request is too large.");
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return jsonError(400, "invalid_request", "The request is invalid.");
  }
}

export async function callBackend(
  baseURL: string,
  path: string,
  init: { method: string; body?: unknown; token?: string | null },
): Promise<Response | null> {
  const headers = new Headers();
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  try {
    return await fetch(`${baseURL}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return null;
  }
}

export function unavailable(): Response {
  return jsonError(
    503,
    "backend_unavailable",
    "The staff console is temporarily unavailable.",
  );
}

export async function relay(upstream: Response): Promise<Response> {
  const body = await upstream.text();
  return new Response(body || null, {
    status: upstream.status,
    headers: forwardedHeaders(upstream),
  });
}

/**
 * Moves a minted session token out of the response body and into the cookie, so
 * that no console script can ever read it (REQ-207, and the gateway pattern the
 * player sign-in already follows).
 */
export async function sessionToCookie(
  request: Request,
  upstream: Response,
): Promise<Response> {
  const text = await upstream.text();
  if (!upstream.ok) {
    return new Response(text || null, {
      status: upstream.status,
      headers: forwardedHeaders(upstream),
    });
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return jsonError(
      502,
      "invalid_backend_response",
      "Sign in could not be completed.",
    );
  }
  const nested = parsed.session as Record<string, unknown> | undefined;
  const holder = nested ?? parsed;
  const token = holder.token;
  if (typeof token !== "string" || !token) {
    return jsonError(
      502,
      "invalid_backend_response",
      "Sign in could not be completed.",
    );
  }
  delete holder.token;
  const headers = forwardedHeaders(upstream);
  headers.set("Set-Cookie", setStaffCookie(request, token));
  return Response.json(parsed, { status: upstream.status, headers });
}
