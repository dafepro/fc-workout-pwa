import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OPERATOR_GATEWAY,
  OPERATOR_ROUTES,
  STAFF_GATEWAY,
  STAFF_ROUTES,
  allows,
  gatewayFor,
} from "./console-routes";

const STAFF_HANDLERS = join(
  process.cwd(),
  "backend/internal/httpapi/staff.go",
);

/**
 * Reads the backend's own division of these paths: the route table, and for
 * each handler whether the first thing it does is demand a platform operator.
 * Deriving it rather than restating it is the point -- a table copied by hand
 * drifts, and the drift is a gateway that admits what the backend refuses.
 */
function backendOperatorPaths(): Map<string, boolean> {
  const source = readFileSync(STAFF_HANDLERS, "utf8");

  const gateOf = new Map<string, string>();
  let handler = "";
  for (const line of source.split("\n")) {
    const declaration = line.match(/^func \(service \*service\) (\w+)\(/);
    if (declaration) {
      handler = declaration[1];
      continue;
    }
    if (!handler) continue;
    const gate = line.match(/service\.(operatorActor|staffActor|teamActor|playerActor)\(/);
    if (gate) {
      gateOf.set(handler, gate[1]);
      handler = "";
    }
  }

  const routes = new Map<string, boolean>();
  for (const [, method, path, name] of source.matchAll(
    /mux\.HandleFunc\("(\w+) \/(v1\/staff\/[^"]*)", service\.(\w+)\)/g,
  )) {
    routes.set(`${method} ${path}`, gateOf.get(name) === "operatorActor");
  }
  return routes;
}

/** `{teamId}` in a Go route is `[^/]+` in an allowlist pattern. */
function matchesAllowlist(
  routes: typeof STAFF_ROUTES,
  method: string,
  goPath: string,
): boolean {
  return allows(routes, method, goPath.replace(/\{[^}]+\}/g, "sample-id"));
}

describe("console gateway routing", () => {
  const backend = backendOperatorPaths();

  it("reads the backend's staff routes", () => {
    expect(backend.size).toBeGreaterThanOrEqual(20);
    expect([...backend.values()].filter(Boolean).length).toBeGreaterThan(0);
  });

  it("proxies no path through both gateways", () => {
    for (const [route, operatorOnly] of backend) {
      const [method, path] = route.split(" ");
      const inStaff = matchesAllowlist(STAFF_ROUTES, method, path);
      const inOperator = matchesAllowlist(OPERATOR_ROUTES, method, path);
      expect(
        inStaff && inOperator,
        `${route} is in both allowlists; ${operatorOnly ? "operator" : "staff"} is the one that matches the backend`,
      ).toBe(false);
    }
  });

  /**
   * The invariant the split rests on. A path the backend guards with
   * `operatorActor` must sit behind the operator gateway, or the earlier
   * refusal never happens; a path it does not must stay on the staff gateway,
   * or a coach is refused something the API would have allowed them.
   */
  it("classifies every proxied path the way the backend gates it", () => {
    for (const [route, operatorOnly] of backend) {
      const [method, path] = route.split(" ");
      const inStaff = matchesAllowlist(STAFF_ROUTES, method, path);
      const inOperator = matchesAllowlist(OPERATOR_ROUTES, method, path);
      if (!inStaff && !inOperator) continue; // not proxied to the browser at all
      expect(
        inOperator,
        `${route} is gated by ${operatorOnly ? "operatorActor" : "a wider actor"} in the backend but sits behind the ${inOperator ? "operator" : "staff"} gateway`,
      ).toBe(operatorOnly);
    }
  });

  it("sends operator paths to the gateway inside the Access application", () => {
    expect(gatewayFor("GET", "v1/staff/audit")).toBe(OPERATOR_GATEWAY);
    expect(gatewayFor("GET", "v1/staff/search")).toBe(OPERATOR_GATEWAY);
    expect(gatewayFor("POST", "v1/staff/accounts")).toBe(OPERATOR_GATEWAY);
  });

  it("leaves coach paths on the staff gateway", () => {
    expect(gatewayFor("GET", "v1/staff/teams")).toBe(STAFF_GATEWAY);
    expect(gatewayFor("GET", "v1/staff/teams/team-1/roster")).toBe(
      STAFF_GATEWAY,
    );
    expect(gatewayFor("POST", "v1/staff/teams/team-1/assignments")).toBe(
      STAFF_GATEWAY,
    );
  });

  /** An unknown path must not be promoted to the operator side by a lookup
   * miss; the staff gateway answers 404 for it, as it always has. */
  it("sends an unknown path to the gateway that refuses it", () => {
    expect(gatewayFor("GET", "v1/staff/nonsense")).toBe(STAFF_GATEWAY);
    expect(gatewayFor("DELETE", "v1/staff/audit")).toBe(STAFF_GATEWAY);
  });

  /** The method is part of the allowlist entry, not decoration. */
  it("does not let a method the backend never registered through", () => {
    expect(allows(OPERATOR_ROUTES, "DELETE", "v1/staff/clubs")).toBe(false);
    expect(allows(STAFF_ROUTES, "DELETE", "v1/staff/teams/team-1")).toBe(false);
  });
});
