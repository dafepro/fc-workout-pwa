import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AvatarLoadout, AvatarMotionState } from "./types";
import {
  AvatarStage,
  type AvatarStageRuntime,
  type AvatarStageRuntimeFactory,
} from "./AvatarStage";
import type { AvatarRuntimeState } from "./runtime/types";

function stageHarness(finalState: AvatarRuntimeState) {
  const events: string[] = [];
  let reportState: ((state: AvatarRuntimeState) => void) | undefined;
  const runtime: AvatarStageRuntime = {
    async start({ catalogURL, reducedMotion }) {
      events.push(`start:${catalogURL}:${reducedMotion}`);
      reportState?.({ kind: "loading" });
      reportState?.(finalState);
    },
    resize(width, height, pixelRatio) {
      events.push(`resize:${width}x${height}@${pixelRatio}`);
    },
    setMotion(motion) {
      events.push("motion:" + motion.kind);
    },
    async setLoadout(loadout) {
      events.push("loadout:" + loadout.appearance.hairId);
    },
    setReducedMotion(reducedMotion) {
      events.push("reduced:" + reducedMotion);
    },
    dispose() {
      events.push("dispose");
    },
  };
  const factory: AvatarStageRuntimeFactory = (onState) => {
    reportState = onState;
    return runtime;
  };
  return { events, factory };
}

describe("AvatarStage", () => {
  it("mounts one runtime, reports readiness, forwards motion, and disposes", async () => {
    const { events, factory } = stageHarness({
      kind: "ready",
      animationNames: ["idle_default", "walk", "run"],
      equippedItemIDs: ["base.zoomigo.reference", "hair.curl.reference"],
      warnings: [],
    });
    const { rerender, unmount } = render(
      <AvatarStage
        catalogURL="/avatar/catalog/avatar-catalog.reference.json"
        loadout={loadout}
        motion={{ kind: "idle" }}
        runtimeFactory={factory}
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "3D avatar ready",
    );
    expect(screen.getByTestId("avatar-3d-canvas")).toBeVisible();
    expect(events).toContain(
      "start:/avatar/catalog/avatar-catalog.reference.json:false",
    );

    const run: AvatarMotionState = { kind: "run" };
    rerender(
      <AvatarStage
        catalogURL="/avatar/catalog/avatar-catalog.reference.json"
        loadout={{
          ...loadout,
          appearance: { ...loadout.appearance, hairId: "hair.swoop.reference" },
        }}
        motion={run}
        runtimeFactory={factory}
      />,
    );
    await waitFor(() => expect(events).toContain("motion:run"));
    await waitFor(() =>
      expect(events).toContain("loadout:hair.swoop.reference"),
    );

    unmount();
    expect(events.at(-1)).toBe("dispose");
  });

  it("keeps a useful DOM fallback when the 3D asset is unavailable", async () => {
    const { factory } = stageHarness({
      kind: "unavailable",
      reason: "asset-load-failed",
    });

    render(
      <AvatarStage
        catalogURL="/avatar/catalog/missing.json"
        loadout={loadout}
        motion={{ kind: "idle" }}
        runtimeFactory={factory}
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "3D preview unavailable",
    );
    expect(screen.getByLabelText("Zoomigo avatar fallback")).toBeVisible();
  });
});

const loadout: AvatarLoadout = {
  schemaVersion: 1,
  rigVersion: "zoomigo-humanoid-v1",
  baseId: "base.zoomigo.reference",
  appearance: {
    skinToneId: "skin.medium",
    faceId: "face.default",
    hairId: "hair.curl.reference",
  },
  slots: {},
  animations: {
    idle: "idle_default",
    celebration: "celebration_jump",
  },
  effects: [],
};
