import { validateClientBatch } from "../../../lib/analytics/catalog";
import { recordClientBatch } from "../../../lib/analytics/server";
import { jsonError, limitedBody, sameOrigin } from "../backend";

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "The request was not allowed.");
  }
  let raw: string;
  try {
    raw = await limitedBody(request, 16 * 1024);
  } catch {
    return jsonError(413, "request_too_large", "The request is too large.");
  }
  let batch;
  try {
    batch = validateClientBatch(JSON.parse(raw));
  } catch {
    return jsonError(400, "invalid_metrics", "The metrics batch is invalid.");
  }
  try {
    const outcome = await recordClientBatch(request, batch);
    if (outcome === "unauthenticated") {
      return jsonError(401, "unauthenticated", "Sign in is required.");
    }
  } catch {
    // Collection is never allowed to make the product unavailable.
  }
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
