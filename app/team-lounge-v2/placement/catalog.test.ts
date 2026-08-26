import { describe, expect, it } from "vitest";
import { beachBoardwalkAssets } from "../scene/assets";
import { loungeStampDefinitions } from "./catalog";

describe("Team Lounge V2 stamp presentation", () => {
  it("uses an invisible Canvas hit target so DOM stamp art is not duplicated", () => {
    expect(
      beachBoardwalkAssets.textures.some(
        ({ id }) => id === "lounge.stamp.transparent",
      ),
    ).toBe(true);
    expect(loungeStampDefinitions).not.toHaveLength(0);
    expect(
      loungeStampDefinitions.every(
        ({ visual }) => visual.spriteId === "lounge.stamp.transparent",
      ),
    ).toBe(true);
    expect(loungeStampDefinitions.every(({ version }) => version === 2)).toBe(
      true,
    );
  });
});
