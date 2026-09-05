import { describe, expect, it } from "vitest";
import { AnimationClip, Object3D } from "three";

import type {
  AvatarAssetLoader,
  AvatarRenderBackend,
  AvatarRuntimeState,
  LoadedAvatar,
} from "./types";
import { AvatarRuntime } from "./AvatarRuntime";

function harness({ failLoad = false } = {}) {
  const events: string[] = [];
  const states: AvatarRuntimeState[] = [];
  const loadedAvatar: LoadedAvatar = {
    scene: new Object3D(),
    animations: ["idle_default", "walk", "run", "celebration_jump"].map(
      (name) => new AnimationClip(name),
    ),
  };
  const loader: AvatarAssetLoader = {
    async load(url) {
      events.push("load:" + url);
      if (failLoad) throw new Error("missing asset");
      return loadedAvatar;
    },
  };
  const backend: AvatarRenderBackend = {
    initialize() {
      events.push("initialize");
    },
    attach(avatar) {
      expect(avatar).toBe(loadedAvatar);
      events.push("attach");
    },
    resize(width, height, pixelRatio) {
      events.push(`resize:${width}x${height}@${pixelRatio}`);
    },
    setMotion(motion, reducedMotion) {
      events.push(`motion:${motion.kind}:${reducedMotion}`);
    },
    dispose() {
      events.push("dispose");
    },
  };
  const runtime = new AvatarRuntime({
    backend,
    loader,
    onState: (state) => states.push(state),
  });

  return { events, runtime, states };
}

describe("AvatarRuntime", () => {
  it("loads and attaches one GLB before reporting ready", async () => {
    const { events, runtime, states } = harness();

    await runtime.start({
      assetURL: "/avatar/reference/zoomigo-reference.glb",
      canvas: document.createElement("canvas"),
      reducedMotion: false,
    });

    expect(events).toEqual([
      "initialize",
      "load:/avatar/reference/zoomigo-reference.glb",
      "attach",
      "motion:idle:false",
    ]);
    expect(states).toEqual([
      { kind: "loading" },
      {
        kind: "ready",
        animationNames: ["idle_default", "walk", "run", "celebration_jump"],
      },
    ]);
  });

  it("forwards app motion, reduced-motion preference, and bounded pixel ratio", async () => {
    const { events, runtime } = harness();
    await runtime.start({
      assetURL: "/avatar/reference/zoomigo-reference.glb",
      canvas: document.createElement("canvas"),
      reducedMotion: true,
    });

    runtime.resize(320, 480, 3);
    runtime.setMotion({ kind: "run" });
    runtime.setReducedMotion(false);

    expect(events).toContain("resize:320x480@2");
    expect(events).toContain("motion:run:true");
    expect(events.at(-1)).toBe("motion:run:false");
  });

  it("degrades safely and releases GPU resources when loading fails", async () => {
    const { events, runtime, states } = harness({ failLoad: true });

    await runtime.start({
      assetURL: "/avatar/reference/missing.glb",
      canvas: document.createElement("canvas"),
      reducedMotion: false,
    });

    expect(events).toEqual([
      "initialize",
      "load:/avatar/reference/missing.glb",
      "dispose",
    ]);
    expect(states).toEqual([
      { kind: "loading" },
      { kind: "unavailable", reason: "asset-load-failed" },
    ]);
  });

  it("is safe to dispose more than once", () => {
    const { events, runtime } = harness();

    runtime.dispose();
    runtime.dispose();

    expect(events).toEqual(["dispose"]);
  });
});
