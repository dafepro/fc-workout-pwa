import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ADMIN_DIR = join(process.cwd(), "app/staff/admin");

function pagesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return pagesUnder(path);
    return entry === "page.tsx" ? [path] : [];
  });
}

/**
 * The operator segment is the one surface that reads every club, and with the
 * Access gate gone nothing checks it before the application does. A page added
 * here without its own `requireOperator` would render a coach the admin
 * screens; the API would still answer 403, so nothing leaks,
 * but the UI would be lying about what they can do. The layout is a second
 * check rather than a substitute, because Next does not re-run it when moving
 * between sibling routes.
 */
describe("operator segment guards", () => {
  const pages = pagesUnder(ADMIN_DIR);

  it("finds every admin page", () => {
    expect(pages.length).toBeGreaterThanOrEqual(7);
  });

  it.each(pages)("%s calls requireOperator", (page) => {
    expect(readFileSync(page, "utf8")).toMatch(/await requireOperator\(\)/);
  });

  it("guards the segment layout too", () => {
    expect(readFileSync(join(ADMIN_DIR, "layout.tsx"), "utf8")).toMatch(
      /await requireOperator\(\)/,
    );
  });
});
