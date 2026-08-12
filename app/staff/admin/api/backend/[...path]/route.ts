import { OPERATOR_ROUTES } from "../../../../api/console-routes";
import { proxyToBackend } from "../../../../api/proxy";

/**
 * The operator gateway. It resolves the session's role before it forwards
 * anything, so a coach's browser is refused here rather than at the backend.
 *
 * It is not the boundary on its own -- the backend still authorizes every
 * request (REQ-301, SEC-5) -- but a refusal that happens before the request
 * leaves the browser's own origin is the earliest one available. The path sat
 * behind a Cloudflare Access application when it was chosen; that gate is gone
 * and the role check stands on its own.
 */
const MARKER = "/staff/admin/api/backend/";

export async function GET(request: Request) {
  return proxyToBackend(request, {
    marker: MARKER,
    routes: OPERATOR_ROUTES,
    operatorOnly: true,
  });
}
export async function POST(request: Request) {
  return proxyToBackend(request, {
    marker: MARKER,
    routes: OPERATOR_ROUTES,
    operatorOnly: true,
  });
}
export async function DELETE(request: Request) {
  return proxyToBackend(request, {
    marker: MARKER,
    routes: OPERATOR_ROUTES,
    operatorOnly: true,
  });
}
