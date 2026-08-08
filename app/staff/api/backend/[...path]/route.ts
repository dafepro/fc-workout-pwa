import {
  forwardedHeaders,
  jsonError,
  limitedBody,
  sameOrigin,
} from "../../../../api/backend";
import { readStaffCookie } from "../../staff-cookie";
import { backendOrResponse, unavailable } from "../../upstream";

/**
 * The console's data gateway. It lives under `/staff/api/` deliberately: the
 * Cloudflare Access application in `infra/digitalocean/access.tf` covers
 * `/staff/*` only, so a gateway anywhere else would sit outside it and lose one
 * of SEC-5's three layers.
 *
 * Only these exact shapes are proxied. An arbitrary backend path is never
 * reachable through the browser.
 */
const allowed = [
  { method: "GET", pattern: /^v1\/staff\/search$/ },
  { method: "GET", pattern: /^v1\/staff\/clubs$/ },
  { method: "POST", pattern: /^v1\/staff\/clubs$/ },
  { method: "GET", pattern: /^v1\/staff\/teams$/ },
  { method: "POST", pattern: /^v1\/staff\/teams$/ },
  { method: "GET", pattern: /^v1\/staff\/teams\/[^/]+$/ },
  { method: "PUT", pattern: /^v1\/staff\/teams\/[^/]+$/ },
  { method: "GET", pattern: /^v1\/staff\/teams\/[^/]+\/roster$/ },
  { method: "POST", pattern: /^v1\/staff\/teams\/[^/]+\/roster$/ },
  { method: "DELETE", pattern: /^v1\/staff\/teams\/[^/]+\/roster\/[^/]+$/ },
  { method: "POST", pattern: /^v1\/staff\/teams\/[^/]+\/players$/ },
  { method: "GET", pattern: /^v1\/staff\/players\/[^/]+$/ },
  { method: "POST", pattern: /^v1\/staff\/players\/[^/]+\/credential$/ },
  { method: "POST", pattern: /^v1\/staff\/players\/[^/]+\/deactivate$/ },
  { method: "GET", pattern: /^v1\/staff\/accounts$/ },
  { method: "POST", pattern: /^v1\/staff\/accounts$/ },
  { method: "POST", pattern: /^v1\/staff\/accounts\/[^/]+\/reset$/ },
  { method: "POST", pattern: /^v1\/staff\/accounts\/[^/]+\/team-assignments$/ },
  {
    method: "DELETE",
    pattern: /^v1\/staff\/accounts\/[^/]+\/team-assignments\/[^/]+$/,
  },
  { method: "GET", pattern: /^v1\/staff\/audit$/ },
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
  const marker = "/staff/api/backend/";
  const path = incoming.pathname.slice(
    incoming.pathname.indexOf(marker) + marker.length,
  );
  // A percent-escape would let one `[^/]+` segment below carry an encoded
  // slash and resolve upstream to a path this allowlist never approved, so the
  // escape is refused rather than decoded. No approved path needs one.
  if (
    path.includes("%") ||
    !allowed.some(
      (route) => route.method === request.method && route.pattern.test(path),
    )
  ) {
    return jsonError(404, "not_found", "The requested resource was not found.");
  }
  if (request.method !== "GET" && !sameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "The request was not allowed.");
  }
  const baseURL = backendOrResponse();
  if (baseURL instanceof Response) return baseURL;
  const token = readStaffCookie(request);
  if (!token) return jsonError(401, "unauthenticated", "Sign in is required.");

  const headers = new Headers({ Authorization: `Bearer ${token}` });
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
