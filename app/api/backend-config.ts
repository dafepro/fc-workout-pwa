function normalize(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

export function resolveBackendBaseURL(
  configured: string | undefined,
): string | null {
  const value = normalize(configured);
  if (!value) return null;

  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "api") {
    throw new Error("ZOOMIGO_API_BASE_URL must use HTTPS");
  }
  return value;
}
