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
import { RARE_EFFECT_ART } from "./rare-effects";
import { RARE_EYEWEAR_ART, RARE_HAT_ART } from "./rare-accessories";
import { RARE_HEAD_ART } from "./rare-heads";
import { RARE_KIT_ART } from "./rare-kits";

const EFFECTS = { ...EFFECT_ART, ...RARE_EFFECT_ART };
const KITS = { ...KIT_ART, ...RARE_KIT_ART };
const HEADS = { ...HEAD_ART, ...RARE_HEAD_ART };
const HATS = { ...HAT_ART, ...RARE_HAT_ART };
const EYEWEAR = { ...EYEWEAR_ART, ...RARE_EYEWEAR_ART };

export const LAYER_ART: Record<
  AvatarLayerKind,
  (option: AvatarOption, config: AvatarConfiguration) => ReactNode
> = {
  background: (option) => renderBackground(option),
  effect: (option) => EFFECTS[option.id] ?? null,
  kit: (option, config) => KITS[option.id]?.(config) ?? null,
  head: (option, config) => HEADS[option.id]?.(config) ?? null,
  hat: (option, config) => HATS[option.id]?.(config) ?? null,
  eyewear: (option, config) => EYEWEAR[option.id]?.(config) ?? null,
};
