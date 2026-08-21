function normalize(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

export function resolveBackendBaseURL(
  configured: string | undefined,
  allowDevelopmentLoopback = false,
): string | null {
  const value = normalize(configured);
  if (!value) return null;

  const parsed = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (
    parsed.protocol !== "https:" &&
    parsed.hostname !== "api" &&
    !(allowDevelopmentLoopback && loopback)
  ) {
    throw new Error("ZOOMIGO_API_BASE_URL must use HTTPS");
  }
  return value;
}

export function resolveBackendRequired(
  configured: string | undefined,
): boolean {
  const value = (configured ?? "").trim().toLowerCase();
  if (value === "true") return true;
  if (value === "" || value === "false") return false;
  throw new Error("ZOOMIGO_REQUIRE_BACKEND must be true or false");
}

export function missingBackendCodeFor(required: boolean): string {
  return required ? "backend_required" : "backend_not_configured";
}
