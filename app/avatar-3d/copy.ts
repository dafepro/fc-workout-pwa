export const avatar3dCopy = {
  loading: "Loading 3D avatar",
  ready: "3D avatar ready",
  unavailable: "3D preview unavailable",
  fallbackLabel: "Zoomigo avatar fallback",
  reducedMotion: "Reduced motion is on; idle flourish is paused.",
  demo: {
    eyebrow: "ZoomiGo avatar art lab",
    title: "One player. A whole squad of looks.",
    intro:
      "Review original, production-format character art on the canonical animated rig. Every choice below loads a real optimized GLB.",
    customizeLabel: "Build the player",
    stepLabel: "Art review build",
    chooseItem: "Style",
    chooseColor: "Color",
    skinToneLabel: "Skin tone",
    noneLabels: {
      headwear: "No headwear",
      eyewear: "No eyewear",
      back: "No back gear",
    },
    hiddenHair: "Your hairstyle is saved and hidden under this item.",
    animationLabel: "Try an animation",
    currentAnimation: "Current animation",
    viewLabel: "Inspect the art",
    itemKinds: {
      skinned: "Skinned to the player rig",
      socket: "Attached at a named socket",
    },
    catalogSummary:
      "27 authored assets · 6 skin tones · 8 gear colors · 6 animation clips",
    reviewNote:
      "Isolated review only. Nothing is saved and this is not connected to the player app.",
  },
} as const;
