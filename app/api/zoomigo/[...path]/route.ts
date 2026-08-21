import {
  backendBaseURL,
  forwardedHeaders,
  jsonError,
  limitedBody,
  missingBackendCode,
  readSessionCookie,
  sameOrigin,
} from "../../backend";

const allowed = [
  { method: "GET", pattern: /^v1\/me\/training-entries$/ },
  { method: "GET", pattern: /^v1\/me\/training-dashboard$/ },
  { method: "POST", pattern: /^v1\/me\/training-entries$/ },
  { method: "GET", pattern: /^v1\/me\/reaction-badges$/ },
  { method: "POST", pattern: /^v1\/reactions$/ },
  { method: "PUT", pattern: /^v1\/me\/avatar$/ },
  { method: "GET", pattern: /^v1\/training-entries\/[^/]+$/ },
  { method: "DELETE", pattern: /^v1\/training-entries\/[^/]+$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/activity$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/leaderboards$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/canvas$/ },
  { method: "POST", pattern: /^v1\/teams\/[^/]+\/canvas\/rest$/ },
  { method: "PUT", pattern: /^v1\/teams\/[^/]+\/canvas\/avatar$/ },
  { method: "POST", pattern: /^v1\/teams\/[^/]+\/canvas\/pieces$/ },
  {
    method: "PUT",
    pattern: /^v1\/teams\/[^/]+\/canvas\/pieces\/[^/]+$/,
  },
  {
    method: "DELETE",
    pattern: /^v1\/teams\/[^/]+\/canvas\/pieces\/[^/]+$/,
  },
  {
    method: "PUT",
    pattern: /^v1\/teams\/[^/]+\/canvas\/dev-settings$/,
  },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/canvas\/events$/ },
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
  const headers = new Headers({ Authorization: `Bearer ${token}` });
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
  const eventStream = response.headers
    .get("content-type")
    ?.startsWith("text/event-stream");
  return new Response(eventStream ? response.body : await response.text(), {
    status: response.status,
    headers: forwardedHeaders(response),
  });
}
