import { STAFF_ROUTES } from "../../console-routes";
import { proxyToBackend } from "../../proxy";

/**
 * The staff gateway: the paths any signed-in staff account may reach, which is
 * every coach screen. A coach is admitted by their console sign-in and nothing
 * else.
 *
 * The operator paths are not here. They live at `/staff/admin/api/backend/`,
 * which checks the role before forwarding. See `console-routes.ts` for the
 * division and why it matches the backend's own.
 */
const MARKER = "/staff/api/backend/";

export async function GET(request: Request) {
  return proxyToBackend(request, { marker: MARKER, routes: STAFF_ROUTES });
}
export async function POST(request: Request) {
  return proxyToBackend(request, { marker: MARKER, routes: STAFF_ROUTES });
}
export async function PUT(request: Request) {
  return proxyToBackend(request, { marker: MARKER, routes: STAFF_ROUTES });
}
export async function DELETE(request: Request) {
  return proxyToBackend(request, { marker: MARKER, routes: STAFF_ROUTES });
}
