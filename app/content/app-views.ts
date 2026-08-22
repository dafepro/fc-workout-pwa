export type AppView = "default" | "classic" | "momentum" | "team-canvas";

export const appViews = [
  {
    id: "default" as const,
    label: "Consolidated default",
    href: "/me",
  },
  {
    id: "classic" as const,
    label: "Classic Alpha",
    href: "/classic-alpha/me",
  },
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
  label: "Experience",
} as const;
