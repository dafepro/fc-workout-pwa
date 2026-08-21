import {
  backendHeaders,
  forwardedHeaders,
  jsonError,
  limitedBody,
  sameOrigin,
} from "../../api/backend";
import { readStaffCookie } from "./staff-cookie";
import { backendOrResponse, unavailable } from "./upstream";
import { allows, type ConsoleRoute } from "./console-routes";
import { isOperator, staffSessionFrom } from "../session";

/**
 * The body both console gateways share. They differ only in which paths they
 * will forward and whether the session's role is checked before forwarding.
 */
export async function proxyToBackend(
  request: Request,
  options: { marker: string; routes: ConsoleRoute[]; operatorOnly?: boolean },
): Promise<Response> {
  const incoming = new URL(request.url);
  const path = incoming.pathname.slice(
    incoming.pathname.indexOf(options.marker) + options.marker.length,
  );
  // A percent-escape would let one `[^/]+` segment in an allowlist carry an
  // encoded slash and resolve upstream to a path that allowlist never approved,
  // so the escape is refused rather than decoded. No approved path needs one.
  if (path.includes("%") || !allows(options.routes, request.method, path)) {
    return jsonError(404, "not_found", "The requested resource was not found.");
  }
  if (request.method !== "GET" && !sameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "The request was not allowed.");
  }
  const baseURL = backendOrResponse();
  if (baseURL instanceof Response) return baseURL;
  const token = readStaffCookie(request);
  if (!token) return jsonError(401, "unauthenticated", "Sign in is required.");

  if (options.operatorOnly) {
    // The refusal the backend would issue anyway, one layer earlier. It costs
    // a session lookup per call, which these
    // screens can afford: an operator console is not a hot path. The check is
    // the same one the backend makes -- platform operator, nothing wider -- so
    // it cannot refuse a request the backend would have allowed.
    const who = await staffSessionFrom(request.headers.get("cookie") ?? "");
    if (!who) {
      return jsonError(401, "unauthenticated", "Sign in is required.");
    }
    if (!isOperator(who.role)) {
      return jsonError(
        403,
        "forbidden",
        "This action needs platform operator authority.",
      );
    }
  }

  const headers = backendHeaders({ Authorization: `Bearer ${token}` });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "DELETE") {
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
    return unavailable();
  }
  const text = await response.text();
  return new Response(text || null, {
    status: response.status,
    headers: forwardedHeaders(response),
  });
}
