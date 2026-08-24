export type AvatarLayerKind =
  | "background"
  | "effect"
  | "kit"
  | "head"
  | "eyes"
  | "mouth"
  | "facialHair"
  | "hat"
  | "eyewear";

export type AvatarCategoryKind = "head" | "kit" | "gear" | "background";

export type AvatarPaletteKey =
  | "headPalette"
  | "kitPalette"
  | "hatPalette"
  | "eyewearPalette";

export interface AvatarOption {
  id: string;
  label: string;
  color?: string;
  unlock?: "daily_drop";
}

export interface AvatarLayerDefinition {
  kind: AvatarLayerKind;
  legend: string;
  z: number;
  defaultOptionID: string;
  paletteKey?: AvatarPaletteKey;
  options: readonly AvatarOption[];
}

export interface AvatarCategoryDefinition {
  id: AvatarCategoryKind;
  label: string;
  layerKinds: readonly AvatarLayerKind[];
}

export type AvatarConfiguration = Readonly<Record<string, string>>;

export interface ResolvedLayer {
  kind: AvatarLayerKind;
  option: AvatarOption;
  z: number;
}
