import { describe, expect, it } from "vitest";
import { pageExtensionsFor, resolveBuildProfile } from "../build/build-profile";

describe("resolveBuildProfile", () => {
  it.each([undefined, "", "production"])(
    "defaults %s to the production profile",
    (value) => {
      expect(resolveBuildProfile(value)).toBe("production");
    },
  );

  it("enables development-only code only through an explicit profile", () => {
    expect(resolveBuildProfile("development")).toBe("development");
  });

  it.each(["dev", "Production", " development ", "preview"])(
    "rejects the unknown profile %s",
    (value) => {
      expect(() => resolveBuildProfile(value)).toThrow(
        `Unsupported ZOOMIGO_BUILD_PROFILE: ${value}`,
      );
    },
  );
});

describe("pageExtensionsFor", () => {
  it("excludes development route modules from production discovery", () => {
    expect(pageExtensionsFor("production")).toEqual(["tsx", "ts", "jsx", "js"]);
  });

  it("discovers explicitly suffixed development route modules in development", () => {
    expect(pageExtensionsFor("development")).toEqual([
      "tsx",
      "ts",
      "jsx",
      "js",
      "dev.tsx",
      "dev.ts",
    ]);
  });
});
