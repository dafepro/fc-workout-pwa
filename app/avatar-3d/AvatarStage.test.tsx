import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AvatarMotionState } from "./types";
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
    async start({ assetURL, reducedMotion }) {
      events.push(`start:${assetURL}:${reducedMotion}`);
      reportState?.({ kind: "loading" });
      reportState?.(finalState);
    },
    resize(width, height, pixelRatio) {
      events.push(`resize:${width}x${height}@${pixelRatio}`);
    },
    setMotion(motion) {
      events.push("motion:" + motion.kind);
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
    });
    const { rerender, unmount } = render(
      <AvatarStage
        assetURL="/avatar/reference/zoomigo-reference.glb"
        motion={{ kind: "idle" }}
        runtimeFactory={factory}
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "3D avatar ready",
    );
    expect(screen.getByTestId("avatar-3d-canvas")).toBeVisible();
    expect(events).toContain(
      "start:/avatar/reference/zoomigo-reference.glb:false",
    );

    const run: AvatarMotionState = { kind: "run" };
    rerender(
      <AvatarStage
        assetURL="/avatar/reference/zoomigo-reference.glb"
        motion={run}
        runtimeFactory={factory}
      />,
    );
    await waitFor(() => expect(events).toContain("motion:run"));

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
        assetURL="/avatar/reference/missing.glb"
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
