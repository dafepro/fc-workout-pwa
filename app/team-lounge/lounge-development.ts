export async function unlockDevelopmentLoungeItems(): Promise<void> {
  const response = await fetch("/api/zoomigo/__dev/me/lounge-unlocks", {
    method: "POST",
  });
  if (!response.ok) throw new Error("Development Lounge unlock failed");
}
