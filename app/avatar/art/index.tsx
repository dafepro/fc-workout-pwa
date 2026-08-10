import type { ReactNode } from "react";
import type { AvatarLayerKind, AvatarOption } from "../types";
import { renderBackground } from "./backgrounds";
import { EYEWEAR_ART } from "./eyewear";
import { HEAD_ART } from "./heads";

/** Adding a layer kind means adding one entry here and one to AVATAR_LAYERS.
 * Nothing outside app/avatar/ changes. */
export const LAYER_ART: Record<
  AvatarLayerKind,
  (option: AvatarOption) => ReactNode
> = {
  background: renderBackground,
  head: (option) => HEAD_ART[option.id] ?? null,
  eyewear: (option) => EYEWEAR_ART[option.id] ?? null,
};
