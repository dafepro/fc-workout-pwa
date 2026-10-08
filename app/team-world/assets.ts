import manifest from "../../assets/team-world/manifest.json" with { type: "json" };

export function worldAssetUrl(
  role: "campus" | "pitchGoal" | "pitchScoreboard" | "cannon" | "lamp",
) {
  const entry = manifest.files.find((file) => file.role === role);
  if (!entry?.publicName) throw Error("World asset is not approved");
  return `/team-world-assets/app-${manifest.releaseDigest}/${entry.publicName}`;
}
