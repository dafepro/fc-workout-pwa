import {
  backendBaseURL,
  backendHeaders,
  forwardedHeaders,
  jsonError,
  limitedBody,
  missingBackendCode,
  readSessionCookie,
  sameOrigin,
} from "../../backend";
import { proxyEvents } from "../../../../lib/analytics/proxy-events";
import { recordServerEventsForRequest } from "../../../../lib/analytics/server";

const allowed = [
  { method: "POST", pattern: /^__dev\/me\/lounge-unlocks$/ },
  { method: "GET", pattern: /^v1\/me\/training-entries$/ },
  { method: "GET", pattern: /^v1\/me\/training-dashboard$/ },
  { method: "POST", pattern: /^v1\/me\/training-entries$/ },
  { method: "POST", pattern: /^v1\/me\/planned-rest-check-ins$/ },
  { method: "GET", pattern: /^v1\/me\/prize-boxes$/ },
  { method: "POST", pattern: /^v1\/me\/prize-boxes\/claim-daily$/ },
  { method: "POST", pattern: /^v1\/me\/prize-boxes\/[^/]+\/open$/ },
  { method: "GET", pattern: /^v1\/me\/unlocks$/ },
  { method: "POST", pattern: /^v1\/me\/unlocks\/[^/]+\/viewed$/ },
  { method: "GET", pattern: /^v1\/me\/reaction-badges$/ },
  { method: "POST", pattern: /^v1\/reactions$/ },
  { method: "PUT", pattern: /^v1\/me\/avatar$/ },
  { method: "GET", pattern: /^v1\/training-entries\/[^/]+$/ },
  { method: "DELETE", pattern: /^v1\/training-entries\/[^/]+$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/activity$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/hub$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/leaderboards$/ },
  { method: "POST", pattern: /^v1\/teams\/[^/]+\/lounge\/socket-ticket$/ },
  { method: "POST", pattern: /^v1\/teams\/[^/]+\/lounge\/placements$/ },
  {
    method: "DELETE",
    pattern: /^v1\/teams\/[^/]+\/lounge\/placements\/pending$/,
  },
  {
    method: "POST",
    pattern: /^v1\/teams\/[^/]+\/lounge\/items\/[^/]+\/mutation-permits$/,
  },
];

export async function GET(request: Request) {
  return proxy(request);
}
export async function POST(request: Request) {
  return proxy(request);
}
export async function PUT(request: Request) {
  return proxy(request);
}
export async function DELETE(request: Request) {
  return proxy(request);
}

async function proxy(request: Request) {
  const incoming = new URL(request.url);
  const marker = "/api/zoomigo/";
  const path = incoming.pathname.slice(
    incoming.pathname.indexOf(marker) + marker.length,
  );
  if (
    !allowed.some(
      (route) => route.method === request.method && route.pattern.test(path),
    )
  ) {
    return jsonError(404, "not_found", "The requested resource was not found.");
  }
  if (request.method !== "GET" && !sameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "The request was not allowed.");
  }
  const baseURL = backendBaseURL();
  if (!baseURL) {
    return jsonError(
      503,
      missingBackendCode(),
      "The backend is not configured.",
    );
  }
  const token = readSessionCookie(request);
  if (!token) return jsonError(401, "unauthenticated", "Sign in is required.");
  const headers = backendHeaders({ Authorization: `Bearer ${token}` });
  const contentType = request.headers.get("content-type");
  const idempotencyKey = request.headers.get("idempotency-key");
  if (contentType) headers.set("Content-Type", contentType);
  if (idempotencyKey)
    headers.set("Idempotency-Key", idempotencyKey.slice(0, 128));
  let body: string | undefined;
  if (request.method !== "GET") {
    try {
      body = await limitedBody(request, 32 * 1024);
    } catch {
      return jsonError(413, "request_too_large", "The request is too large.");
    }
  }
  let response: Response;
  const startedAt = Date.now();
  try {
    response = await fetch(`${baseURL}/${path}${incoming.search}`, {
      method: request.method,
      headers,
      body,
    });
  } catch {
    return jsonError(
      503,
      "backend_unavailable",
      "ZoomiGo is temporarily unavailable.",
    );
  }
  let responseBody = await response.text();
  if (response.ok && /\/lounge\/socket-ticket$/u.test(path)) {
    try {
      responseBody = JSON.stringify({
        ...(JSON.parse(responseBody) as Record<string, unknown>),
        serverUrl: baseURL,
      });
    } catch {
      return jsonError(
        502,
        "invalid_backend_response",
        "The Team Lounge is temporarily unavailable.",
      );
    }
  }
  await recordServerEventsForRequest(
    request,
    proxyEvents(
      request.method,
      path,
      body,
      response.status,
      Date.now() - startedAt,
    ),
  );
  return new Response(responseBody, {
    status: response.status,
    headers: forwardedHeaders(response),
  });
}
