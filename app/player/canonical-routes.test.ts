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
});
