import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const readJson = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

describe("avatar artist production contract", () => {
  it("passes the standalone artist-spec validator", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ["tools/avatar-content/validate-artist-spec.mjs"],
        { cwd: process.cwd(), stdio: "pipe" },
      ),
    ).not.toThrow();
  });

  it("defines versioned humanoid and non-humanoid families by capabilities", () => {
    const plan = readJson("content/avatar/spec/production-assets.json");
    const families = plan.families as Array<Record<string, unknown>>;

    expect(plan.schemaVersion).toBe(1);
    expect(families.map((family) => family.id)).toEqual([
      "family.zoomigo-humanoid-v1",
      "family.zoomigo-mascot-v1",
    ]);
    expect(families.every((family) => Array.isArray(family.capabilities))).toBe(
      true,
    );
    expect(
      families.every((family) => !Object.hasOwn(family, "humanOnly")),
    ).toBe(true);
  });

  it("gives every commissioned asset an explicit production and QA contract", () => {
    const plan = readJson("content/avatar/spec/production-assets.json");
    const assets = plan.assets as Array<Record<string, unknown>>;
    const ids = assets.map((asset) => asset.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(assets.length).toBeGreaterThanOrEqual(50);
    expect(
      assets.every(
        (asset) =>
          typeof asset.designBrief === "string" &&
          Array.isArray(asset.familyTargets) &&
          typeof asset.deliveryProfile === "string" &&
          typeof asset.budgetProfile === "string" &&
          Array.isArray(asset.acceptanceChecks),
      ),
    ).toBe(true);
  });

  it("ships schema-valid examples for both rigged and socket assets", () => {
    const schema = readJson("content/avatar/spec/avatar-asset.schema.json");
    const wearable = readJson(
      "content/avatar/spec/examples/humanoid-wearable.example.json",
    );
    const mascot = readJson(
      "content/avatar/spec/examples/non-humanoid-base.example.json",
    );
    const crossFamily = readJson(
      "content/avatar/spec/examples/cross-family-headwear.example.json",
    );

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(wearable.assetType).toBe("skinned_wearable");
    expect(wearable.familyTargets).toEqual(["family.zoomigo-humanoid-v1"]);
    expect(mascot.assetType).toBe("base_character");
    expect(mascot.familyTargets).toEqual(["family.zoomigo-mascot-v1"]);
    expect(crossFamily.assetType).toBe("socket_cosmetic");
    expect(Object.keys(crossFamily.familyPlacements as object)).toEqual(
      crossFamily.familyTargets,
    );
  });
});
