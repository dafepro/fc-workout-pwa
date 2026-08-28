export type BuildProfile = "production" | "development";

const STANDARD_PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"];

export function resolveBuildProfile(value: string | undefined): BuildProfile {
  if (value === undefined || value === "" || value === "production") {
    return "production";
  }
  if (value === "development") return "development";
  throw new Error(`Unsupported ZOOMIGO_BUILD_PROFILE: ${value}`);
}

export function pageExtensionsFor(profile: BuildProfile): string[] {
  return profile === "development"
    ? [...STANDARD_PAGE_EXTENSIONS, "dev.tsx", "dev.ts"]
    : [...STANDARD_PAGE_EXTENSIONS];
}
