export const avatar3dCopy = {
  loading: "Loading 3D avatar",
  ready: "3D avatar ready",
  unavailable: "3D preview unavailable",
  fallbackLabel: "Zoomigo avatar fallback",
  reducedMotion: "Reduced motion is on; idle flourish is paused.",
  demo: {
    eyebrow: "Zoomigo avatar runtime",
    title: "One character. Real movement. Built to grow.",
    intro:
      "This engineering preview loads a repository-owned GLB through the same runtime seam planned for profiles, rewards, and the team lounge.",
    controlsLabel: "Animation preview",
    currentAnimation: "Current animation",
    engineeringTitle: "What this proves",
    engineeringPoints: [
      "A real GLB loads through a validated canonical-rig contract.",
      "Application state selects animations without networking bone transforms.",
      "Renderer or asset failure leaves a safe, usable DOM fallback.",
    ],
    referenceNote:
      "The reference character proves the pipeline and lifecycle. It is not the final art direction.",
  },
} as const;
