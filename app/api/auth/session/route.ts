import {
  backendBaseURL,
  clearSessionCookie,
  forwardedHeaders,
  jsonError,
  limitedBody,
  readSessionCookie,
  sameOrigin,
  setSessionCookie,
} from "../../backend";

export async function GET(request: Request) {
  const baseURL = backendBaseURL();
  if (!baseURL) {
    return jsonError(
      503,
      "backend_not_configured",
      "Connected sign in is not configured.",
    );
  }
  const token = readSessionCookie(request);
  if (!token) return jsonError(401, "unauthenticated", "Sign in is required.");
  return proxySession(baseURL, token);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "The request was not allowed.");
  }
  const baseURL = backendBaseURL();
  if (!baseURL) {
    return jsonError(
      503,
      "backend_not_configured",
      "Connected sign in is not configured.",
    );
  }
  let raw: string;
  try {
    raw = await limitedBody(request, 2048);
  } catch {
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
      headers: { "Content-Type": "application/json" },
      body: raw,
    });
  } catch {
    return jsonError(
      503,
      "backend_unavailable",
      "Sign in is temporarily unavailable.",
    );
  }
  const body = await upstream.text();
  if (!upstream.ok) {
    return new Response(body, {
      status: upstream.status,
      headers: forwardedHeaders(upstream),
    });
  }
  const session = JSON.parse(body) as { token?: string };
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
  return Response.json(session, { status: 201, headers });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "The request was not allowed.");
  }
  const token = readSessionCookie(request);
  const baseURL = backendBaseURL();
  if (token && baseURL) {
    try {
      await fetch(`${baseURL}/v1/auth/session`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
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

async function proxySession(baseURL: string, token: string) {
  let response: Response;
  try {
    response = await fetch(`${baseURL}/v1/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return jsonError(
      503,
      "backend_unavailable",
      "ZoomiGo is temporarily unavailable.",
    );
  }
  return new Response(await response.text(), {
    status: response.status,
    headers: forwardedHeaders(response),
  });
}
