import { describe, expect, it } from "vitest";
import { resolveBuildProfile } from "../build/build-profile";

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
