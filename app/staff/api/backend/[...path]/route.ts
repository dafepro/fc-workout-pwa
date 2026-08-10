import { STAFF_ROUTES } from "../../console-routes";
import { proxyToBackend } from "../../proxy";

/**
 * The staff gateway: the paths any signed-in staff account may reach, which is
 * every coach screen. It sits outside the Access application, which now covers
 * `/staff/admin` only, and that is deliberate -- a coach is admitted by their
 * console sign-in, not by an address on the Access allowlist.
 *
 * The operator paths are not here. They moved to `/staff/admin/api/backend/`,
 * which is inside the gate and checks the role before forwarding. See
 * `console-routes.ts` for the division and why it matches the backend's own.
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
