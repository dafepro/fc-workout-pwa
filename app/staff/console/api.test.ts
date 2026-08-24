import { afterEach, describe, expect, it, vi } from "vitest";

import { consoleRequest } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("staff console requests", () => {
  it("identifies an expired outer preview session instead of accepting the gate page", async () => {
    const response = new Response(
      "<main>Enter the shared preview password.</main>",
      {
        status: 200,
        headers: { "Content-Type": "text/html" },
      },
    );
    Object.defineProperties(response, {
      redirected: { value: true },
      url: {
        value:
          "https://dev.zoomigo.quicktrack.cc/_dev-gate?next=%2Fstaff%2Fapi",
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(
      consoleRequest("v1/staff/teams/team-one/rewards"),
    ).rejects.toMatchObject({
      status: 401,
      code: "preview_access_expired",
      message:
        "Preview access expired. Refresh this page and enter the shared preview password again.",
    });
  });
});
