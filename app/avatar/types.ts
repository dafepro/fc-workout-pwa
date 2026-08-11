export type AvatarLayerKind =
  | "background"
  | "effect"
  | "kit"
  | "head"
  | "hat"
  | "eyewear";

export type AvatarCategoryKind = "head" | "kit" | "gear" | "colors" | "effect";

export interface AvatarOption {
  id: string;
  label: string;
  color?: string;
  unlock?: "advancement";
}

export interface AvatarLayerDefinition {
  kind: AvatarLayerKind;
  legend: string;
  z: number;
  defaultOptionID: string;
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
