export type BuildProfile = "production" | "development";

export function resolveBuildProfile(value: string | undefined): BuildProfile {
  if (value === undefined || value === "" || value === "production") {
    return "production";
  }
  if (value === "development") return "development";
  throw new Error(`Unsupported ZOOMIGO_BUILD_PROFILE: ${value}`);
}
