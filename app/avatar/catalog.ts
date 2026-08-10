import { copy } from "../content/copy";
import type { AvatarLayerDefinition } from "./types";

const labels = copy.avatar.options;

/** The single source of truth for avatar parts. The server validates shape only,
 * so this list decides what actually exists. Kept free of JSX so the resolver
 * and its tests can import pure data. */
export const AVATAR_LAYERS: readonly AvatarLayerDefinition[] = [
  {
    kind: "background",
    legend: copy.avatar.legends.background,
    control: "swatch",
    z: 0,
    defaultOptionID: "kit",
    options: [
      { id: "kit", label: labels.background.kit },
      { id: "sky", label: labels.background.sky, color: "#66d0ff" },
      { id: "lime", label: labels.background.lime, color: "#c7f23a" },
      { id: "grape", label: labels.background.grape, color: "#c99cff" },
      { id: "sunrise", label: labels.background.sunrise, color: "#ffca63" },
      { id: "ocean", label: labels.background.ocean, color: "#3e70ee" },
      { id: "mint", label: labels.background.mint, color: "#7be3d2" },
      { id: "coral", label: labels.background.coral, color: "#ff8f79" },
      { id: "night", label: labels.background.night, color: "#3b3f6b" },
    ],
  },
  {
    kind: "head",
    legend: copy.avatar.legends.head,
    control: "card",
    z: 10,
    defaultOptionID: "dog",
    options: [
      { id: "dog", label: labels.head.dog },
      { id: "cheetah", label: labels.head.cheetah },
      { id: "player", label: labels.head.player },
    ],
  },
  {
    kind: "eyewear",
    legend: copy.avatar.legends.eyewear,
    control: "card",
    z: 20,
    defaultOptionID: "none",
    options: [
      { id: "none", label: labels.eyewear.none },
      { id: "aviators", label: labels.eyewear.aviators },
      { id: "round", label: labels.eyewear.round },
      { id: "visor", label: labels.eyewear.visor },
    ],
  },
];
