import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AnalyticsProvider } from "./AnalyticsProvider";
import { clearTeamContext, persistTeamContext } from "../team-context";

vi.mock("next/navigation", () => ({ usePathname: () => "/me" }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearTeamContext();
});

it("summarizes before flushing and retains the queued team's identity on exit", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T18:00:00Z"));
  const send = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", send);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  persistTeamContext("player-one", "team-a");
  render(
    <AnalyticsProvider enabled teamContext="player-one/team-a">
      <p>Me</p>
    </AnalyticsProvider>,
  );
  // Empty the opening batch, then change the next visit's preference.
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  send.mockClear();
  vi.advanceTimersByTime(50);
  persistTeamContext("player-one", "team-b");
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  expect(send).toHaveBeenCalledTimes(1);
  const [, options] = send.mock.calls[0];
  expect(new Headers(options.headers).get("X-Zoomigo-Team-Context")).toBe(
    "player-one/team-a",
  );
  expect(JSON.parse(options.body).events).toEqual([
    expect.objectContaining({
      name: "route_summary",
      properties: { route: "me", active_ms: 50, views: 1 },
    }),
  ]);
});

it("sends opening events and the final summary together when a team runtime unmounts", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T18:00:00Z"));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const send = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", send);
  const { unmount } = render(
    <AnalyticsProvider enabled teamContext="player-one/team-a">
      <p>Me</p>
    </AnalyticsProvider>,
  );
  vi.advanceTimersByTime(50);
  persistTeamContext("player-one", "team-b");
  await act(async () => unmount());
  expect(send).toHaveBeenCalledTimes(1);
  const [, options] = send.mock.calls[0];
  expect(new Headers(options.headers).get("X-Zoomigo-Team-Context")).toBe(
    "player-one/team-a",
  );
  expect(
    JSON.parse(options.body).events.map(
      (event: { name: string }) => event.name,
    ),
  ).toEqual(["app_visit_started", "route_summary"]);
});
