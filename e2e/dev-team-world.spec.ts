import { expect, test, type Page } from "@playwright/test";
import type { Simulation } from "zmap";

test("dev keeps the outer gate and supports two qualified Team World players", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.DEV_WORLD_RELEASE_GATE !== "true",
    "Explicit deployed-dev verification only",
  );
  test.setTimeout(120000);
  // Credential-directory contents must never be recorded in traces or screenshots.
  const friend = await browser.newContext({
    baseURL: process.env.E2E_PWA_BASE_URL,
  });
  const other = await friend.newPage();
  const entries: { page: Page; id: string }[] = [];
  const state: { session?: string; simulation?: Simulation } = {};
  const peer: { simulation?: Simulation } = {};
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      const m = JSON.parse(String(payload));
      if (m.type === "welcome") state.session = m.session;
      if (m.state) state.simulation = m.state;
    }),
  );
  other.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      const m = JSON.parse(String(payload));
      if (m.state) peer.simulation = m.state;
    }),
  );
  try {
    for (const [p, name] of [
      [page, "Mason"],
      [other, "Ava"],
    ] as const) {
      await p.goto("/dev-access");
      await expect(p.getByLabel("Password", { exact: true })).toBeVisible();
      await p
        .getByLabel("Password", { exact: true })
        .fill(process.env.DEV_ACCESS_PASSWORD!);
      await p.getByRole("button", { name: "Continue", exact: true }).click();
      const player = p
        .locator(".dev-player-list li")
        .filter({ has: p.getByRole("heading", { name: new RegExp(name) }) });
      await player.getByRole("link").click();
      await p.locator("form[data-credential-ready='true']").waitFor();
      await p.getByLabel("Four-digit PIN").fill("1111");
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      await p.getByRole("link", { name: /Log another activity/i }).click();
      await p
        .getByRole("button", { name: "Choose an activity", exact: true })
        .click();
      await p.getByRole("radio", { name: /^Hill Sprints/i }).click();
      const saved = p.waitForResponse(
        (r) =>
          r.url().includes("/api/zoomigo/v1/me/training-entries") &&
          r.request().method() === "POST",
      );
      await p.getByRole("button", { name: /^Save / }).click();
      const response = await saved;
      expect(response.status()).toBe(201);
      entries.push({ page: p, id: (await response.json()).id });
      await p.goto("/team-world");
      await expect(p.getByText("Live together", { exact: true })).toBeVisible({
        timeout: 30000,
      });
    }
    await expect(page.getByText("2 players", { exact: true })).toBeVisible();
    await expect
      .poll(() => peer.simulation?.players[state.session!]?.x)
      .not.toBeUndefined();
    const start = peer.simulation!.players[state.session!];
    await page.locator(".team-world-canvas canvas").focus();
    await page.keyboard.down("d");
    await expect
      .poll(
        () =>
          Math.hypot(
            (peer.simulation?.players[state.session!]?.x ?? start.x) - start.x,
            (peer.simulation?.players[state.session!]?.z ?? start.z) - start.z,
          ),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0.3);
    await page.keyboard.up("d");
    await page
      .getByRole("combobox", { name: "Equipment", exact: true })
      .selectOption("rebound-panel");
    await expect
      .poll(() => peer.simulation?.actions?.players[state.session!]?.tool)
      .toBe("rebound-panel");
    await page
      .getByRole("combobox", { name: "Expression", exact: true })
      .selectOption("wave");
    await expect
      .poll(
        () =>
          peer.simulation?.actions?.players[state.session!]?.performance?.emote
            ?.id,
      )
      .toBe("wave");
    await page.goto("/team");
    await expect(other.getByText("1 player", { exact: true })).toBeVisible({
      timeout: 10000,
    });
  } finally {
    await page.keyboard.up("d");
    for (const { page: p, id } of entries) {
      const removed = await p.request.delete(
        `/api/zoomigo/v1/training-entries/${encodeURIComponent(id)}`,
        { headers: { Origin: new URL(p.url()).origin } },
      );
      expect(removed.status()).toBe(204);
    }
    await friend.close();
  }
});
// These runs visit live dev credentials; retain no authentication artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });
