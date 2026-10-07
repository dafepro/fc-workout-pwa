export function selectTeam<T extends { id: string }>(
  teams: readonly T[],
  preferredID?: string | null,
): T | undefined {
  return (
    teams.find((team) => team.id === preferredID) ??
    teams.reduce<T | undefined>(
      (first, team) => (!first || team.id < first.id ? team : first),
      undefined,
    )
  );
}

const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
export function encodeTeamPreference(playerID: string, teamID: string): string {
  if (!idPattern.test(playerID) || !idPattern.test(teamID))
    throw Error("Invalid team preference");
  return `${playerID}/${teamID}`;
}

export function decodeTeamPreference(
  value: string | null,
  playerID: string,
): string | null {
  if (!value || value.length > 257) return null;
  const [owner, team, extra] = value.split("/");
  return owner === playerID &&
    idPattern.test(owner) &&
    idPattern.test(team ?? "") &&
    extra === undefined
    ? team
    : null;
}

export const TEAM_CONTEXT_HEADER = "X-Zoomigo-Team-Context";
const storageKey = "zoomigo-team-context:v1";
let activePreference: string | null = null;

export function teamContextHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  let preference = activePreference;
  if (!preference) {
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get(
      "team-context",
    );
    try {
      preference = fragment ?? window.sessionStorage.getItem(storageKey);
    } catch {
      preference = fragment;
    }
  }
  return preference &&
    decodeTeamPreference(preference, preference.split("/")[0])
    ? { [TEAM_CONTEXT_HEADER]: preference }
    : {};
}

export function persistTeamContext(playerID: string, teamID: string): boolean {
  if (typeof window === "undefined") return false;
  activePreference = encodeTeamPreference(playerID, teamID);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (fragment.has("team-context")) {
    fragment.delete("team-context");
    window.history.replaceState(
      null,
      "",
      window.location.pathname +
        window.location.search +
        (fragment.size ? `#${fragment}` : ""),
    );
  }
  try {
    window.sessionStorage.setItem(storageKey, activePreference);
    return true;
  } catch {
    return false;
  }
}

export function clearTeamContext() {
  activePreference = null;
  try {
    if (typeof window !== "undefined")
      window.sessionStorage.removeItem(storageKey);
  } catch {
    /* Restricted storage. */
  }
}

export function fetchWithTeamContext(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const context = Object.entries(teamContextHeaders());
  if (!context.length) return init ? fetch(input, init) : fetch(input);
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  for (const [name, value] of context) headers.set(name, value);
  return fetch(input, { ...init, headers });
}
