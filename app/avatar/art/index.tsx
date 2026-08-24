import type { ReactNode } from "react";
import type {
  AvatarConfiguration,
  AvatarLayerKind,
  AvatarOption,
} from "../types";
import { renderBackground } from "./backgrounds";
import { EFFECT_ART } from "./effects";
import { EYE_ART } from "./eyes";
import { EYEWEAR_ART } from "./eyewear";
import { FACIAL_HAIR_ART } from "./facial-hair";
import { HAT_ART } from "./hats";
import { HEAD_ART } from "./heads";
import { KIT_ART } from "./kits";
import { MOUTH_ART } from "./mouths";

export const LAYER_ART: Record<
  AvatarLayerKind,
  (option: AvatarOption, config: AvatarConfiguration) => ReactNode
> = {
  background: (option) => renderBackground(option),
  effect: (option) => EFFECT_ART[option.id] ?? null,
  kit: (option, config) => KIT_ART[option.id]?.(config) ?? null,
  head: (option, config) => HEAD_ART[option.id]?.(config) ?? null,
  eyes: (option) => EYE_ART[option.id] ?? null,
  mouth: (option) => MOUTH_ART[option.id] ?? null,
  facialHair: (option) => FACIAL_HAIR_ART[option.id] ?? null,
  hat: (option, config) => HAT_ART[option.id]?.(config) ?? null,
  eyewear: (option, config) => EYEWEAR_ART[option.id]?.(config) ?? null,
};
