import { AnimationClip, Object3D } from "three";
import { describe, expect, it } from "vitest";

import type { AvatarLoadout } from "../types";
import { AvatarRuntime } from "./AvatarRuntime";
import type {
  AvatarPresentationLoader,
  AvatarRenderBackend,
  AvatarRuntimeState,
  LoadedAvatar,
} from "./types";

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

function harness({ failLoad = false } = {}) {
  const events: string[] = [];
  const states: AvatarRuntimeState[] = [];
  const loadedAvatar: LoadedAvatar = {
    scene: new Object3D(),
    animations: ["idle_default", "walk", "run", "celebration_jump"].map(
      (name) => new AnimationClip(name),
    ),
    equippedItemIDs: ["base.zoomigo.reference", "hair.curl.reference"],
    warnings: [],
  };
  const loader: AvatarPresentationLoader = {
    async load(source) {
      events.push(
        `load:${source.catalogURL}:${source.loadout.appearance.hairId}`,
      );
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
    setView(rotation) {
      events.push(`view:${rotation}`);
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
  it("assembles and attaches a catalog loadout before reporting ready", async () => {
    const { events, runtime, states } = harness();

    await runtime.start({
      catalogURL: "/avatar/catalog/avatar-catalog.reference.json",
      loadout,
      canvas: document.createElement("canvas"),
      reducedMotion: false,
    });

    expect(events).toEqual([
      "initialize",
      "load:/avatar/catalog/avatar-catalog.reference.json:hair.curl.reference",
      "attach",
      "motion:idle:false",
    ]);
    expect(states).toEqual([
      { kind: "loading" },
      {
        kind: "ready",
        animationNames: ["idle_default", "walk", "run", "celebration_jump"],
        equippedItemIDs: ["base.zoomigo.reference", "hair.curl.reference"],
        warnings: [],
      },
    ]);
  });

  it("reassembles a changed loadout without recreating the renderer", async () => {
    const { events, runtime } = harness();
    await runtime.start({
      catalogURL: "/avatar/catalog/avatar-catalog.reference.json",
      loadout,
      canvas: document.createElement("canvas"),
      reducedMotion: true,
    });

    await runtime.setLoadout({
      ...loadout,
      appearance: { ...loadout.appearance, hairId: "hair.swoop.reference" },
    });
    runtime.resize(320, 480, 3);
    runtime.setView(Math.PI / 2);
    runtime.setMotion({ kind: "run" });
    runtime.setReducedMotion(false);

    expect(events.filter((event) => event === "initialize")).toHaveLength(1);
    expect(events).toContain(
      "load:/avatar/catalog/avatar-catalog.reference.json:hair.swoop.reference",
    );
    expect(events).toContain("resize:320x480@2");
    expect(events).toContain(`view:${Math.PI / 2}`);
    expect(events).toContain("motion:run:true");
    expect(events.at(-1)).toBe("motion:run:false");
  });

  it("degrades safely and releases GPU resources when assembly fails", async () => {
    const { events, runtime, states } = harness({ failLoad: true });

    await runtime.start({
      catalogURL: "/avatar/catalog/missing.json",
      loadout,
      canvas: document.createElement("canvas"),
      reducedMotion: false,
    });

    expect(events).toEqual([
      "initialize",
      "load:/avatar/catalog/missing.json:hair.curl.reference",
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
