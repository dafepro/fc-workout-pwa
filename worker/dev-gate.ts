export interface DevGateEnv {
  DEV_ACCESS_ENABLED?: string;
  DEV_ACCESS_PASSWORD?: string;
  DEV_ACCESS_SESSION_KEY?: string;
  DEV_ALLOWED_REGION_CODES?: string;
}

const cookieName = "zoomigo_dev_access";
const sessionLifetimeSeconds = 8 * 60 * 60;
const encoder = new TextEncoder();

export function devServiceWorkerResponse(
  request: Request,
  env: DevGateEnv,
): Response | null {
  if (
    env.DEV_ACCESS_ENABLED !== "true" ||
    new URL(request.url).pathname !== "/sw.js"
  ) {
    return null;
  }
  return new Response(
    `self.addEventListener("install",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))));self.skipWaiting()});self.addEventListener("activate",event=>{event.waitUntil(self.registration.unregister());self.clients.claim()});`,
    {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "private, no-store, max-age=0",
        "service-worker-allowed": "/",
      },
    },
  );
}

type CloudflareRequest = Request & {
  cf?: { country?: string; regionCode?: string };
};

const censusMidwestRegions = new Set([
  "IL",
  "IN",
  "IA",
  "KS",
  "MI",
  "MN",
  "MO",
  "NE",
  "ND",
  "OH",
  "SD",
  "WI",
]);

export async function gateDevRequest(
  request: Request,
  env: DevGateEnv,
): Promise<Response | null> {
  if (env.DEV_ACCESS_ENABLED !== "true") return null;
  if (
    !env.DEV_ACCESS_PASSWORD ||
    env.DEV_ACCESS_PASSWORD.length < 12 ||
    !env.DEV_ACCESS_SESSION_KEY ||
    env.DEV_ACCESS_SESSION_KEY.length < 32
  ) {
    return lockedResponse(503, "Preview unavailable");
  }

  const cf = (request as CloudflareRequest).cf;
  const allowedRegions = env.DEV_ALLOWED_REGION_CODES
    ? new Set(
        env.DEV_ALLOWED_REGION_CODES.split(",")
          .map((region) => region.trim().toUpperCase())
          .filter(Boolean),
      )
    : censusMidwestRegions;
  if (
    cf?.country !== "US" ||
    !cf.regionCode ||
    !allowedRegions.has(cf.regionCode)
  ) {
    return lockedResponse(403, "Unavailable");
  }

  const url = new URL(request.url);
  if (url.pathname === "/_dev-gate" && request.method === "POST") {
    return createSession(request, {
      DEV_ACCESS_PASSWORD: env.DEV_ACCESS_PASSWORD,
      DEV_ACCESS_SESSION_KEY: env.DEV_ACCESS_SESSION_KEY,
    });
  }
  if (url.pathname === "/_dev-gate" && request.method === "GET") {
    return gatePage(url.searchParams.get("next") ?? "/dev-access");
  }

  const cookie = readCookie(request.headers.get("cookie"), cookieName);
  if (cookie && (await validSession(cookie, env.DEV_ACCESS_SESSION_KEY))) {
    return null;
  }

  const next = `${url.pathname}${url.search}`;
  return new Response(null, {
    status: 303,
    headers: {
      location: `/_dev-gate?next=${encodeURIComponent(next)}`,
      ...privateHeaders(),
    },
  });
}

async function createSession(
  request: Request,
  env: { DEV_ACCESS_PASSWORD: string; DEV_ACCESS_SESSION_KEY: string },
) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return gatePage("/dev-access", 400, true);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 2048) return gatePage("/dev-access", 413, true);
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > 2048) {
    return gatePage("/dev-access", 413, true);
  }
  const form = new URLSearchParams(raw);
  const supplied = form.get("password") ?? "";
  const expected = env.DEV_ACCESS_PASSWORD;
  if (!(await equalSecrets(supplied, expected))) {
    return gatePage(safeNext(form.get("next") ?? ""), 401, true);
  }

  const expires = Math.floor(Date.now() / 1000) + sessionLifetimeSeconds;
  const payload = String(expires);
  const signature = await sign(payload, env.DEV_ACCESS_SESSION_KEY);
  return new Response(null, {
    status: 303,
    headers: {
      location: safeNext(form.get("next") ?? ""),
      "set-cookie": `${cookieName}=${payload}.${signature}; Path=/; Max-Age=${sessionLifetimeSeconds}; HttpOnly; Secure; SameSite=Strict`,
      ...privateHeaders(),
    },
  });
}

async function validSession(value: string, key: string) {
  const separator = value.indexOf(".");
  if (separator < 1) return false;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expires = Number(payload);
  if (!Number.isSafeInteger(expires) || expires <= Date.now() / 1000) {
    return false;
  }
  return equalSecrets(signature, await sign(payload, key));
}

async function sign(payload: string, key: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payload)),
  );
  return base64URL(bytes);
}

async function equalSecrets(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function base64URL(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function readCookie(header: string | null, name: string) {
  for (const item of (header ?? "").split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

function safeNext(value: string) {
  try {
    const parsed = new URL(value, "https://dev.zoomigo.invalid");
    if (
      !value.startsWith("/") ||
      value.startsWith("//") ||
      parsed.origin !== "https://dev.zoomigo.invalid"
    ) {
      return "/dev-access";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dev-access";
  }
}

function gatePage(next: string, status = 200, failed = false) {
  const escapedNext = escapeHTML(safeNext(next));
  const nonce = base64URL(crypto.getRandomValues(new Uint8Array(16)));
  const error = failed
    ? '<p role="alert">That password did not match.</p>'
    : "";
  return new Response(
    `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zoomigo preview</title><style>body{font-family:system-ui;background:#f4f1e8;color:#17211b;margin:0}main{max-width:26rem;margin:12vh auto;padding:2rem}form{display:grid;gap:1rem}input,button{font:inherit;padding:.8rem;border-radius:.5rem}button{background:#173f35;color:white;border:0}</style><main><h1>Zoomigo preview</h1><p>Enter the shared preview password.</p>${error}<form method="post" action="/_dev-gate"><input id="preview-next" type="hidden" name="next" value="${escapedNext}"><label>Password <input name="password" type="password" required autocomplete="current-password"></label><button type="submit">Continue</button></form></main><script nonce="${nonce}">const next=document.getElementById("preview-next");if(location.hash&&next.value.startsWith("/login")){next.value+=location.hash}</script></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        ...privateHeaders(nonce),
      },
    },
  );
}

function lockedResponse(status: number, message: string) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...privateHeaders(),
    },
  });
}

function privateHeaders(scriptNonce?: string) {
  return {
    "cache-control": "private, no-store, max-age=0",
    "content-security-policy": `default-src 'none'; style-src 'unsafe-inline';${scriptNonce ? ` script-src 'nonce-${scriptNonce}';` : ""} form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function escapeHTML(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}
