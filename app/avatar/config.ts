import { AVATAR_LAYERS } from "./catalog";
import type {
  AvatarConfiguration,
  AvatarLayerDefinition,
  AvatarOption,
  ResolvedLayer,
} from "./types";

/** The one place a stored slug is turned into a part. Every miss lands on the
 * layer default, so an option retired from the catalog degrades to a working
 * avatar instead of a blank one. */
export function resolveAvatar(
  config: AvatarConfiguration,
  fallbackBackground: string,
): ResolvedLayer[] {
  return [...AVATAR_LAYERS]
    .sort((left, right) => left.z - right.z)
    .map((layer) => ({
      kind: layer.kind,
      option: paint(layer, resolveOption(layer, config), fallbackBackground),
      z: layer.z,
    }));
}

/** The canonical form we save: every layer stated once, unknown keys dropped.
 * Matches what the server marshals back, so a save leaves no drift. */
export function normalizeAvatar(
  config: AvatarConfiguration,
): AvatarConfiguration {
  return Object.fromEntries(
    AVATAR_LAYERS.map((layer) => [layer.kind, resolveOption(layer, config).id]),
  );
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

/** A background option with no color of its own means "use the player color", so
 * the hashed default and a deliberate choice stay distinguishable in storage. */
function paint(
  layer: AvatarLayerDefinition,
  option: AvatarOption,
  fallbackBackground: string,
): AvatarOption {
  if (layer.kind !== "background" || option.color) return option;
  return { ...option, color: fallbackBackground };
}
