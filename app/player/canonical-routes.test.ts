import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical player routes", () => {
  it.each([
    "leaders",
    "classic-alpha",
    "momentum-alpha",
    "momentum",
    "team-canvas",
  ])("does not ship the alternate /%s experience", (route) => {
    expect(existsSync(join(process.cwd(), "app", route, "page.tsx"))).toBe(
      false,
    );
  });

  it.each(["dev-access", join("avatar", "preview")])(
    "marks /%s as an explicitly development-only route module",
    (route) => {
      const routeDirectory = join(process.cwd(), "app", route);
      expect(existsSync(join(routeDirectory, "page.tsx"))).toBe(false);
      expect(existsSync(join(routeDirectory, "page.dev.tsx"))).toBe(true);
    },
  );

  it("marks the developer staff-session endpoint as development-only", () => {
    const routeDirectory = join(
      process.cwd(),
      "app",
      "staff",
      "api",
      "dev-session",
    );
    expect(existsSync(join(routeDirectory, "route.ts"))).toBe(false);
    expect(existsSync(join(routeDirectory, "route.dev.ts"))).toBe(true);
  });
});
