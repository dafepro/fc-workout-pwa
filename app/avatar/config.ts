import { AVATAR_LAYERS } from "./catalog";
import type {
  AvatarConfiguration,
  AvatarLayerDefinition,
  AvatarOption,
  ResolvedLayer,
} from "./types";

export const AVATAR_CONFIG_VERSION = "3";

export const DEFAULT_AVATAR_COLORS = {
  backgroundColor: "#755ee8",
  avatarColor: "#66d0ff",
  accentColor: "#302c61",
} as const;

const COLOR_KEYS = Object.keys(DEFAULT_AVATAR_COLORS) as Array<
  keyof typeof DEFAULT_AVATAR_COLORS
>;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isAvatarConfiguration(
  config: unknown,
): config is AvatarConfiguration {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return false;
  }

  const values = config as Record<string, unknown>;
  const expectedKeys = [
    "version",
    ...AVATAR_LAYERS.map(({ kind }) => kind),
    ...COLOR_KEYS,
  ];
  if (
    values.version !== AVATAR_CONFIG_VERSION ||
    Object.keys(values).length !== expectedKeys.length ||
    expectedKeys.some((key) => typeof values[key] !== "string") ||
    COLOR_KEYS.some((key) => !HEX_COLOR.test(values[key] as string))
  ) {
    return false;
  }

  return AVATAR_LAYERS.every((layer) =>
    layer.options.some((option) => option.id === values[layer.kind]),
  );
}

export function resolveAvatar(config: AvatarConfiguration): ResolvedLayer[] {
  return [...AVATAR_LAYERS]
    .sort((left, right) => left.z - right.z)
    .map((layer) => ({
      kind: layer.kind,
      option: paint(layer, resolveOption(layer, config), config),
      z: layer.z,
    }));
}

export function normalizeAvatar(
  config: AvatarConfiguration,
): AvatarConfiguration {
  return Object.fromEntries([
    ["version", AVATAR_CONFIG_VERSION],
    ...AVATAR_LAYERS.map((layer) => [
      layer.kind,
      resolveOption(layer, config).id,
    ]),
    ...COLOR_KEYS.map((key) => [key, normalizeColor(config[key], key)]),
  ]);
}

export function defaultAvatar(): AvatarConfiguration {
  return normalizeAvatar({});
}

function resolveOption(
  layer: AvatarLayerDefinition,
  config: AvatarConfiguration,
): AvatarOption {
  const stored = config[layer.kind];
  return (
    layer.options.find((option) => option.id === stored) ??
    layer.options.find((option) => option.id === layer.defaultOptionID)!
  );
}

function normalizeColor(
  color: string | undefined,
  key: keyof typeof DEFAULT_AVATAR_COLORS,
): string {
  return color && HEX_COLOR.test(color)
    ? color.toLowerCase()
    : DEFAULT_AVATAR_COLORS[key];
}

function paint(
  layer: AvatarLayerDefinition,
  option: AvatarOption,
  config: AvatarConfiguration,
): AvatarOption {
  if (layer.kind !== "background") return option;
  return {
    ...option,
    color: normalizeColor(config.backgroundColor, "backgroundColor"),
  };
}
