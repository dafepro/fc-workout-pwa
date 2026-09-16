import { expect, request, test, type Page } from "@playwright/test";
import type { Simulation } from "zmap";
import { loginAsMason, loginAsAva } from "./app-ready";

const apiURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";
// The default suite has no v3 relay. Enable only for the documented local topology.
test.skip(
  process.env.E2E_TEAM_WORLD !== "1",
  "Requires the local Team World relay and API configuration",
);
test.beforeEach(async () => {
  const api = await request.newContext({ baseURL: apiURL });
  const reset = await api.post("/__e2e/reset", {
    headers: { "X-E2E-Reset-Key": resetKey },
  });
  expect(reset.status()).toBe(204);
  await api.dispose();
});
function observe(page: Page) {
  const data: { session?: string; state?: Simulation; errors: string[] } = {
    errors: [],
  };
  page.on("pageerror", (error) => data.errors.push(error.message));
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/room") return;
    socket.on("framereceived", ({ payload }) => {
      const m = JSON.parse(String(payload));
      if (m.type === "welcome") data.session = m.session;
      if (m.type === "room" || m.type === "snapshot") data.state = m.state;
    });
  });
  return data;
}
test("two real accounts share movement, tools and emotes; route exit releases the world", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const a = observe(page);
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  const friend = await browser.newContext();
  const b = await friend.newPage();
  const peer = observe(b);
  try {
    await loginAsAva(b);
    await b.goto("/team-world");
    await expect(b.getByText("Live together", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("2 players", { exact: true })).toBeVisible();
    await expect
      .poll(() => peer.state?.players[a.session!]?.x)
      .not.toBeUndefined();
    const start = peer.state!.players[a.session!];
    await page.locator(".team-world-canvas canvas").focus();
    await page.keyboard.down("d");
    await expect
      .poll(() =>
        Math.hypot(
          (peer.state?.players[a.session!]?.x ?? start.x) - start.x,
          (peer.state?.players[a.session!]?.z ?? start.z) - start.z,
        ),
      )
      .toBeGreaterThan(0.3);
    await page.keyboard.up("d");
    await page
      .locator("summary")
      .filter({ hasText: /^Equipment$/ })
      .click();
    await page
      .getByRole("combobox", { name: "Equipment", exact: true })
      .selectOption("rebound-panel");
    await expect
      .poll(() => peer.state?.actions?.players[a.session!]?.tool)
      .toBe("rebound-panel");
    await page
      .locator("summary")
      .filter({ hasText: /^Expression$/ })
      .click();
    await page
      .getByRole("combobox", { name: "Expression", exact: true })
      .selectOption("wave");
    await expect
      .poll(
        () => peer.state?.actions?.players[a.session!]?.performance?.emote?.id,
      )
      .toBe("wave");
    await page.setViewportSize({ width: 320, height: 720 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator("summary")
      .filter({ hasText: /^Move & play$/ })
      .click();
    await page
      .getByRole("combobox", { name: "Movement mode", exact: true })
      .selectOption("joystick");
    await expect(page.locator(".team-world-stick")).toBeVisible();
    await page.getByRole("link", { name: "Back to Team", exact: true }).click();
    await expect(page.locator(".team-world-canvas canvas")).toHaveCount(0);
    await expect(b.getByText("1 player", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    expect(a.errors).toEqual([]);
    expect(peer.errors).toEqual([]);
  } finally {
    await friend.close();
  }
});

test("a revoked real session loses room access", async ({ page }) => {
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  const response = await page.request.delete("/api/auth/session", {
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(response.ok()).toBe(true);
  await expect(
    page.getByText("This room is unavailable", { exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await page
    .locator("summary")
    .filter({ hasText: /^Move & play$/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Kick ball", exact: true }),
  ).toBeDisabled();
});

test("fullscreen overlays resize the world and remain usable at phone widths", async ({
  page,
}) => {
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  const world = page.getByRole("region", { name: "Team World", exact: true });
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect(world).toHaveClass(/team-world--fullscreen/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const r = document
          .querySelector(".team-world-canvas")!
          .getBoundingClientRect();
        return (
          Math.abs(r.height - innerHeight) < 2 &&
          Math.abs(r.width - innerWidth) < 2
        );
      }),
    )
    .toBe(true);
  await page
    .locator("summary")
    .filter({ hasText: /^Equipment$/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Equipment", exact: true }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Expression$/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Equipment", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("combobox", { name: "Expression", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Exit full screen", exact: true })
    .click();
  await expect(world).not.toHaveClass(/team-world--fullscreen/);
  for (const size of [
    { width: 320, height: 720 },
    { width: 740, height: 360 },
  ]) {
    await page.setViewportSize(size);
    await page
      .getByRole("button", { name: "Full screen", exact: true })
      .click();
    const controls = await page.locator(".team-world-dock").boundingBox();
    expect(controls!.x).toBeGreaterThanOrEqual(0);
    expect(controls!.x + controls!.width).toBeLessThanOrEqual(size.width);
    await page
      .getByRole("button", { name: "Exit full screen", exact: true })
      .click();
  }
});

test("idle overlays avoid frame-by-frame DOM churn and fullscreen respects the raster budget", async ({
  page,
}) => {
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await page.waitForTimeout(500);
  const mutations = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let count = 0;
        const observer = new MutationObserver(
          (records) => (count += records.length),
        );
        observer.observe(document.querySelector(".team-world-dock")!, {
          subtree: true,
          attributes: true,
          childList: true,
          characterData: true,
        });
        setTimeout(() => {
          observer.disconnect();
          resolve(count);
        }, 1000);
      }),
  );
  expect(mutations).toBeLessThan(5);
  const pixels = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height);
  expect(pixels).toBeLessThanOrEqual(1_500_001);
});
