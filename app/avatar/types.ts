export type AvatarLayerKind = "background" | "head" | "eyewear";

export interface AvatarOption {
  id: string;
  /** Catalog-owned. Never derived from a stored value, so a stale slug cannot
   * become label text. */
  label: string;
  /** Solid fill for background options. Absent means "use the player color". */
  color?: string;
}

export interface AvatarLayerDefinition {
  kind: AvatarLayerKind;
  legend: string;
  control: "swatch" | "card";
  /** Paint order, low to high. */
  z: number;
  defaultOptionID: string;
  options: readonly AvatarOption[];
}

/** Stored shape: layer kind -> option id. Unknown keys and unknown ids are
 * ignored on read, which is what makes adding a layer kind additive. */
export type AvatarConfiguration = Readonly<Record<string, string>>;

export interface ResolvedLayer {
  kind: AvatarLayerKind;
  /** Always a catalog object, never a raw stored slug. */
  option: AvatarOption;
  z: number;
}
