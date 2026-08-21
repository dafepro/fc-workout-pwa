export type AppView = "classic" | "momentum" | "team-canvas";

export const appViews = [
  { id: "classic" as const, label: "Classic Alpha", href: "/me" },
  {
    id: "momentum" as const,
    label: "Momentum Alpha",
    href: "/momentum-alpha/me",
  },
  {
    id: "team-canvas" as const,
    label: "Team Canvas",
    href: "/team-canvas/me",
  },
] as const;

export const appViewCopy = {
  label: "App view",
} as const;
