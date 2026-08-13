/**
 * The console's two gateways, and which backend path belongs to which.
 *
 * There used to be one gateway under `/staff/api/backend/`. It allowlisted
 * methods and paths but not roles. A coach's browser could call an operator
 * endpoint through it and was refused by the backend rather than by the proxy
 * -- correct, but as late as a refusal can be.
 *
 * The split moves the operator paths to `/staff/admin/api/backend/`, which
 * checks the session's role before it forwards anything. The path once sat
 * inside a Cloudflare Access application as well; that gate is gone, and the
 * role check is what the split was always worth. The division is the backend's
 * own: a path lands in
 * OPERATOR_ROUTES exactly when its handler calls `operatorActor`, so the two
 * gates agree by construction and the proxy never permits what the backend
 * would refuse, or refuses what it would permit.
 *
 * This table is shared by both route handlers and by the browser client, so the
 * classification has one home. A path's gateway is a property of the path, not
 * of who is calling: the client routes by table lookup and never has to know
 * its own role.
 */
export interface ConsoleRoute {
  method: string;
  pattern: RegExp;
}

/** Reachable by any signed-in staff account; the backend narrows a coach to
 * their own teams and players from there (REQ-301, SEC-5). */
export const STAFF_ROUTES: ConsoleRoute[] = [
  { method: "GET", pattern: /^v1\/staff\/teams$/ },
  { method: "POST", pattern: /^v1\/staff\/teams$/ },
  { method: "GET", pattern: /^v1\/staff\/teams\/[^/]+$/ },
  { method: "PUT", pattern: /^v1\/staff\/teams\/[^/]+$/ },
  { method: "GET", pattern: /^v1\/staff\/teams\/[^/]+\/roster$/ },
  { method: "POST", pattern: /^v1\/staff\/teams\/[^/]+\/roster$/ },
  { method: "DELETE", pattern: /^v1\/staff\/teams\/[^/]+\/roster\/[^/]+$/ },
  { method: "POST", pattern: /^v1\/staff\/teams\/[^/]+\/players$/ },
  { method: "GET", pattern: /^v1\/staff\/teams\/[^/]+\/progress$/ },
  { method: "GET", pattern: /^v1\/staff\/assignment-catalog$/ },
  { method: "GET", pattern: /^v1\/staff\/teams\/[^/]+\/assignments$/ },
  { method: "POST", pattern: /^v1\/staff\/teams\/[^/]+\/assignments$/ },
  { method: "PATCH", pattern: /^v1\/staff\/teams\/[^/]+\/assignments\/[^/]+$/ },
  {
    method: "DELETE",
    pattern: /^v1\/staff\/teams\/[^/]+\/assignments\/[^/]+$/,
  },
  {
    method: "POST",
    pattern: /^v1\/staff\/teams\/[^/]+\/assignments\/[^/]+\/end$/,
  },
  { method: "GET", pattern: /^v1\/staff\/players\/[^/]+$/ },
  { method: "POST", pattern: /^v1\/staff\/players\/[^/]+\/credential$/ },
  { method: "POST", pattern: /^v1\/staff\/players\/[^/]+\/deactivate$/ },
];

/** Platform operator only, matching `operatorActor` in the backend. */
export const OPERATOR_ROUTES: ConsoleRoute[] = [
  { method: "GET", pattern: /^v1\/staff\/search$/ },
  { method: "GET", pattern: /^v1\/staff\/clubs$/ },
  { method: "POST", pattern: /^v1\/staff\/clubs$/ },
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

export const STAFF_GATEWAY = "/staff/api/backend/";
export const OPERATOR_GATEWAY = "/staff/admin/api/backend/";

export function allows(
  routes: ConsoleRoute[],
  method: string,
  path: string,
): boolean {
  return routes.some(
    (route) => route.method === method && route.pattern.test(path),
  );
}

/**
 * The gateway a console call belongs to. A path in neither table resolves to
 * the staff gateway, which answers 404 for it -- the same refusal an unknown
 * path has always had, rather than a silent promotion to the operator side.
 */
export function gatewayFor(method: string, path: string): string {
  return allows(OPERATOR_ROUTES, method, path)
    ? OPERATOR_GATEWAY
    : STAFF_GATEWAY;
}
