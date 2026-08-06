export type BackendBindings = {
  zoomigo?: string;
  stridecrew?: string;
};

function normalize(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

export function resolveBackendBaseURL({
  zoomigo,
  stridecrew,
}: BackendBindings): string | null {
  const preferred = normalize(zoomigo);
  const legacy = normalize(stridecrew);

  if (preferred && legacy && preferred !== legacy) {
    throw new Error(
      "ZOOMIGO_API_BASE_URL and legacy STRIDECREW_API_BASE_URL conflict",
    );
  }

  const value = preferred || legacy;
  if (!value) return null;

  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "api") {
    throw new Error("ZOOMIGO_API_BASE_URL must use HTTPS");
  }
  return value;
}
