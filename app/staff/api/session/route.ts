import { jsonError, sameOrigin } from "../../../api/backend";
import { clearStaffCookie, readStaffCookie } from "../staff-cookie";
import {
  backendOrResponse,
  callBackend,
  jsonBody,
  relay,
  sessionToCookie,
  unavailable,
} from "../upstream";

export async function GET(request: Request) {
  const baseURL = backendOrResponse();
  if (baseURL instanceof Response) return baseURL;
  const token = readStaffCookie(request);
  if (!token) return jsonError(401, "unauthenticated", "Sign in is required.");
  const upstream = await callBackend(baseURL, "/v1/auth/staff-session", {
    method: "GET",
    token,
  });
  return upstream ? relay(upstream) : unavailable();
}

/**
 * Both steps of F-S6. The password step returns a challenge and never a
 * session; only the TOTP step mints one, and that token is moved straight into
 * the cookie so it never reaches the browser.
 */
export async function POST(request: Request) {
  const baseURL = backendOrResponse();
  if (baseURL instanceof Response) return baseURL;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;

  if (typeof body.challenge === "string") {
    const upstream = await callBackend(
      baseURL,
      "/v1/auth/staff-sessions/totp",
      {
        method: "POST",
        body: { challenge: body.challenge, code: body.code },
      },
    );
    return upstream ? sessionToCookie(request, upstream) : unavailable();
  }

  const upstream = await callBackend(baseURL, "/v1/auth/staff-sessions", {
    method: "POST",
    body: { email: body.email, password: body.password },
  });
  return upstream ? relay(upstream) : unavailable();
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "The request was not allowed.");
  }
  const token = readStaffCookie(request);
  const baseURL = backendBaseURLOrNull();
  if (token && baseURL) {
    await callBackend(baseURL, "/v1/auth/staff-session", {
      method: "DELETE",
      token,
    });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": clearStaffCookie(request),
    },
  });
}

// Signing out must clear the browser credential even when the backend is gone,
// so this path treats an unconfigured backend as nothing to tell.
function backendBaseURLOrNull(): string | null {
  const resolved = backendOrResponse();
  return resolved instanceof Response ? null : resolved;
}
