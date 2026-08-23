import {
  backendBaseURL,
  backendHeaders,
  clearSessionCookie,
  devAccessEnabled,
  forwardedHeaders,
  jsonError,
  limitedBody,
  missingBackendCode,
  readSessionCookie,
  sameOrigin,
  setSessionCookie,
} from "../../backend";
import { withRuntimeCapabilities } from "./capabilities";
import {
  recordServerEvent,
  recordAnonymousServerEvent,
  recordServerEventForRequest,
  type AnalyticsSession,
} from "../../../../lib/analytics/server";

export async function GET(request: Request) {
  const baseURL = backendBaseURL();
  if (!baseURL) {
    return jsonError(
      503,
      missingBackendCode(),
      "Connected sign in is not configured.",
    );
  }
  const token = readSessionCookie(request);
  if (!token) return jsonError(401, "unauthenticated", "Sign in is required.");
  return proxySession(baseURL, token, devAccessEnabled());
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "The request was not allowed.");
  }
  const baseURL = backendBaseURL();
  if (!baseURL) {
    return jsonError(
      503,
      missingBackendCode(),
      "Connected sign in is not configured.",
    );
  }
  let raw: string;
  try {
    raw = await limitedBody(request, 2048);
  } catch {
    await recordAnonymousServerEvent("player_sign_in_failed", {
      reason: "invalid",
    });
    return jsonError(
      413,
      "request_too_large",
      "The sign-in request is too large.",
    );
  }
  let rememberDevice = false;
  try {
    const parsed = JSON.parse(raw) as { rememberDevice?: unknown };
    rememberDevice = parsed.rememberDevice === true;
  } catch {
    return jsonError(400, "invalid_request", "The sign-in request is invalid.");
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${baseURL}/v1/auth/sessions`, {
      method: "POST",
      headers: backendHeaders({ "Content-Type": "application/json" }),
      body: raw,
    });
  } catch {
    await recordAnonymousServerEvent("player_sign_in_failed", {
      reason: "unavailable",
    });
    return jsonError(
      503,
      "backend_unavailable",
      "Sign in is temporarily unavailable.",
    );
  }
  const body = await upstream.text();
  if (!upstream.ok) {
    await recordAnonymousServerEvent("player_sign_in_failed", {
      reason: signInFailureReason(upstream.status),
    });
    return new Response(body, {
      status: upstream.status,
      headers: forwardedHeaders(upstream),
    });
  }
  const session = JSON.parse(body) as AnalyticsSession & { token?: string };
  if (!session.token) {
    return jsonError(
      502,
      "invalid_backend_response",
      "Sign in could not be completed.",
    );
  }
  delete session.token;
  const headers = forwardedHeaders(upstream);
  headers.set(
    "Set-Cookie",
    setSessionCookie(request, JSON.parse(body).token, rememberDevice),
  );
  await recordServerEvent(session, "player_sign_in_succeeded", {
    remembered: rememberDevice,
  });
  return Response.json(withRuntimeCapabilities(session, devAccessEnabled()), {
    status: 201,
    headers,
  });
}

function signInFailureReason(
  status: number,
): "invalid" | "locked" | "busy" | "rate_limited" | "unavailable" {
  if (status === 423) return "locked";
  if (status === 429) return "rate_limited";
  if (status === 503) return "busy";
  if (status >= 500) return "unavailable";
  return "invalid";
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "The request was not allowed.");
  }
  const token = readSessionCookie(request);
  const baseURL = backendBaseURL();
  await recordServerEventForRequest(request, "player_signed_out", {});
  if (token && baseURL) {
    try {
      await fetch(`${baseURL}/v1/auth/session`, {
        method: "DELETE",
        headers: backendHeaders({ Authorization: `Bearer ${token}` }),
      });
    } catch {
      // Local sign-out still clears the browser credential.
    }
  }
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookie(request),
    },
  });
}

async function proxySession(
  baseURL: string,
  token: string,
  developerControlsEnabled: boolean,
) {
  let response: Response;
  try {
    response = await fetch(`${baseURL}/v1/auth/session`, {
      headers: backendHeaders({ Authorization: `Bearer ${token}` }),
    });
  } catch {
    return jsonError(
      503,
      "backend_unavailable",
      "ZoomiGo is temporarily unavailable.",
    );
  }
  const body = await response.text();
  if (!response.ok) {
    return new Response(body, {
      status: response.status,
      headers: forwardedHeaders(response),
    });
  }
  try {
    return Response.json(
      withRuntimeCapabilities(
        JSON.parse(body) as Record<string, unknown>,
        developerControlsEnabled,
      ),
      { status: response.status, headers: forwardedHeaders(response) },
    );
  } catch {
    return jsonError(
      502,
      "invalid_backend_response",
      "The player session could not be opened.",
    );
  }
}
