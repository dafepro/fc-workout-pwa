import { describe, expect, it } from "vitest";
import { AVATAR_LAYERS } from "./catalog";
import { normalizeAvatar, resolveAvatar } from "./config";
import { playerColor } from "./color";

const FALLBACK = playerColor("player-mason");

function byKind(config: Parameters<typeof resolveAvatar>[0]) {
  return Object.fromEntries(
    resolveAvatar(config, FALLBACK).map((layer) => [layer.kind, layer.option]),
  );
}

describe("resolveAvatar", () => {
  it("resolves today's stored '{}' to every default", () => {
    const layers = byKind({});
    expect(layers.background.id).toBe("kit");
    expect(layers.head.id).toBe("dog");
    expect(layers.eyewear.id).toBe("none");
  });

  it("falls back to the layer default for an unknown option id", () => {
    expect(byKind({ head: "dragon" }).head.id).toBe("dog");
  });

  it("ignores a key that is not a layer kind", () => {
    const layers = byKind({ frame: "gold", head: "cheetah" });
    expect(layers.head.id).toBe("cheetah");
    expect(layers.frame).toBeUndefined();
  });

  it("honors an explicit eyewear choice of none", () => {
    expect(byKind({ eyewear: "none" }).eyewear.id).toBe("none");
  });

  it("uses the player color when no background is stored", () => {
    expect(byKind({}).background.color).toBe(FALLBACK);
  });

  it("uses the chosen color when a background is stored", () => {
    expect(byKind({ background: "sky" }).background.color).toBe("#66d0ff");
  });

  it("returns catalog options, never raw stored slugs", () => {
    for (const layer of resolveAvatar({ head: "dragon" }, FALLBACK)) {
      const definition = AVATAR_LAYERS.find(
        (candidate) => candidate.kind === layer.kind,
      )!;
      expect(definition.options.map((option) => option.id)).toContain(
        layer.option.id,
      );
      expect(layer.option.label).toBeTruthy();
    }
  });

  it("sorts layers by paint order", () => {
    const order = resolveAvatar({}, FALLBACK).map((layer) => layer.z);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("normalizeAvatar", () => {
  it("expands a partial config into every layer", () => {
    expect(normalizeAvatar({ head: "cheetah" })).toEqual({
      background: "kit",
      head: "cheetah",
      eyewear: "none",
    });
  });

  it("drops unknown keys and replaces unknown ids with defaults", () => {
    expect(normalizeAvatar({ frame: "gold", head: "dragon" })).toEqual({
      background: "kit",
      head: "dog",
      eyewear: "none",
    });
  });

  it("is idempotent", () => {
    const once = normalizeAvatar({ background: "night" });
    expect(normalizeAvatar(once)).toEqual(once);
  });
});
