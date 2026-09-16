interface WorldProxyEnv {
  DEV_ACCESS_ENABLED?: string;
  ZOOMIGO_API_BASE_URL?: string;
  ZOOMIGO_API_GATEWAY_TOKEN?: string;
}
// Called only after the outer gate has authenticated this request.
export function teamWorldUpstream(
  request: Request,
  env: WorldProxyEnv,
): Request | null {
  const url = new URL(request.url);
  if (
    env.DEV_ACCESS_ENABLED !== "true" ||
    url.pathname !== "/room" ||
    request.method !== "GET" ||
    request.headers.get("Upgrade")?.toLowerCase() !== "websocket" ||
    request.headers.get("Origin") !== url.origin ||
    !env.ZOOMIGO_API_BASE_URL ||
    !env.ZOOMIGO_API_GATEWAY_TOKEN
  )
    return null;
  const base = new URL(env.ZOOMIGO_API_BASE_URL);
  if (base.protocol !== "https:") return null;
  const headers = new Headers();
  for (const name of [
    "Upgrade",
    "Connection",
    "Origin",
    "Sec-WebSocket-Key",
    "Sec-WebSocket-Version",
    "Sec-WebSocket-Protocol",
    "Sec-WebSocket-Extensions",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("X-Zoomigo-Dev-Gateway", env.ZOOMIGO_API_GATEWAY_TOKEN);
  return new Request(new URL("/room", base), { headers, redirect: "manual" });
}
