import { describe, expect, it } from "vitest";
import {
  sharedLoungePointerOptions,
  sharedLoungeRates,
} from "./runtime-config";

describe("Team Lounge V2 runtime tuning", () => {
  it("samples direct dragging at the simulation rate without release coast", () => {
    expect(sharedLoungeRates).toEqual({
      inputHz: 60,
      deltaHz: 20,
      keyframeHz: 2,
      checkpointHz: 1,
    });
    expect(sharedLoungePointerOptions()).toEqual({
      mode: "avatarDrag",
      deadZonePx: 2,
      grabRadiusPx: 36,
      flick: false,
    });
  });
});
