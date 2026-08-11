import { AVATAR_LAYERS } from "./catalog";
import type {
  AvatarConfiguration,
  AvatarLayerDefinition,
  AvatarOption,
  AvatarPaletteKey,
  ResolvedLayer,
} from "./types";

export const AVATAR_CONFIG_VERSION = "4";

export const DEFAULT_AVATAR_PALETTES = {
  headPalette: "#66d0ff:#302c61",
  kitPalette: "#6954ee:#c8f52a",
  hatPalette: "#302c61:#66d0ff",
  eyewearPalette: "#f3ad16:#241d3d",
} as const;

export const DEFAULT_BACKGROUND_COLOR = "#755ee8";

const PALETTE_KEYS = Object.keys(DEFAULT_AVATAR_PALETTES) as AvatarPaletteKey[];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PALETTE = /^#[0-9a-f]{6}:#[0-9a-f]{6}$/i;

export interface LayerPalette {
  color: string;
  accent: string;
}

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
    ...PALETTE_KEYS,
    "backgroundColor",
  ];

  if (
    values.version !== AVATAR_CONFIG_VERSION ||
    Object.keys(values).length !== expectedKeys.length ||
    expectedKeys.some((key) => typeof values[key] !== "string") ||
    PALETTE_KEYS.some((key) => !PALETTE.test(values[key] as string)) ||
    !HEX_COLOR.test(values.backgroundColor as string)
  ) {
    return false;
  }

  return AVATAR_LAYERS.every((layer) =>
    layer.options.some((option) => option.id === values[layer.kind]),
  );
}

export function resolveAvatar(config: AvatarConfiguration): ResolvedLayer[] {
  const normalized = normalizeAvatar(config);
  return [...AVATAR_LAYERS]
    .sort((left, right) => left.z - right.z)
    .map((layer) => ({
      kind: layer.kind,
      option: paint(layer, resolveOption(layer, normalized), normalized),
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
    ...PALETTE_KEYS.map((key) => [key, normalizePalette(config[key], key)]),
    ["backgroundColor", normalizeColor(config.backgroundColor)],
  ]);
}

export function defaultAvatar(): AvatarConfiguration {
  return normalizeAvatar({});
}

export function layerPalette(
  config: AvatarConfiguration,
  key: AvatarPaletteKey,
): LayerPalette {
  const [color, accent] = normalizePalette(config[key], key).split(":");
  return { color, accent };
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

function normalizePalette(
  palette: string | undefined,
  key: AvatarPaletteKey,
): string {
  return palette && PALETTE.test(palette)
    ? palette.toLowerCase()
    : DEFAULT_AVATAR_PALETTES[key];
}

function normalizeColor(color: string | undefined): string {
  return color && HEX_COLOR.test(color)
    ? color.toLowerCase()
    : DEFAULT_BACKGROUND_COLOR;
}

function paint(
  layer: AvatarLayerDefinition,
  option: AvatarOption,
  config: AvatarConfiguration,
): AvatarOption {
  if (layer.kind !== "background") return option;
  return { ...option, color: config.backgroundColor };
}
