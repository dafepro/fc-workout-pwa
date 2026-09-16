export function createAuthority({ baseURL, key, gatewayKey }) {
  const grants = new WeakMap();
  const request = async (path, body) => {
    const response = await fetch(new URL(path, baseURL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        ...(gatewayKey ? { "X-Zoomigo-Dev-Gateway": gatewayKey } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
      redirect: "error",
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw Error("Team World authority unavailable");
    return response.json();
  };
  return {
    async authenticate(ticket, room) {
      const result = await request("/internal/team-world/join", {
        ticket,
        room,
      });
      if (!result) return null;
      const identity = result.identity;
      if (
        !identity ||
        typeof identity.id !== "string" ||
        typeof identity.name !== "string" ||
        !["burgundy", "saffron", "sage"].includes(identity.appearance) ||
        typeof result.grant !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(result.grant)
      )
        throw Error("Invalid authority response");
      const safe = {
        id: identity.id,
        name: identity.name,
        appearance: identity.appearance,
      };
      grants.set(safe, {
        grant: result.grant,
        room,
        checkedAt: 0,
        pending: null,
      });
      return safe;
    },
    async canAccess(identity, room) {
      const entry = grants.get(identity);
      if (!entry || entry.room !== room) return false;
      // Collapse high-frequency movement checks; denial/error is never cached as access.
      if (Date.now() - entry.checkedAt < 1000) return true;
      if (!entry.pending)
        entry.pending = request("/internal/team-world/access", {
          grant: entry.grant,
          room,
        })
          .then((result) => {
            const allowed = result?.allowed === true;
            if (allowed) entry.checkedAt = Date.now();
            else grants.delete(identity);
            return allowed;
          })
          .finally(() => {
            entry.pending = null;
          });
      return entry.pending;
    },
  };
}
