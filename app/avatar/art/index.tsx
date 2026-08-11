import type { ReactNode } from "react";
import type {
  AvatarConfiguration,
  AvatarLayerKind,
  AvatarOption,
} from "../types";
import { renderBackground } from "./backgrounds";
import { EFFECT_ART } from "./effects";
import { EYEWEAR_ART } from "./eyewear";
import { HAT_ART } from "./hats";
import { HEAD_ART } from "./heads";
import { KIT_ART } from "./kits";

export const LAYER_ART: Record<
  AvatarLayerKind,
  (option: AvatarOption, config: AvatarConfiguration) => ReactNode
> = {
  background: (option) => renderBackground(option),
  effect: (option) => EFFECT_ART[option.id] ?? null,
  kit: (option, config) => KIT_ART[option.id]?.(config) ?? null,
  head: (option, config) => HEAD_ART[option.id]?.(config) ?? null,
  hat: (option, config) => HAT_ART[option.id]?.(config) ?? null,
  eyewear: (option, config) => EYEWEAR_ART[option.id]?.(config) ?? null,
};
