import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectTeam,
  clearTeamContext,
  persistTeamContext,
  teamContextHeaders,
  TEAM_CONTEXT_HEADER,
  decodeTeamPreference,
  encodeTeamPreference,
  fetchWithTeamContext,
} from "./team-context";

afterEach(() => {
  vi.unstubAllGlobals();
  clearTeamContext();
});

describe("authenticated team preference", () => {
  const teams = [
    { id: "team-z", name: "A" },
    { id: "team-a", name: "Z" },
  ];
  it("defaults by stable ID and survives name or response-order changes", () => {
    expect(selectTeam(teams)?.id).toBe("team-a");
    expect(
      selectTeam([...teams].reverse().map((t) => ({ ...t, name: "Renamed" })))
        ?.id,
    ).toBe("team-a");
  });
  it("selects only a current membership and falls back after revocation", () => {
    expect(selectTeam(teams, "team-z")?.id).toBe("team-z");
    expect(selectTeam(teams, "unknown")?.id).toBe("team-a");
    expect(selectTeam([], "team-z")).toBeUndefined();
  });
  it("scopes a bounded preference to the authenticated player", () => {
    const value = encodeTeamPreference("player-one", "team-z");
    expect(decodeTeamPreference(value, "player-one")).toBe("team-z");
    expect(decodeTeamPreference(value, "player-two")).toBeNull();
    for (const raw of [
      null,
      "",
      "player-one/team-z/extra",
      "player-one/../team",
      "x".repeat(300),
    ]) {
      expect(decodeTeamPreference(raw, "player-one")).toBeNull();
    }
  });
});

describe("tab context recovery", () => {
  beforeEach(() => {
    clearTeamContext();
    sessionStorage.clear();
    history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });
  it("pins the resolved default when a lower-ID membership arrives", () => {
    persistTeamContext("player-one", "team-z");
    const preferred = decodeTeamPreference(
      teamContextHeaders()[TEAM_CONTEXT_HEADER],
      "player-one",
    );
    expect(
      selectTeam([{ id: "team-z" }, { id: "team-a" }], preferred)?.id,
    ).toBe("team-z");
  });
  it("hands off a bounded preference while retaining unrelated fragments", () => {
    history.replaceState(
      null,
      "",
      "/#team-context=player-one%2Fteam-z&section=sessions",
    );
    expect(teamContextHeaders()[TEAM_CONTEXT_HEADER]).toBe("player-one/team-z");
    expect(
      decodeTeamPreference(
        teamContextHeaders()[TEAM_CONTEXT_HEADER],
        "player-other",
      ),
    ).toBeNull();
    persistTeamContext("player-one", "team-z");
    expect(location.hash).toBe("#section=sessions");
  });
  it("retains the validated visit in memory when storage is restricted", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("restricted");
    });
    expect(persistTeamContext("player-one", "team-z")).toBe(false);
    expect(teamContextHeaders()[TEAM_CONTEXT_HEADER]).toBe("player-one/team-z");
  });
  it("retains request headers and idempotency while attaching the tab context", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    persistTeamContext("player-one", "team-z");
    const request = new Request("http://localhost/api/zoomigo/v1/example", {
      headers: { "Idempotency-Key": "attempt-one" },
    });
    await fetchWithTeamContext(request);
    const headers = new Headers(fetch.mock.calls[0][1].headers);
    expect(headers.get("Idempotency-Key")).toBe("attempt-one");
    expect(headers.get(TEAM_CONTEXT_HEADER)).toBe("player-one/team-z");
  });
});
