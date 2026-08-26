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
import { allowsPlayerRoute } from "../routes";

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
  if (!allowsPlayerRoute(request.method, path)) {
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
  let responseBody: BodyInit | null = response.body;
  if (
    response.ok &&
    request.method === "POST" &&
    /v1\/teams\/[^/]+\/(?:canvas|lounge-v2)\/socket-ticket$/.test(path)
  ) {
    try {
      const ticket = (await response.clone().json()) as Record<string, unknown>;
      if (path.includes("/lounge-v2/")) {
        ticket.serverUrl = baseURL;
      } else {
        const socketPath = path.replace(/socket-ticket$/, "socket");
        ticket.socketUrl = `${baseURL.replace(/^http/, "ws")}/${socketPath}`;
      }
      responseBody = JSON.stringify(ticket);
    } catch {
      return jsonError(
        502,
        "invalid_backend_response",
        "Live team updates are temporarily unavailable.",
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
