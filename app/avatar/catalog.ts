import { copy } from "../content/copy";
import type { AvatarCategoryDefinition, AvatarLayerDefinition } from "./types";

const labels = copy.avatar.options;

export const AVATAR_LAYERS: readonly AvatarLayerDefinition[] = [
  {
    kind: "background",
    legend: copy.avatar.legends.background,
    z: 0,
    defaultOptionID: "solid",
    options: [{ id: "solid", label: labels.background.solid }],
  },
  {
    kind: "effect",
    legend: copy.avatar.legends.effect,
    z: 5,
    defaultOptionID: "none",
    options: [
      { id: "none", label: labels.effect.none },
      { id: "orbit", label: labels.effect.orbit },
      { id: "pulse", label: labels.effect.pulse },
    ],
  },
  {
    kind: "kit",
    legend: copy.avatar.legends.kit,
    z: 10,
    defaultOptionID: "violet",
    paletteKey: "kitPalette",
    options: [
      { id: "violet", label: labels.kit.violet },
      { id: "ocean", label: labels.kit.ocean },
      { id: "coral", label: labels.kit.coral },
      { id: "lime", label: labels.kit.lime },
      { id: "midnight", label: labels.kit.midnight },
      { id: "keeper", label: labels.kit.keeper },
      { id: "sunset", label: labels.kit.sunset },
      { id: "classic", label: labels.kit.classic },
    ],
  },
  {
    kind: "head",
    legend: copy.avatar.legends.head,
    z: 20,
    defaultOptionID: "person-round",
    paletteKey: "headPalette",
    options: [
      { id: "person-round", label: labels.head.personRound },
      { id: "person-tall", label: labels.head.personTall },
      { id: "person-curls", label: labels.head.personCurls },
      { id: "dog", label: labels.head.dog, unlock: "advancement" },
      { id: "cheetah", label: labels.head.cheetah, unlock: "advancement" },
      { id: "fox", label: labels.head.fox, unlock: "advancement" },
    ],
  },
  {
    kind: "hat",
    legend: copy.avatar.legends.hat,
    z: 25,
    defaultOptionID: "none",
    paletteKey: "hatPalette",
    options: [
      { id: "none", label: labels.hat.none },
      { id: "cap", label: labels.hat.cap },
      { id: "beanie", label: labels.hat.beanie },
      { id: "headband", label: labels.hat.headband },
      { id: "crown", label: labels.hat.crown },
    ],
  },
  {
    kind: "eyewear",
    legend: copy.avatar.legends.eyewear,
    z: 30,
    defaultOptionID: "none",
    paletteKey: "eyewearPalette",
    options: [
      { id: "none", label: labels.eyewear.none },
      { id: "aviators", label: labels.eyewear.aviators },
      { id: "round", label: labels.eyewear.round },
      { id: "goggles", label: labels.eyewear.goggles },
      { id: "stars", label: labels.eyewear.stars },
    ],
  },
];

export const AVATAR_CATEGORIES: readonly AvatarCategoryDefinition[] = [
  { id: "head", label: copy.avatar.categories.head, layerKinds: ["head"] },
  { id: "kit", label: copy.avatar.categories.kit, layerKinds: ["kit"] },
  {
    id: "gear",
    label: copy.avatar.categories.gear,
    layerKinds: ["hat", "eyewear"],
  },
  {
    id: "background",
    label: copy.avatar.categories.background,
    layerKinds: ["background", "effect"],
  },
];
