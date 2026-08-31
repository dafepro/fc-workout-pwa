export async function unlockDevelopmentCatalogItems(): Promise<void> {
  const response = await fetch("/api/zoomigo/__dev/me/unlocks", {
    method: "POST",
  });
  if (!response.ok) throw new Error("Development catalog unlock failed");
}
