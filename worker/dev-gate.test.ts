import { describe, expect, it } from "vitest";
import {
  devServiceWorkerResponse,
  gateDevRequest,
  type DevGateEnv,
} from "./dev-gate";

const env: DevGateEnv = {
  DEV_ACCESS_ENABLED: "true",
  DEV_ACCESS_PASSWORD: "shared-preview-password",
  DEV_ACCESS_SESSION_KEY: "a-separate-session-signing-secret",
};

function request(
  path: string,
  country: string,
  init?: RequestInit,
  regionCode = "IL",
) {
  const value = new Request(`https://dev.zoomigo.example${path}`, init);
  Object.defineProperty(value, "cf", { value: { country, regionCode } });
  return value;
}

describe("gateDevRequest", () => {
  it("is absent when dev access is disabled", async () => {
    const response = await gateDevRequest(request("/login", "CA"), {
      ...env,
      DEV_ACCESS_ENABLED: "false",
    });

    expect(response).toBeNull();
  });

  it("refuses requests outside the United States before rendering a login", async () => {
    const response = await gateDevRequest(request("/_dev-gate", "CA"), env);

    expect(response?.status).toBe(403);
    expect(await response?.text()).not.toContain("password");
  });

  it("refuses US requests outside the configured Midwest states", async () => {
    const response = await gateDevRequest(
      request("/_dev-gate", "US", undefined, "TX"),
      env,
    );

    expect(response?.status).toBe(403);
  });

  it("admits every US region when the deployment uses the wildcard", async () => {
    const response = await gateDevRequest(
      request("/_dev-gate", "US", undefined, "TX"),
      { ...env, DEV_ALLOWED_REGION_CODES: "*" },
    );

    expect(response?.status).toBe(200);
    expect(await response?.text()).toContain("shared preview password");
  });

  it("redirects an unauthenticated US request to the outer gate", async () => {
    const response = await gateDevRequest(request("/login?from=qr", "US"), env);

    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe(
      "/_dev-gate?next=%2Flogin%3Ffrom%3Dqr",
    );
  });

  it("lets a preview visitor reveal or hide the shared password", async () => {
    const response = await gateDevRequest(request("/_dev-gate", "US"), env);
    const html = await response?.text();

    expect(html).toContain('id="preview-password"');
    expect(html).toContain('type="password"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-controls="preview-password"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Show password");
    expect(html).toContain('password.type="text"');
    expect(html).toContain('password.type="password"');
  });

  it("sends root visitors to the credential directory after the gate", async () => {
    const response = await gateDevRequest(request("/", "US"), env);

    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe(
      "/_dev-gate?next=%2Fdev-access",
    );
  });

  it("creates a secure signed session for the shared password", async () => {
    const response = await gateDevRequest(
      request("/_dev-gate", "US", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          password: env.DEV_ACCESS_PASSWORD!,
          next: "/dev-access",
        }).toString(),
      }),
      env,
    );

    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe("/dev-access");
    expect(response?.headers.get("set-cookie")).toMatch(
      /^zoomigo_dev_access=.*HttpOnly.*Secure.*SameSite=Strict/i,
    );
  });

  it("preserves a player credential fragment after the password step", async () => {
    const response = await gateDevRequest(
      request("/_dev-gate", "US", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          password: env.DEV_ACCESS_PASSWORD!,
          next: "/login#credential=preview-token",
        }).toString(),
      }),
      env,
    );

    expect(response?.headers.get("location")).toBe(
      "/login#credential=preview-token",
    );
  });

  it("accepts a session cookie created by the gate", async () => {
    const login = await gateDevRequest(
      request("/_dev-gate", "US", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          password: env.DEV_ACCESS_PASSWORD!,
          next: "/dev-access",
        }).toString(),
      }),
      env,
    );
    const cookie = login?.headers.get("set-cookie")?.split(";", 1)[0];

    const response = await gateDevRequest(
      request("/dev-access", "US", { headers: { cookie: cookie! } }),
      env,
    );

    expect(response).toBeNull();
  });

  it("fails closed when an enabled gate is missing secrets", async () => {
    const response = await gateDevRequest(request("/login", "US"), {
      DEV_ACCESS_ENABLED: "true",
    });

    expect(response?.status).toBe(503);
  });

  it("fails closed for weak gate secrets", async () => {
    const response = await gateDevRequest(request("/login", "US"), {
      DEV_ACCESS_ENABLED: "true",
      DEV_ACCESS_PASSWORD: "too-short",
      DEV_ACCESS_SESSION_KEY: "also-short",
    });

    expect(response?.status).toBe(503);
  });
});

describe("devServiceWorkerResponse", () => {
  it("unregisters offline caching in the dev environment", async () => {
    const response = devServiceWorkerResponse(request("/sw.js?v=4", "US"), env);

    expect(response?.headers.get("cache-control")).toContain("no-store");
    expect(await response?.text()).toContain("registration.unregister");
  });

  it("leaves the production service worker alone", () => {
    expect(
      devServiceWorkerResponse(request("/sw.js", "US"), {
        DEV_ACCESS_ENABLED: "false",
      }),
    ).toBeNull();
  });
});
