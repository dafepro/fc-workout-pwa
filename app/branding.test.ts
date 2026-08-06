import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { copy } from "./content/copy";

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "public/manifest.webmanifest"), "utf8"),
) as { name: string; short_name: string };

describe("ZoomiGo branding", () => {
  it("uses the new product name throughout centralized player copy", () => {
    expect(copy.brand).toBe("ZoomiGo");
    expect(JSON.stringify(copy)).not.toMatch(/Stride\s*Crew/i);
  });

  it("uses the new installable PWA identity", () => {
    expect(manifest.name).toBe("ZoomiGo Training");
    expect(manifest.short_name).toBe("ZoomiGo");
  });
});
