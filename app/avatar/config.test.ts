import { describe, expect, it } from "vitest";
import { AVATAR_LAYERS } from "./catalog";
import {
  AVATAR_CONFIG_VERSION,
  defaultAvatar,
  isAvatarConfiguration,
  normalizeAvatar,
  resolveAvatar,
} from "./config";

function byKind(config: Parameters<typeof resolveAvatar>[0]) {
  return Object.fromEntries(
    resolveAvatar(config).map((layer) => [layer.kind, layer.option]),
  );
}

describe("isAvatarConfiguration", () => {
  it("accepts only a complete version 3 catalog configuration", () => {
    expect(isAvatarConfiguration(defaultAvatar())).toBe(true);
  });

  it.each([
    [
      "the legacy shape",
      { background: "solid", head: "cheetah", eyewear: "none" },
    ],
    ["an empty object", {}],
    ["a missing layer", { ...defaultAvatar(), kit: undefined }],
    ["an unknown option", { ...defaultAvatar(), head: "dragon" }],
    ["an unknown key", { ...defaultAvatar(), frame: "gold" }],
    ["a legacy version", { ...defaultAvatar(), version: "2" }],
    ["an invalid color", { ...defaultAvatar(), avatarColor: "blue" }],
  ])("rejects %s", (_name, config) => {
    expect(isAvatarConfiguration(config)).toBe(false);
  });
});

describe("resolveAvatar", () => {
  it("resolves every version 3 layer", () => {
    const layers = byKind(defaultAvatar());
    expect(layers.background.id).toBe("solid");
    expect(layers.effect.id).toBe("none");
    expect(layers.kit.id).toBe("violet");
    expect(layers.head.id).toBe("person-round");
    expect(layers.hat.id).toBe("none");
    expect(layers.eyewear.id).toBe("none");
  });

  it("uses the stored solid background color", () => {
    expect(byKind(defaultAvatar()).background.color).toBe("#755ee8");
  });

  it("uses a changed background color", () => {
    expect(
      byKind(normalizeAvatar({ backgroundColor: "#123456" })).background.color,
    ).toBe("#123456");
  });

  it("returns catalog options, never stored slugs", () => {
    for (const layer of resolveAvatar(defaultAvatar())) {
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
    const order = resolveAvatar(defaultAvatar()).map((layer) => layer.z);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("normalizeAvatar", () => {
  it("creates the canonical version 3 shape", () => {
    expect(normalizeAvatar({ head: "person-tall" })).toEqual({
      version: AVATAR_CONFIG_VERSION,
      background: "solid",
      effect: "none",
      kit: "violet",
      head: "person-tall",
      hat: "none",
      eyewear: "none",
      backgroundColor: "#755ee8",
      avatarColor: "#66d0ff",
      accentColor: "#302c61",
    });
  });

  it("drops unknown keys and replaces unknown ids with defaults", () => {
    expect(normalizeAvatar({ frame: "gold", head: "dragon" })).toEqual(
      defaultAvatar(),
    );
  });

  it("is idempotent", () => {
    const once = normalizeAvatar({
      backgroundColor: "#123456",
      kit: "ocean",
    });
    expect(normalizeAvatar(once)).toEqual(once);
  });
});
